// An in-memory Store for testing the operations without a database. It keeps the
// guarantees the real one gets from Postgres: generated ids, cascading deletes, and a
// language that is still used by a key cannot be deleted.

export function createMemoryStore(initial = {}) {
    const state = {
        events: [],
        roles: [],
        languages: [],
        keys: [],
        status: { rows: [], instances: [] },
        ...structuredClone(initial),
    };
    const counters = { E: 100, R: 100, K: 100 };
    const nextId = (letter) => `${letter}${++counters[letter]}`;
    const find = (list, id) => list.find((item) => item.id === id);

    return {
        state,
        async load() {
            return structuredClone({
                events: state.events,
                roles: state.roles,
                languages: state.languages,
                keys: state.keys,
            });
        },
        async loadStatus() {
            return structuredClone(state.status);
        },
        async createEvent(name, adminEmail) {
            const event = { id: nextId('E'), name };
            state.events.push(event);
            let adminRole = null;
            if (adminEmail) {
                adminRole = {
                    id: nextId('R'),
                    event: event.id,
                    email: adminEmail,
                    type: '2',
                    language: '*',
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
        },
        async createRole(role) {
            const created = { id: nextId('R'), ...role };
            state.roles.push(created);
            return structuredClone(created);
        },
        async updateRole(id, role) {
            Object.assign(find(state.roles, id), role);
        },
        async deleteRole(id) {
            state.roles = state.roles.filter((r) => r.id !== id);
        },
        async createLanguage(language) {
            const order = Math.max(0, ...state.languages.map((l) => Number(l.order))) + 1;
            const created = { ...language, order: String(order) };
            state.languages.push(created);
            return structuredClone(created);
        },
        async updateLanguage(id, name) {
            find(state.languages, id).name = name;
        },
        async reorderLanguages(ids) {
            ids.forEach((id, index) => {
                find(state.languages, id).order = String(index + 1);
            });
        },
        async deleteLanguage(id) {
            if (state.keys.some((k) => k.language === id)) throw new Error('foreign key');
            state.languages = state.languages.filter((l) => l.id !== id);
        },
        async createKey(key) {
            const created = { id: nextId('K'), ...key };
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
