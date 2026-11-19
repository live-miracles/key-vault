// The shapes Key Vault's server and browser share: what is stored, what the browser is sent,
// what it may ask for, and the error every operation fails with. Only erasable TypeScript
// syntax is used so Node, Deno and the bundler all read it as it is.

// What a person can be given in one event. Admins and owners are not here: they have access to
// every event, so they are listed once for the whole app (see AdminRow).
export const ROLE_TYPES = ['viewer', 'editor'] as const;
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

// An admin: someone with access to every event, added in the app. The owners named in
// KEY_VAULT_OWNER_EMAILS have no row: they are set on the server and cannot be changed here.
export interface AdminRow {
    id: string;
    email: string;
    // Who added them (an email), or '' for one moved over from the old per-event admin roles.
    addedBy: string;
}

export interface Data {
    events: EventRow[];
    roles: RoleRow[];
    inputs: InputRow[];
    keys: KeyRow[];
    admins: AdminRow[];
}

// Changes are kept this long. A deleted event is kept as long, in the trash, so the event and
// its history go together.
export const HISTORY_DAYS = 30;
export const TRASH_DAYS = HISTORY_DAYS;

// An event in the trash, as the store holds it: when and by whom it was deleted (ISO time and
// email), and how much it holds.
export interface TrashRow {
    id: string;
    name: string;
    deletedAt: string;
    deletedBy: string;
    destinations: number;
    inputs: number;
}

// ===== History =====
// A log of changes, not snapshots: one row per row that was added, edited or deleted. An earlier
// version of an event is worked out from it (see history.ts). Only admins can read it.

export const CHANGE_KINDS = ['event', 'input', 'key', 'role', 'admin'] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];
// `restored` is only for an event brought back from the trash.
export type ChangeAction = 'added' | 'edited' | 'deleted' | 'restored';

// A row as it was recorded, in the shape of its own type above (EventRow, InputRow, KeyRow,
// RoleRow or AdminRow). For an event deleted or brought back from the trash it is
// `{ name, destinations, inputs }`: its rows stay where they are.
export type RowSnapshot = Record<string, any>;

export interface ChangeRow {
    // Also the order of the changes: a bigger id is a later change.
    id: number;
    // ISO time.
    at: string;
    // Email of whoever did it.
    by: string;
    // The event it happened in; null for a change to the admins.
    event: string | null;
    kind: ChangeKind;
    // The id of the event, input, key, role or admin.
    rowId: string;
    action: ChangeAction;
    // Null when the row was added.
    before: RowSnapshot | null;
    // Null when the row was deleted.
    after: RowSnapshot | null;
    // The same for every row of one version restore.
    batch: string | null;
    // For a version restore: the change it went back to.
    restoredTo: number | null;
}

// What `recordChanges` is given: the store adds the id (and the time is passed with them all).
export type NewChange = Omit<ChangeRow, 'id' | 'at'>;

// An event as it was at some point, or is now.
export interface EventState {
    event: EventRow;
    inputs: InputRow[];
    keys: KeyRow[];
    roles: RoleRow[];
}

// How a row of an event differs now from an earlier version. `status` is relative to now:
// `added` means added since then, so restoring that version removes it.
export interface RowDiff {
    kind: 'event' | 'input' | 'key' | 'role';
    rowId: string;
    status: 'added' | 'deleted' | 'changed';
    // The row in the earlier version, null if it was added since.
    then: RowSnapshot | null;
    // The row now, null if it was deleted since.
    now: RowSnapshot | null;
    // The fields that differ.
    fields: string[];
}

// What turns an event into one of its earlier versions, so the store can apply it in one
// transaction. Only the rows that differ are listed.
export interface VersionSteps {
    // The name to give the event, or null when it is unchanged.
    eventName: string | null;
    upsertInputs: InputRow[];
    deleteInputs: string[];
    upsertKeys: KeyRow[];
    deleteKeys: string[];
    upsertRoles: RoleRow[];
    deleteRoles: string[];
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

// What the trash shows for each deleted event, with the time it is removed for good.
export interface TrashedEvent extends TrashRow {
    expiresAt: string;
}

// Someone with access to every event, so each event's Share list can show them.
export interface EveryEventPerson {
    email: string;
    // Named on the server rather than added in the app.
    owner: boolean;
}

// A change with the names the History dialog needs to say what happened.
export interface ChangeView extends ChangeRow {
    // The event's current name, or the last one known; '' when it is not known any more.
    eventName: string;
    // The destination, input or event, or the person's email, from `after ?? before`.
    rowName: string;
    // For a version restore: when the change it went back to was made, or null for the start
    // of history (and for a change that is not kept any more).
    restoredToAt: string | null;
}

export interface AppData {
    userEmail: string;
    isAppOwner: boolean;
    canCreateEvents: boolean;
    // See the trash and restore events from it.
    canRestoreEvents: boolean;
    // Read the history of changes, compare an event with an earlier version and restore it.
    canSeeHistory: boolean;
    // See the admins, and add or remove them.
    canManageAdmins: boolean;
    // Everyone who has access to every event. Empty for someone who sees no Share list.
    everyEvent: EveryEventPerson[];
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
    addEvent: { input: { name: string }; output: EventView };
    editEvent: { input: { id: string; name: string }; output: { id: string; name: string } };
    // Moves the event to the trash.
    deleteEvent: { input: { id: string }; output: void };
    getTrash: { input: void; output: TrashedEvent[] };
    restoreEvent: { input: { id: string }; output: { id: string; name: string } };
    // Admins only. Newest first, paged by id: `before` is the smallest id already shown. With
    // no `event` it is every event and the admins; `kind` narrows it. Default limit 200.
    getHistory: {
        input: { event?: string; kind?: ChangeKind; before?: number; limit?: number };
        output: ChangeView[];
    };
    // The event as it was right after change `atChange` (0: before its oldest recorded change),
    // and how it differs from now.
    compareEvent: {
        input: { event: string; atChange: number };
        output: { then: EventState; diff: RowDiff[] };
    };
    // Makes the event equal to that version, and records it as one entry.
    restoreEventVersion: {
        input: { event: string; atChange: number };
        output: { changed: number };
    };
    // The owners set on the server (fixed) and the admins added in the app.
    getAdmins: { input: void; output: { owners: string[]; admins: AdminRow[] } };
    addAdmin: { input: { email: string }; output: AdminRow };
    removeAdmin: { input: { id: string }; output: void };
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
