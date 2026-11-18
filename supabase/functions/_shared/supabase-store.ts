import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Store } from './operations.ts';
import type { PipelineRow, StatusRow } from './status.ts';
import type { Data, EventRow, InputRow, KeyRow, RoleRow } from './types.ts';

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

// Oldest first. Ids are random, so the creation time orders rows.
function byCreated(a: { created_at: string; id: string }, b: { created_at: string; id: string }) {
    return Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id);
}

const toRole = (r: any): RoleRow => ({
    id: r.id,
    event: r.event_id,
    email: String(r.email).toLowerCase(),
    type: r.type,
    input: r.input_id,
});

const toInput = (i: any): InputRow => ({
    id: i.id,
    event: i.event_id,
    name: i.name,
    position: i.sort_order,
});

const toKey = (k: any): KeyRow => ({
    id: k.id,
    event: k.event_id,
    name: k.name,
    input: k.input_id,
    platform: k.platform,
    streamKey: k.stream_key,
    backupPlatform: k.backup_platform,
    backupStreamKey: k.backup_stream_key,
    link: k.link,
    remarks: k.remarks,
    updatedBy: k.updated_by,
    updatedAction: k.updated_action,
    updatedAt: k.updated_by ? new Date(k.updated_at).toISOString() : '',
});

const KEY_COLUMNS =
    'id, event_id, name, input_id, platform, stream_key, backup_platform, backup_stream_key, link, remarks, created_at, updated_by, updated_action, updated_at';

function keyColumns(key: Omit<KeyRow, 'id' | 'event'>) {
    return {
        name: key.name,
        input_id: key.input,
        platform: key.platform,
        stream_key: key.streamKey,
        backup_platform: key.backupPlatform,
        backup_stream_key: key.backupStreamKey,
        link: key.link,
        remarks: key.remarks,
        updated_by: key.updatedBy,
        updated_action: key.updatedAction,
        updated_at: key.updatedAt,
    };
}

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
                        .select('id, event_id, email, type, input_id, created_at')
                        .order('id')
                        .range(from, to),
                ),
                fetchAll((from, to) =>
                    db
                        .from('inputs')
                        .select('id, event_id, name, sort_order')
                        .order('id')
                        .range(from, to),
                ),
                fetchAll((from, to) =>
                    db.from('keys').select(KEY_COLUMNS).order('id').range(from, to),
                ),
            ]);
            return {
                events: [...events]
                    .sort(byCreated)
                    .map((e): EventRow => ({ id: e.id, name: e.name })),
                roles: [...roles].sort(byCreated).map(toRole),
                inputs: inputs
                    .map(toInput)
                    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
                keys: [...keys].sort(byCreated).map(toKey),
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
            ) as { event: EventRow; adminRole: RoleRow | null };
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
                        input_id: role.input,
                    })
                    .select('id, event_id, email, type, input_id')
                    .single(),
            );
            return toRole(row);
        },
        async updateRole(id, role) {
            check(
                await db
                    .from('roles')
                    .update({ email: role.email, type: role.type, input_id: role.input })
                    .eq('id', id)
                    .select('id')
                    .single(),
            );
        },
        async deleteRole(id) {
            check(await db.from('roles').delete().eq('id', id).select('id').single());
        },

        async createInput(event, name) {
            return check(
                await db.rpc('create_input', { p_event_id: event, p_name: name }),
            ) as InputRow;
        },
        async updateInput(id, name) {
            check(await db.from('inputs').update({ name }).eq('id', id).select('id').single());
        },
        async reorderInputs(event, ids) {
            check(await db.rpc('reorder_inputs', { p_event_id: event, p_ids: ids }));
        },
        async deleteInput(id) {
            check(await db.from('inputs').delete().eq('id', id).select('id').single());
        },

        async createKey(key) {
            const row = check(
                await db
                    .from('keys')
                    .insert({ event_id: key.event, ...keyColumns(key) })
                    .select('id')
                    .single(),
            );
            return { ...key, id: row.id };
        },
        async updateKey(id, key) {
            check(await db.from('keys').update(keyColumns(key)).eq('id', id).select('id').single());
        },
        async deleteKey(id) {
            check(await db.from('keys').delete().eq('id', id).select('id').single());
        },
    };
}
