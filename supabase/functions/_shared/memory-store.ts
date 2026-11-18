// A Store that keeps everything in memory. The tests use it to run the real operations
// without a database, and the demo site uses it to run them in the browser, so there is one
// implementation of the rules. It keeps the guarantees Postgres gives the real one: generated
// (random) ids, cascading deletes, and an input that a destination or role still uses cannot
// be deleted. Only erasable TypeScript syntax is used.

import type { Store } from './operations.ts';
import type { InstanceInfo, PipelineRow, StatusRow } from './status.ts';
import type { Data } from './types.ts';

export interface MemoryState extends Data {
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
        status: { rows: [], pipelines: [], instances: [] },
        ...structuredClone(initial),
    };
    const nextId = () => crypto.randomUUID();
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
            });
        },
        async loadStatus() {
            return structuredClone(state.status);
        },
        async createEvent(name, adminEmail) {
            const event = { id: nextId(), name };
            state.events.push(event);
            let adminRole = null;
            if (adminEmail) {
                adminRole = {
                    id: nextId(),
                    event: event.id,
                    email: adminEmail,
                    type: 'admin' as const,
                    input: null,
                };
                state.roles.push(adminRole);
            }
            return structuredClone({ event, adminRole });
        },
        async updateEvent(id, name) {
            find(state.events, id).name = name;
        },
        async deleteEvent(id) {
            state.events = state.events.filter((e) => e.id !== id);
            state.roles = state.roles.filter((r) => r.event !== id);
            state.keys = state.keys.filter((k) => k.event !== id);
            state.inputs = state.inputs.filter((i) => i.event !== id);
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
    };
}
