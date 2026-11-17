// @ts-nocheck

function getEventRoles(email, events, roles, isAppOwner = false) {
    const userRoles = roles.filter((r) => r.email === email);
    if (isAppOwner) {
        userRoles.push({
            event: '*',
            email,
            type: ROLES.OWNER,
            input: '*',
        });
    }
    const eventRoles = events.reduce((acc, e) => {
        acc[e.id] = [];
        return acc;
    }, {});
    eventRoles['*'] = [];
    userRoles.forEach((r) => {
        if (r.type === ROLES.OWNER) {
            Object.keys(eventRoles).forEach((key) => eventRoles[key].push(r));
        } else {
            if (!eventRoles[r.event]) console.error('Event not found: ' + r.event);
            eventRoles[r.event]?.push(r);
        }
    });
    Object.keys(eventRoles).forEach((key) => {
        if (eventRoles[key].length === 0) {
            delete eventRoles[key];
        }
    });
    return eventRoles;
}

function hasEventAccess(eventRoles, action, eventId = null) {
    const isOwner = Boolean(eventRoles['*']);
    const hasAdmin = Object.values(eventRoles).some((roles) =>
        roles.some((role) => role.type === ROLES.ADMIN),
    );

    if (!eventRoles[eventId]) {
        if (action === ACTIONS.CREATE && (isOwner || hasAdmin)) return true;
        return false;
    }

    if (action === ACTIONS.VIEW) return true;
    return isOwner;
}

// The inputs of an event are managed by that event's admins, and by owners.
function hasInputAccess(eventRoles, eventId) {
    return Boolean(
        eventRoles[eventId]?.some((r) => r.type === ROLES.OWNER || r.type === ROLES.ADMIN),
    );
}

function hasRoleAccess(eventRoles, action, eventId, type = null) {
    if (!eventRoles[eventId]) return false;

    const isOwner = eventRoles[eventId].some((r) => r.type === ROLES.OWNER);
    const isAdmin = isOwner || eventRoles[eventId].some((r) => r.type === ROLES.ADMIN);
    const isEditor = isAdmin || eventRoles[eventId].some((r) => r.type === ROLES.EDITOR);

    if (action === ACTIONS.VIEW) return isEditor;

    if (type === ROLES.OWNER) return isOwner;
    if (type === ROLES.ADMIN) return action === ACTIONS.CREATE ? isAdmin : isOwner;

    return isAdmin;
}

function hasKeyAccess(eventRoles, action, eventId, input = null) {
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

function hasKeyColorAccess(eventRoles, eventId) {
    if (!eventRoles[eventId]) return false;

    return eventRoles[eventId].some((r) => r.type === ROLES.OWNER || r.type === ROLES.ADMIN);
}

const ACTIONS = {
    VIEW: 'view',
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
};

const ROLES = {
    VIEWER: '0',
    EDITOR: '1',
    ADMIN: '2',
    OWNER: '3',
};

const ROLE_MAP = {
    [ROLES.VIEWER]: 'Viewer',
    [ROLES.EDITOR]: 'Editor',
    [ROLES.ADMIN]: 'Admin',
    [ROLES.OWNER]: 'Owner',
};
