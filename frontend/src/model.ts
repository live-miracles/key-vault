// The shapes the screens work with, and the questions they ask of the loaded data. Pure: it
// takes the data as a parameter and holds no state of its own.

import type {
    AppData,
    EventView,
    InputView,
    KeyView,
    RoleView,
} from '../../supabase/functions/_shared/types.ts';

// Something being saved is shown at once, before the server has answered.
export type Pending<T> = T & { pending?: boolean };
export type EventItem = Pending<EventView>;
export type RoleItem = Pending<RoleView>;
export type InputItem = Pending<InputView>;
export type KeyItem = Pending<KeyView>;

export interface LoadedData extends AppData {
    events: EventItem[];
    roles: RoleItem[];
    inputs: InputItem[];
    keys: KeyItem[];
}

export function emptyData(): LoadedData {
    return {
        userEmail: '',
        isAppOwner: false,
        canCreateEvents: false,
        events: [],
        roles: [],
        inputs: [],
        keys: [],
    };
}

// The inputs of one event, in the order its admins gave them; with no event, every input.
export function inputsOf(data: Pick<LoadedData, 'inputs'>, eventId: string | null = null) {
    return [...data.inputs]
        .filter((input) => input.id && input.name && (!eventId || input.event === eventId))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

export function inputName(data: Pick<LoadedData, 'inputs'>, id: string): string {
    return data.inputs.find((input) => input.id === id)?.name || id;
}

export function hasMissingInput(data: Pick<LoadedData, 'inputs'>, id: string): boolean {
    return !data.inputs.some((input) => input.id === id);
}

// Where an input comes in the list; one that is not there goes last.
export function inputPosition(data: Pick<LoadedData, 'inputs'>, id: string): number {
    const input = data.inputs.find((item) => item.id === id);
    return input ? input.position : Number.MAX_SAFE_INTEGER;
}

// The destinations of one event, grouped by input in the event's own input order.
export function eventKeysOf(data: LoadedData, eventId: string | null): KeyItem[] {
    return data.keys
        .filter((k) => k.event === eventId)
        .sort(
            (a, b) =>
                inputPosition(data, a.input) - inputPosition(data, b.input) ||
                inputName(data, a.input).localeCompare(inputName(data, b.input)),
        );
}

export const ROLE_LABELS: Record<string, string> = {
    viewer: 'Viewer',
    editor: 'Editor',
    admin: 'Admin',
    owner: 'Owner',
};
