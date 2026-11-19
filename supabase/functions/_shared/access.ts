// Who may do what in Key Vault. The server is the only place these rules live: it checks them
// before every change, and it tells the browser the result (the `can` flags on what it sends),
// so the screens only show or hide buttons and never work a rule out themselves.
//
// Three levels of people:
// - Owners are named in KEY_VAULT_OWNER_EMAILS. Nothing in the app adds or removes them. They
//   can do everything an admin can, and also open bunryu's settings and read its technical detail.
// - Admins are added in the app. They have access to every event: they create, rename and
//   delete events, restore them from the trash, manage inputs and people, and add or remove
//   other admins.
// - Everyone else has a role in an event, viewer or editor, which can be limited to one input.
//
// Only erasable TypeScript syntax is used so Node, Deno and the bundler all read this as it is.

import { ROLE_TYPES } from './types.ts';
import type { EventCan, RoleRow, RoleType } from './types.ts';

// How much of the app someone has, apart from their roles in single events.
export type Standing = 'owner' | 'admin' | null;

export interface Access {
    // An owner or an admin: full access to every event.
    isAdmin(): boolean;
    canCreateEvent(): boolean;
    canViewEvent(event: string): boolean;
    // Rename or delete an event.
    canChangeEvent(event: string): boolean;
    // Add, rename, reorder and delete an event's inputs.
    canManageInputs(event: string): boolean;
    canViewRoles(event: string): boolean;
    canAddRole(event: string): boolean;
    // Edit or remove someone's role.
    canChangeRole(event: string): boolean;
    canViewKey(event: string, input: string): boolean;
    // Add, edit or delete a destination of this input; with no input, in any input.
    canChangeKey(event: string, input: string | null): boolean;
    // See the admins, and add or remove them.
    canManageAdmins(): boolean;
    // See the trash and restore a deleted event.
    canRestoreEvents(): boolean;
    // Read the history of changes, compare an event with an earlier version and restore it.
    canSeeHistory(): boolean;
    // Read bunryu's technical detail on a destination's status (owners only).
    canSeeTechnicalStatus(event: string): boolean;
    // Everything the browser needs to know about an event.
    describeEvent(event: string): EventCan;
}

export function createAccess(
    email: string,
    standing: Standing,
    roles: Pick<RoleRow, 'event' | 'email' | 'type' | 'input'>[],
): Access {
    const isAdmin = standing !== null;
    const mine = roles.filter((r) => r.email === email);
    const hasRole = (event: string, type: RoleType, input: string | null) =>
        mine.some(
            (r) =>
                r.event === event &&
                r.type === type &&
                (r.input === null || input === null || r.input === input),
        );

    const canViewEvent = (event: string) => isAdmin || mine.some((r) => r.event === event);
    const isEditor = (event: string) =>
        isAdmin || mine.some((r) => r.event === event && r.type === 'editor');

    const access: Access = {
        isAdmin: () => isAdmin,
        canCreateEvent: () => isAdmin,
        canViewEvent,
        canChangeEvent: () => isAdmin,
        canManageInputs: () => isAdmin,
        canViewRoles: isEditor,
        canAddRole: () => isAdmin,
        canChangeRole: () => isAdmin,
        canViewKey: (event, input) =>
            isAdmin || hasRole(event, 'editor', input) || hasRole(event, 'viewer', input),
        canChangeKey: (event, input) => isAdmin || hasRole(event, 'editor', input),
        canManageAdmins: () => isAdmin,
        canRestoreEvents: () => isAdmin,
        canSeeHistory: () => isAdmin,
        canSeeTechnicalStatus: (event) => standing === 'owner' && canViewEvent(event),
        describeEvent: (event) => ({
            rename: access.canChangeEvent(event),
            delete: access.canChangeEvent(event),
            manageInputs: access.canManageInputs(event),
            viewRoles: access.canViewRoles(event),
            addRoleTypes: access.canAddRole(event) ? [...ROLE_TYPES] : [],
            addKeys: access.canChangeKey(event, null),
            seeTechnicalStatus: access.canSeeTechnicalStatus(event),
        }),
    };
    return access;
}
