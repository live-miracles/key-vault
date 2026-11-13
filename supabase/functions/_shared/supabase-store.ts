import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Data, EventItem, KeyItem, LanguageItem, RoleItem, Store } from './operations.ts';
import type { StatusRow } from './status.ts';

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

// E2 before E10: ids are a letter and a number.
function byIdNumber(a: { id: string }, b: { id: string }): number {
    return Number(a.id.slice(1)) - Number(b.id.slice(1));
}

const toRole = (r: any): RoleItem => ({
    id: r.id,
    event: r.event_id,
    email: String(r.email).toLowerCase(),
    type: r.type,
    language: r.language,
});

export function createSupabaseStore(db: SupabaseClient): Store {
    return {
        async load(): Promise<Data> {
            const [events, roles, languages, keys] = await Promise.all([
                fetchAll((from, to) =>
                    db.from('events').select('id, name').order('id').range(from, to),
                ),
                fetchAll((from, to) =>
                    db
                        .from('roles')
                        .select('id, event_id, email, type, language')
                        .order('id')
                        .range(from, to),
                ),
                fetchAll((from, to) =>
                    db.from('languages').select('id, name, sort_order').order('id').range(from, to),
                ),
                fetchAll((from, to) =>
                    db
                        .from('keys')
                        .select(
                            'id, event_id, name, language, server, key, server2, key2, link, color_override, remarks',
                        )
                        .order('id')
                        .range(from, to),
                ),
            ]);
            return {
                events: (events as EventItem[]).sort(byIdNumber),
                roles: roles.map(toRole).sort(byIdNumber),
                languages: languages
                    .map((l): LanguageItem => ({
                        id: l.id,
                        name: l.name,
                        order: String(l.sort_order),
                    }))
                    .sort((a, b) => Number(a.order) - Number(b.order) || a.id.localeCompare(b.id)),
                keys: keys
                    .map((k): KeyItem => ({
                        id: k.id,
                        event: k.event_id,
                        name: k.name,
                        language: k.language,
                        server: k.server,
                        key: k.key,
                        server2: k.server2,
                        key2: k.key2,
                        link: k.link,
                        color: k.color_override,
                        remarks: k.remarks,
                    }))
                    .sort(byIdNumber),
            };
        },

        async loadStatus() {
            const [rows, instances] = await Promise.all([
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
                        language: role.language,
                    })
                    .select('id, event_id, email, type, language')
                    .single(),
            );
            return toRole(row);
        },
        async updateRole(id, role) {
            check(
                await db
                    .from('roles')
                    .update({ email: role.email, type: role.type, language: role.language })
                    .eq('id', id)
                    .select('id')
                    .single(),
            );
        },
        async deleteRole(id) {
            check(await db.from('roles').delete().eq('id', id).select('id').single());
        },

        async createLanguage(language) {
            return check(
                await db.rpc('create_language', { p_id: language.id, p_name: language.name }),
            ) as LanguageItem;
        },
        async updateLanguage(id, name) {
            check(await db.from('languages').update({ name }).eq('id', id).select('id').single());
        },
        async reorderLanguages(ids) {
            check(await db.rpc('reorder_languages', { p_ids: ids }));
        },
        async deleteLanguage(id) {
            check(await db.from('languages').delete().eq('id', id).select('id').single());
        },

        async createKey(key) {
            const row = check(
                await db
                    .from('keys')
                    .insert({
                        event_id: key.event,
                        name: key.name,
                        language: key.language,
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
                        language: key.language,
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
