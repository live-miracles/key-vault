// Who may do what in Key Vault. The server is the only place these rules live: it checks them
// before every change, and it tells the browser the result (the `can` flags on what it sends),
// so the screens only show or hide buttons and never work a rule out themselves.
//
// Roles are per event, except that an owner anywhere is an owner everywhere, and so is the
// app owner (KEY_VAULT_OWNER_EMAILS). Viewers and editors can be limited to one input.
//
// Only erasable TypeScript syntax is used so Node, Deno and the bundler all read this as it is.

import { ROLE_TYPES } from './types.ts';
import type { EventCan, RoleRow, RoleType } from './types.ts';

export interface Access {
    canCreateEvent(): boolean;
    canViewEvent(event: string): boolean;
    // Rename or delete an event.
    canChangeEvent(event: string): boolean;
    // Add, rename, reorder and delete an event's inputs.
    canManageInputs(event: string): boolean;
    canViewRoles(event: string): boolean;
    canAddRole(event: string, type: RoleType): boolean;
    // Edit or remove someone's role of this type.
    canChangeRole(event: string, type: RoleType): boolean;
    canViewKey(event: string, input: string): boolean;
    // Add, edit or delete a destination of this input; with no input, in any input.
    canChangeKey(event: string, input: string | null): boolean;
    // Read bunryu's technical detail on a destination's status (owners only).
    canSeeTechnicalStatus(event: string): boolean;
    // Everything the browser needs to know about an event.
    describeEvent(event: string): EventCan;
}

export function createAccess(
    email: string,
    isAppOwner: boolean,
    roles: Pick<RoleRow, 'event' | 'email' | 'type' | 'input'>[],
): Access {
    const mine = roles.filter((r) => r.email === email);
    const isOwner = isAppOwner || mine.some((r) => r.type === 'owner');
    const hasAdminRole = (event: string) =>
        mine.some((r) => r.event === event && r.type === 'admin');
    const hasRole = (event: string, type: RoleType, input: string | null) =>
        mine.some(
            (r) =>
                r.event === event &&
                r.type === type &&
                (r.input === null || input === null || r.input === input),
        );

    const canViewEvent = (event: string) => isOwner || mine.some((r) => r.event === event);
    const isAdmin = (event: string) => isOwner || hasAdminRole(event);
    const isEditor = (event: string) =>
        isAdmin(event) || mine.some((r) => r.event === event && r.type === 'editor');

    // Admins manage everyone but owners; only owners manage owners.
    const canManageRole = (event: string, type: RoleType) =>
        canViewEvent(event) && (type === 'owner' ? isOwner : isAdmin(event));

    const access: Access = {
        canCreateEvent: () => isOwner || mine.some((r) => r.type === 'admin'),
        canViewEvent,
        canChangeEvent: (event) => isAdmin(event),
        canManageInputs: (event) => isAdmin(event),
        canViewRoles: (event) => isEditor(event),
        canAddRole: canManageRole,
        canChangeRole: canManageRole,
        canViewKey: (event, input) =>
            isAdmin(event) || hasRole(event, 'editor', input) || hasRole(event, 'viewer', input),
        canChangeKey: (event, input) => isAdmin(event) || hasRole(event, 'editor', input),
        canSeeTechnicalStatus: (event) => isOwner && canViewEvent(event),
        describeEvent: (event) => ({
            rename: access.canChangeEvent(event),
            delete: access.canChangeEvent(event),
            manageInputs: access.canManageInputs(event),
            viewRoles: access.canViewRoles(event),
            addRoleTypes: ROLE_TYPES.filter((type) => access.canAddRole(event, type)),
            addKeys: access.canChangeKey(event, null),
            seeTechnicalStatus: access.canSeeTechnicalStatus(event),
        }),
    };
    return access;
}
