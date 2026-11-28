// A Store that keeps everything in memory. The tests use it to run the real operations
// without a database, and the demo site uses it to run them in the browser, so there is one
// implementation of the rules. It keeps the guarantees Postgres gives the real one: generated
// (random) ids, cascading deletes, and an input that a destination or role still uses cannot
// be deleted. Only erasable TypeScript syntax is used.

import type { Store } from './operations.ts';
import type { InstanceInfo, PipelineRow, StatusRow } from './status.ts';
import type { ChangeRow, Data, TrashRow } from './types.ts';

// A deleted event with everything it holds, set aside whole until it is restored or removed.
export interface TrashedBundle extends Omit<Data, 'events' | 'admins'> {
    event: Data['events'][number];
    deletedAt: string;
    deletedBy: string;
}

export interface MemoryState extends Data {
    trash: TrashedBundle[];
    // The history of changes, oldest first.
    changes: ChangeRow[];
    status: { rows: StatusRow[]; pipelines: PipelineRow[]; instances: InstanceInfo[] };
}

export interface MemoryStore extends Store {
    state: MemoryState;
}

export function createMemoryStore(initial: Partial<MemoryState> = {}): MemoryStore {
    const state: MemoryState = {
        events: [],
        roles: [],
        inputs: [],
        keys: [],
        admins: [],
        trash: [],
        changes: [],
        status: { rows: [], pipelines: [], instances: [] },
        ...structuredClone(initial),
    };
    const nextId = () => crypto.randomUUID();
    // Like an identity column: ever rising, never reused.
    let lastChangeId = Math.max(0, ...state.changes.map((c) => c.id));
    const find = <T extends { id: string }>(list: T[], id: string): T => {
        const item = list.find((entry) => entry.id === id);
        if (!item) throw new Error('not found');
        return item;
    };

    return {
        state,
        async load() {
            return structuredClone({
                events: state.events,
                roles: state.roles,
                inputs: state.inputs,
                keys: state.keys,
                admins: state.admins,
            });
        },
        async loadStatus() {
            return structuredClone(state.status);
        },
        async createEvent(name) {
            const event = { id: nextId(), name };
            state.events.push(event);
            return structuredClone(event);
        },
        async updateEvent(id, name) {
            find(state.events, id).name = name;
        },
        async trashEvent(id, deletedBy, deletedAt) {
            const event = find(state.events, id);
            const own = <T extends { event: string }>(list: T[]) =>
                list.filter((x) => x.event === id);
            state.trash.push({
                event,
                roles: own(state.roles),
                inputs: own(state.inputs),
                keys: own(state.keys),
                deletedAt,
                deletedBy,
            });
            state.events = state.events.filter((e) => e.id !== id);
            state.roles = state.roles.filter((r) => r.event !== id);
            state.keys = state.keys.filter((k) => k.event !== id);
            state.inputs = state.inputs.filter((i) => i.event !== id);
        },
        async restoreEvent(id) {
            const bundle = state.trash.find((b) => b.event.id === id);
            if (!bundle) throw new Error('not found');
            state.trash = state.trash.filter((b) => b.event.id !== id);
            state.events.push(bundle.event);
            state.roles.push(...bundle.roles);
            state.inputs.push(...bundle.inputs);
            state.keys.push(...bundle.keys);
        },
        async loadTrash() {
            return state.trash.map((b): TrashRow => ({
                id: b.event.id,
                name: b.event.name,
                deletedAt: b.deletedAt,
                deletedBy: b.deletedBy,
                destinations: b.keys.length,
                inputs: b.inputs.length,
            }));
        },
        async purgeTrash(before) {
            state.trash = state.trash.filter((b) => Date.parse(b.deletedAt) >= Date.parse(before));
        },
        async createAdmin(email, addedBy) {
            const created = { id: nextId(), email, addedBy };
            state.admins.push(created);
            return structuredClone(created);
        },
        async deleteAdmin(id) {
            state.admins = state.admins.filter((a) => a.id !== id);
        },
        async createRole(role) {
            const created = { id: nextId(), ...role };
            state.roles.push(created);
            return structuredClone(created);
        },
        async updateRole(id, role) {
            Object.assign(find(state.roles, id), role);
        },
        async deleteRole(id) {
            state.roles = state.roles.filter((r) => r.id !== id);
        },
        async createInput(event, name) {
            const own = state.inputs.filter((i) => i.event === event);
            const position = Math.max(0, ...own.map((i) => i.position)) + 1;
            const created = { id: nextId(), event, name, position };
            state.inputs.push(created);
            return structuredClone(created);
        },
        async updateInput(id, name) {
            find(state.inputs, id).name = name;
        },
        async reorderInputs(_event, ids) {
            ids.forEach((id, index) => {
                find(state.inputs, id).position = index + 1;
            });
            state.inputs.sort((a, b) => a.position - b.position);
        },
        async deleteInput(id) {
            if (state.keys.some((k) => k.input === id) || state.roles.some((r) => r.input === id)) {
                throw new Error('foreign key');
            }
            state.inputs = state.inputs.filter((i) => i.id !== id);
        },
        async createKey(key) {
            const created = { id: nextId(), ...key };
            state.keys.push(created);
            return structuredClone(created);
        },
        async updateKey(id, key) {
            Object.assign(find(state.keys, id), key);
        },
        async deleteKey(id) {
            state.keys = state.keys.filter((k) => k.id !== id);
        },

        async recordChanges(changes, at) {
            for (const change of changes) {
                state.changes.push({ ...structuredClone(change), id: ++lastChangeId, at });
            }
        },
        async loadChanges({ event, kind, before, after, limit }) {
            const found = state.changes
                .filter(
                    (c) =>
                        (event === undefined || c.event === event) &&
                        (kind === undefined || c.kind === kind) &&
                        (before === undefined || c.id < before) &&
                        (after === undefined || c.id > after),
                )
                .sort((a, b) => b.id - a.id);
            return structuredClone(limit === undefined ? found : found.slice(0, limit));
        },
        async purgeChanges(before) {
            state.changes = state.changes.filter((c) => Date.parse(c.at) >= Date.parse(before));
        },
        // The steps run in the order the SQL function runs them, on a copy that replaces the
        // real rows only when all of them worked, and with the guarantees Postgres gives: a
        // destination or role needs its input, an input in use cannot be deleted, and an event
        // cannot have two inputs of one name.
        async applyEventVersion(event, steps, changes, at) {
            const draft = structuredClone({
                events: state.events,
                inputs: state.inputs,
                keys: state.keys,
                roles: state.roles,
            });
            // People's access is not part of a version: a restore leaves the roles alone.
            const row = find(draft.events, event);
            const upsert = <T extends { id: string }>(list: T[], item: T): T[] => {
                const index = list.findIndex((entry) => entry.id === item.id);
                if (index === -1) return [...list, structuredClone(item)];
                if ((list[index] as { event?: string }).event !== event)
                    throw new Error('other event');
                return list.map((entry, i) => (i === index ? structuredClone(item) : entry));
            };
            const without = <T extends { id: string }>(list: T[], ids: string[]): T[] =>
                list.filter((entry) => !ids.includes(entry.id));

            for (const input of steps.upsertInputs) {
                draft.inputs = upsert(draft.inputs, { ...input, name: `restoring ${input.id}` });
            }
            for (const key of steps.upsertKeys) draft.keys = upsert(draft.keys, key);
            draft.keys = without(draft.keys, steps.deleteKeys);
            draft.inputs = without(draft.inputs, steps.deleteInputs);
            for (const input of steps.upsertInputs) {
                Object.assign(find(draft.inputs, input.id), {
                    name: input.name,
                    position: input.position,
                });
            }
            if (steps.eventName !== null) row.name = steps.eventName;

            const exists = (id: string | null) =>
                id === null || draft.inputs.some((i) => i.id === id);
            if (
                !draft.keys.every((k) => exists(k.input)) ||
                !draft.roles.every((r) => exists(r.input))
            ) {
                throw new Error('foreign key');
            }
            const names = draft.inputs
                .filter((i) => i.event === event)
                .map((i) => i.name.toLowerCase());
            if (new Set(names).size !== names.length) throw new Error('duplicate input name');

            draft.inputs.sort((a, b) => a.position - b.position);
            state.events = draft.events;
            state.inputs = draft.inputs;
            state.keys = draft.keys;
            state.roles = draft.roles;
            for (const change of changes) {
                state.changes.push({ ...structuredClone(change), id: ++lastChangeId, at });
            }
        },
    };
}
