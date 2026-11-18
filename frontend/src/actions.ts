// Everything a person can change, as one call each. Each shows the change at once through the
// store, sends it, and puts in the server's answer; the store takes it back if the server says
// no. The screens never copy that pattern: they ask for the change and get whether it worked.

import type { KeyFields, RoleType } from '../../supabase/functions/_shared/types.ts';
import { newTempId } from './store.ts';
import type { AppStore } from './store.ts';
import type { EventItem, InputItem, KeyItem, RoleItem } from './model.ts';

// What an item that is still being saved may do: nothing yet, the server will say.
const NO_RIGHTS = {
    rename: false,
    delete: false,
    manageInputs: false,
    viewRoles: false,
    addRoleTypes: [] as RoleType[],
    addKeys: false,
    seeTechnicalStatus: false,
};

function replace<T extends { id: string }>(list: T[], oldId: string, item: T) {
    const index = list.findIndex((entry) => entry.id === oldId);
    if (index === -1) list.push(item);
    else list.splice(index, 1, item);
}

export interface RoleForm {
    id: string; // '' for a role being added
    event: string;
    email: string;
    type: RoleType;
    input: string | null;
}

export function createActions(app: AppStore) {
    const api = () => {
        if (!app.backend) throw new Error('The app has no backend yet.');
        return app.backend;
    };

    return {
        // ===== Events =====

        // Adds "Event N". `select` shows the new event: first under its stand-in id, then under
        // the real one.
        async addEvent(select: (eventId: string) => void): Promise<boolean> {
            const numbers = app.data.events
                .filter((e) => e.name.startsWith('Event '))
                .map((e) => parseInt(e.name.split(' ')[1], 10) || 0);
            const name = `Event ${Math.max(...numbers, 0) + 1}`;
            const tempId = newTempId();
            const outcome = await app.change(
                (data) => {
                    data.events.push({ id: tempId, name, can: NO_RIGHTS, pending: true });
                    select(tempId);
                },
                () => api().addEvent({ name }),
                (data, saved) => {
                    const { adminRole, ...event } = saved;
                    if (adminRole) data.roles.push(adminRole);
                    replace(data.events, tempId, event as EventItem);
                    select(saved.id);
                },
            );
            return outcome.ok;
        },

        async renameEvent(id: string, name: string): Promise<boolean> {
            const outcome = await app.change(
                (data) => {
                    const event = data.events.find((e) => e.id === id);
                    if (event) event.name = name;
                },
                () => api().editEvent({ id, name }),
                (data, saved) => {
                    const event = data.events.find((e) => e.id === id);
                    if (event) event.name = saved.name;
                },
            );
            return outcome.ok;
        },

        // `select` shows the event that is left, if the deleted one was open.
        async deleteEvent(id: string, select: (nextEventId: string) => void): Promise<boolean> {
            const outcome = await app.change(
                (data) => {
                    data.events = data.events.filter((e) => e.id !== id);
                    data.roles = data.roles.filter((r) => r.event !== id);
                    data.inputs = data.inputs.filter((i) => i.event !== id);
                    data.keys = data.keys.filter((k) => k.event !== id);
                    select(data.events[0]?.id ?? '');
                },
                () => api().deleteEvent({ id }),
            );
            return outcome.ok;
        },

        // ===== Roles =====

        async saveRole(form: RoleForm): Promise<boolean> {
            const isAdd = form.id === '';
            const tempId = newTempId();
            const fields = { email: form.email, type: form.type, input: form.input };
            const outcome = await app.change(
                (data) => {
                    if (isAdd) {
                        data.roles.push({
                            id: tempId,
                            event: form.event,
                            ...fields,
                            canChange: true,
                            pending: true,
                        } as RoleItem);
                    } else {
                        const role = data.roles.find((r) => r.id === form.id);
                        if (role) Object.assign(role, fields);
                    }
                },
                () =>
                    isAdd
                        ? api().addRole({ event: form.event, ...fields })
                        : api().editRole({ id: form.id, ...fields }),
                (data, saved) => replace(data.roles, isAdd ? tempId : form.id, saved),
            );
            return outcome.ok;
        },

        async removeRole(id: string): Promise<boolean> {
            const outcome = await app.change(
                (data) => {
                    data.roles = data.roles.filter((r) => r.id !== id);
                },
                () => api().deleteRole({ id }),
            );
            return outcome.ok;
        },

        // ===== Inputs =====

        // `onSaved` opens the new input, once the server has made its id.
        async addInput(
            event: string,
            name: string,
            onSaved: (inputId: string) => void = () => {},
        ): Promise<boolean> {
            const tempId = newTempId();
            const outcome = await app.change(
                (data) => {
                    const own = data.inputs.filter((i) => i.event === event);
                    data.inputs.push({
                        id: tempId,
                        event,
                        name,
                        position: Math.max(0, ...own.map((i) => i.position)) + 1,
                        canAddKeys: true,
                        pending: true,
                    } as InputItem);
                },
                () => api().addInput({ event, name }),
                (data, saved) => {
                    replace(data.inputs, tempId, saved);
                    onSaved(saved.id);
                },
            );
            return outcome.ok;
        },

        async renameInput(id: string, name: string): Promise<boolean> {
            const outcome = await app.change(
                (data) => {
                    const input = data.inputs.find((i) => i.id === id);
                    if (input) input.name = name;
                },
                () => api().editInput({ id, name }),
            );
            return outcome.ok;
        },

        // `ids` are the inputs of the event in the order to show them.
        async reorderInputs(event: string, ids: string[]): Promise<boolean> {
            const outcome = await app.change(
                (data) => {
                    ids.forEach((id, index) => {
                        const input = data.inputs.find((i) => i.id === id);
                        if (input) input.position = index + 1;
                    });
                },
                () => api().reorderInputs({ event, ids }),
            );
            return outcome.ok;
        },

        async removeInput(id: string): Promise<boolean> {
            const outcome = await app.change(
                (data) => {
                    data.inputs = data.inputs.filter((i) => i.id !== id);
                },
                () => api().deleteInput({ id }),
            );
            return outcome.ok;
        },

        // ===== Destinations =====

        // Adds a destination, or edits `id`.
        async saveKey(fields: KeyFields, id = ''): Promise<boolean> {
            const isAdd = id === '';
            const tempId = newTempId();
            const outcome = await app.change(
                (data) => {
                    if (isAdd) {
                        data.keys.push({
                            ...fields,
                            id: tempId,
                            updatedBy: '',
                            updatedAction: '',
                            updatedAt: '',
                            canChange: true,
                            pending: true,
                        } as KeyItem);
                    } else {
                        const key = data.keys.find((k) => k.id === id);
                        if (key) Object.assign(key, fields);
                    }
                },
                () => (isAdd ? api().addKey(fields) : api().editKey({ ...fields, id })),
                (data, saved) => replace(data.keys, isAdd ? tempId : id, saved),
            );
            return outcome.ok;
        },

        async removeKey(id: string): Promise<boolean> {
            const outcome = await app.change(
                (data) => {
                    data.keys = data.keys.filter((k) => k.id !== id);
                },
                () => api().deleteKey({ id }),
            );
            return outcome.ok;
        },
    };
}

export type Actions = ReturnType<typeof createActions>;
