// Role rules of Key Vault, ported from frontend/src/access.ts (which the browser still
// uses to decide what to show). test/supabase-access.test.mjs runs both against the same
// cases so they cannot drift apart. Only erasable TypeScript syntax is used here so the
// tests can import this file with plain Node.

export const ACTIONS = {
    VIEW: 'view',
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
} as const;

export const ROLES = {
    VIEWER: '0',
    EDITOR: '1',
    ADMIN: '2',
    OWNER: '3',
} as const;

export type Action = (typeof ACTIONS)[keyof typeof ACTIONS];

export interface RoleLike {
    event: string;
    email: string;
    type: string;
    input: string;
}

export type EventRoles = Record<string, RoleLike[]>;

export function getEventRoles(
    email: string,
    events: { id: string }[],
    roles: RoleLike[],
    isAppOwner = false,
): EventRoles {
    const userRoles = roles.filter((r) => r.email === email);
    if (isAppOwner) {
        userRoles.push({ event: '*', email, type: ROLES.OWNER, input: '*' });
    }
    const eventRoles: EventRoles = {};
    for (const e of events) eventRoles[e.id] = [];
    eventRoles['*'] = [];
    for (const r of userRoles) {
        if (r.type === ROLES.OWNER) {
            for (const key of Object.keys(eventRoles)) eventRoles[key].push(r);
        } else {
            eventRoles[r.event]?.push(r);
        }
    }
    for (const key of Object.keys(eventRoles)) {
        if (eventRoles[key].length === 0) delete eventRoles[key];
    }
    return eventRoles;
}

export function hasEventAccess(
    eventRoles: EventRoles,
    action: Action,
    eventId: string | null = null,
): boolean {
    const isOwner = Boolean(eventRoles['*']);
    const hasAdmin = Object.values(eventRoles).some((roles) =>
        roles.some((role) => role.type === ROLES.ADMIN),
    );

    if (!eventRoles[eventId as string]) {
        return action === ACTIONS.CREATE && (isOwner || hasAdmin);
    }

    if (action === ACTIONS.VIEW) return true;
    return isOwner;
}

export function hasInputAccess(eventRoles: EventRoles): boolean {
    return Boolean(eventRoles['*']?.some((r) => r.type === ROLES.OWNER));
}

export function hasRoleAccess(
    eventRoles: EventRoles,
    action: Action,
    eventId: string,
    type: string | null = null,
): boolean {
    if (!eventRoles[eventId]) return false;

    const isOwner = eventRoles[eventId].some((r) => r.type === ROLES.OWNER);
    const isAdmin = isOwner || eventRoles[eventId].some((r) => r.type === ROLES.ADMIN);
    const isEditor = isAdmin || eventRoles[eventId].some((r) => r.type === ROLES.EDITOR);

    if (action === ACTIONS.VIEW) return isEditor;

    if (type === ROLES.OWNER) return isOwner;
    if (type === ROLES.ADMIN) return action === ACTIONS.CREATE ? isAdmin : isOwner;

    return isAdmin;
}

export function hasKeyAccess(
    eventRoles: EventRoles,
    action: Action,
    eventId: string,
    input: string | null = null,
): boolean {
    if (!eventRoles[eventId]) return false;

    const isOwner = eventRoles[eventId].some((r) => r.type === ROLES.OWNER);
    const isAdmin = isOwner || eventRoles[eventId].some((r) => r.type === ROLES.ADMIN);
    const isEditor =
        isAdmin ||
        eventRoles[eventId].some(
            (r) =>
                r.type === ROLES.EDITOR && (r.input === '*' || r.input === input || input === null),
        );
    const isViewer =
        isEditor ||
        eventRoles[eventId].some(
            (r) => r.type === ROLES.VIEWER && (r.input === '*' || r.input === input),
        );

    if (action === ACTIONS.VIEW) return isViewer;
    return isEditor;
}

export function hasKeyColorAccess(eventRoles: EventRoles, eventId: string): boolean {
    if (!eventRoles[eventId]) return false;

    return eventRoles[eventId].some((r) => r.type === ROLES.OWNER || r.type === ROLES.ADMIN);
}
