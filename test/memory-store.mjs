// An in-memory Store for testing the operations without a database. It keeps the
// guarantees the real one gets from Postgres: generated (random) ids, cascading deletes, and a
// input that is still used by a key cannot be deleted. An input belongs to one event.

export function createMemoryStore(initial = {}) {
    const state = {
        events: [],
        roles: [],
        inputs: [],
        keys: [],
        status: { rows: [], pipelines: [], instances: [] },
        ...structuredClone(initial),
    };
    const nextId = () => crypto.randomUUID();
    const find = (list, id) => list.find((item) => item.id === id);

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
                    type: '2',
                    input: '*',
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
            const order = Math.max(0, ...own.map((i) => Number(i.order))) + 1;
            const created = { id: nextId(), event, name, order: String(order) };
            state.inputs.push(created);
            return structuredClone(created);
        },
        async updateInput(id, name) {
            find(state.inputs, id).name = name;
        },
        async reorderInputs(event, ids) {
            ids.forEach((id, index) => {
                find(state.inputs, id).order = String(index + 1);
            });
        },
        async deleteInput(id) {
            if (state.keys.some((k) => k.input === id)) throw new Error('foreign key');
            state.inputs = state.inputs.filter((l) => l.id !== id);
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
