// The shapes Key Vault's server and browser share: what is stored, what the browser is sent,
// what it may ask for, and the error every operation fails with. Only erasable TypeScript
// syntax is used so Node, Deno and the bundler all read it as it is.

export const ROLE_TYPES = ['viewer', 'editor', 'admin', 'owner'] as const;
export type RoleType = (typeof ROLE_TYPES)[number];

// ===== What is stored =====
// Ids are random UUIDs made by the database. Nothing here is ever typed or checked by a person.

export interface EventRow {
    id: string;
    name: string;
}

export interface RoleRow {
    id: string;
    event: string;
    email: string;
    type: RoleType;
    // The input this person may see or edit; null is every input of the event.
    input: string | null;
}

export interface InputRow {
    id: string;
    event: string;
    name: string;
    // 1, 2, 3 … in the order the event shows its inputs.
    position: number;
}

// A destination (`key` in the code and the database): one place an input goes live.
export interface KeyRow {
    id: string;
    event: string;
    name: string;
    input: string;
    platform: string;
    // The key the platform gave out. For "something else" and SRT it is the whole address.
    streamKey: string;
    backupPlatform: string;
    backupStreamKey: string;
    link: string;
    remarks: string;
    // Who last added or edited it, what they did, and when (ISO time). Empty for a
    // destination made before this was recorded.
    updatedBy: string;
    updatedAction: '' | 'added' | 'edited';
    updatedAt: string;
}

export interface Data {
    events: EventRow[];
    roles: RoleRow[];
    inputs: InputRow[];
    keys: KeyRow[];
}

// ===== What the browser is sent =====
// Each item says what the signed-in person may do with it, so the browser holds no rules.

export interface EventCan {
    rename: boolean;
    delete: boolean;
    manageInputs: boolean;
    // See who has access, and add people of these types.
    viewRoles: boolean;
    addRoleTypes: RoleType[];
    addKeys: boolean;
    // Read bunryu's technical detail (the redacted message) in the status hover.
    seeTechnicalStatus: boolean;
}

export interface EventView extends EventRow {
    can: EventCan;
}
export interface RoleView extends RoleRow {
    canChange: boolean;
}
export interface InputView extends InputRow {
    // Add destinations to this input.
    canAddKeys: boolean;
}
export interface KeyView extends KeyRow {
    canChange: boolean;
}

export interface AppData {
    userEmail: string;
    isAppOwner: boolean;
    canCreateEvents: boolean;
    events: EventView[];
    roles: RoleView[];
    inputs: InputView[];
    keys: KeyView[];
}

// ===== What the browser may ask for =====

export interface KeyFields {
    event: string;
    name: string;
    input: string;
    platform: string;
    streamKey: string;
    backupPlatform: string;
    backupStreamKey: string;
    link: string;
    remarks: string;
}

export interface Operations {
    getAllData: { input: void; output: AppData };
    getStatus: { input: void; output: import('./status.ts').StatusReport };
    getBunryuSettings: { input: void; output: { url: string; secret: string } };
    addEvent: { input: { name: string }; output: EventView & { adminRole?: RoleView } };
    editEvent: { input: { id: string; name: string }; output: { id: string; name: string } };
    deleteEvent: { input: { id: string }; output: void };
    addRole: {
        input: { event: string; email: string; type: RoleType; input: string | null };
        output: RoleView;
    };
    editRole: {
        input: { id: string; email: string; type: RoleType; input: string | null };
        output: RoleView;
    };
    deleteRole: { input: { id: string }; output: void };
    addInput: { input: { event: string; name: string }; output: InputView };
    editInput: { input: { id: string; name: string }; output: { id: string; name: string } };
    reorderInputs: { input: { event: string; ids: string[] }; output: void };
    deleteInput: { input: { id: string }; output: void };
    addKey: { input: KeyFields; output: KeyView };
    editKey: { input: KeyFields & { id: string }; output: KeyView };
    deleteKey: { input: { id: string }; output: void };
}

export type OperationName = keyof Operations;

// ===== Errors =====

// What went wrong, as a code the browser can act on and a sentence a person can read.
export type ApiErrorCode = 'invalid' | 'denied' | 'not_found' | 'conflict' | 'unavailable';

export const HTTP_STATUS: Record<ApiErrorCode, number> = {
    invalid: 400,
    denied: 403,
    not_found: 404,
    conflict: 409,
    unavailable: 503,
};

export class ApiError extends Error {
    code: ApiErrorCode;
    constructor(code: ApiErrorCode, message: string) {
        super(message);
        this.name = 'ApiError';
        this.code = code;
    }
}
