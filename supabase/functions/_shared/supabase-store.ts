import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Data, EventItem, KeyItem, InputItem, RoleItem, Store } from './operations.ts';
import type { PipelineRow, StatusRow } from './status.ts';

// The Store over Postgres, used by the `api` Edge Function with the service role. The
// operations have already checked who may do what, so this only reads and writes.

const PAGE_SIZE = 1000;

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
    if (result.error) throw new Error(result.error.message);
    return result.data as T;
}

// PostgREST cuts every response at the project's max rows (1000 by default) without an
// error, so a table that grows past it must be read page by page. `order` must be unique.
async function fetchAll(
    page: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
): Promise<any[]> {
    const rows: any[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
        const batch = check(await page(from, from + PAGE_SIZE - 1)) ?? [];
        rows.push(...batch);
        if (batch.length < PAGE_SIZE) return rows;
    }
}

// Oldest first. Ids are random, so the creation time orders rows; rows made in the same
// instant (an import) fall back to the id read as a natural number: E2 before E10.
function byCreated(a: { created_at: string; id: string }, b: { created_at: string; id: string }) {
    return (
        Date.parse(a.created_at) - Date.parse(b.created_at) ||
        a.id.localeCompare(b.id, 'en', { numeric: true })
    );
}

const toRole = (r: any): RoleItem => ({
    id: r.id,
    event: r.event_id,
    email: String(r.email).toLowerCase(),
    type: r.type,
    input: r.input,
});

export function createSupabaseStore(db: SupabaseClient): Store {
    return {
        async load(): Promise<Data> {
            const [events, roles, inputs, keys] = await Promise.all([
                fetchAll((from, to) =>
                    db.from('events').select('id, name, created_at').order('id').range(from, to),
                ),
                fetchAll((from, to) =>
                    db
                        .from('roles')
                        .select('id, event_id, email, type, input, created_at')
                        .order('id')
                        .range(from, to),
                ),
                fetchAll((from, to) =>
                    db.from('inputs').select('id, name, sort_order').order('id').range(from, to),
                ),
                fetchAll((from, to) =>
                    db
                        .from('keys')
                        .select(
                            'id, event_id, name, input, server, key, server2, key2, link, color_override, remarks, created_at',
                        )
                        .order('id')
                        .range(from, to),
                ),
            ]);
            return {
                events: [...events]
                    .sort(byCreated)
                    .map((e): EventItem => ({ id: e.id, name: e.name })),
                roles: [...roles].sort(byCreated).map(toRole),
                inputs: inputs
                    .map((l): InputItem => ({
                        id: l.id,
                        name: l.name,
                        order: String(l.sort_order),
                    }))
                    .sort((a, b) => Number(a.order) - Number(b.order) || a.id.localeCompare(b.id)),
                keys: [...keys].sort(byCreated).map((k): KeyItem => ({
                    id: k.id,
                    event: k.event_id,
                    name: k.name,
                    input: k.input,
                    server: k.server,
                    key: k.key,
                    server2: k.server2,
                    key2: k.key2,
                    link: k.link,
                    color: k.color_override,
                    remarks: k.remarks,
                })),
            };
        },

        async loadStatus() {
            const [rows, pipelines, instances] = await Promise.all([
                fetchAll((from, to) =>
                    db
                        .from('stream_outputs')
                        .select(
                            'id, instance, hash, pipeline, output, status, message, failures, stopped_after_failures, since_ms',
                        )
                        .order('id')
                        .range(from, to),
                ),
                fetchAll((from, to) =>
                    db
                        .from('stream_inputs')
                        .select('id, instance, pipeline, status, message, since_ms')
                        .order('id')
                        .range(from, to),
                ),
                fetchAll((from, to) =>
                    db
                        .from('ingest_instances')
                        .select('instance, last_seen_at')
                        .order('instance')
                        .range(from, to),
                ),
            ]);
            return {
                rows: rows.map((r): StatusRow => ({
                    instance: r.instance,
                    hash: r.hash,
                    pipeline: r.pipeline,
                    output: r.output,
                    status: r.status,
                    message: r.message,
                    failures: r.failures,
                    stoppedAfterFailures: r.stopped_after_failures,
                    sinceMs: Number(r.since_ms),
                })),
                pipelines: pipelines.map((i): PipelineRow => ({
                    instance: i.instance,
                    pipeline: i.pipeline,
                    status: i.status,
                    message: i.message,
                    sinceMs: Number(i.since_ms),
                })),
                instances: instances.map((i) => ({
                    instance: i.instance,
                    lastSeenAt: i.last_seen_at,
                })),
            };
        },

        async createEvent(name, adminEmail) {
            const created = check(
                await db.rpc('create_event', { p_name: name, p_admin_email: adminEmail }),
            ) as { event: EventItem; adminRole: RoleItem | null };
            return created;
        },
        async updateEvent(id, name) {
            check(await db.from('events').update({ name }).eq('id', id).select('id').single());
        },
        async deleteEvent(id) {
            check(await db.from('events').delete().eq('id', id).select('id').single());
        },

        async createRole(role) {
            const row = check(
                await db
                    .from('roles')
                    .insert({
                        event_id: role.event,
                        email: role.email,
                        type: role.type,
                        input: role.input,
                    })
                    .select('id, event_id, email, type, input')
                    .single(),
            );
            return toRole(row);
        },
        async updateRole(id, role) {
            check(
                await db
                    .from('roles')
                    .update({ email: role.email, type: role.type, input: role.input })
                    .eq('id', id)
                    .select('id')
                    .single(),
            );
        },
        async deleteRole(id) {
            check(await db.from('roles').delete().eq('id', id).select('id').single());
        },

        async createInput(name) {
            return check(await db.rpc('create_input', { p_name: name })) as InputItem;
        },
        async updateInput(id, name) {
            check(await db.from('inputs').update({ name }).eq('id', id).select('id').single());
        },
        async reorderInputs(ids) {
            check(await db.rpc('reorder_inputs', { p_ids: ids }));
        },
        async deleteInput(id) {
            check(await db.from('inputs').delete().eq('id', id).select('id').single());
        },

        async createKey(key) {
            const row = check(
                await db
                    .from('keys')
                    .insert({
                        event_id: key.event,
                        name: key.name,
                        input: key.input,
                        server: key.server,
                        key: key.key,
                        server2: key.server2,
                        key2: key.key2,
                        link: key.link,
                        color_override: key.color,
                        remarks: key.remarks,
                    })
                    .select('id')
                    .single(),
            );
            return { ...key, id: row.id };
        },
        async updateKey(id, key) {
            check(
                await db
                    .from('keys')
                    .update({
                        name: key.name,
                        input: key.input,
                        server: key.server,
                        key: key.key,
                        server2: key.server2,
                        key2: key.key2,
                        link: key.link,
                        color_override: key.color,
                        remarks: key.remarks,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', id)
                    .select('id')
                    .single(),
            );
        },
        async deleteKey(id) {
            check(await db.from('keys').delete().eq('id', id).select('id').single());
        },
    };
}
