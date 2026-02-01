function getEventRoles(email, events, roles) {
    const userRoles = roles.filter((r) => r.email === email);
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

    if (!eventRoles[eventId]) {
        if (action === ACTIONS.CREATE && isOwner) return true;
        return false;
    }

    if (action === ACTIONS.VIEW) return true;
    return isOwner;
}

function hasRoleAccess(eventRoles, action, eventId, type = null) {
    if (!eventRoles[eventId]) return false;

    const isOwner = eventRoles[eventId].some((r) => r.type === ROLES.OWNER);
    const isAdmin = isOwner || eventRoles[eventId].some((r) => r.type === ROLES.ADMIN);
    const isEditor = isAdmin || eventRoles[eventId].some((r) => r.type === ROLES.EDITOR);

    if (action === ACTIONS.VIEW) return isEditor;

    if (type === ROLES.OWNER) return false;
    if (type === ROLES.ADMIN) return isOwner;

    return isAdmin;
}

function hasKeyAccess(eventRoles, action, eventId, language = null) {
    if (!eventRoles[eventId]) return false;

    const isOwner = eventRoles[eventId].some((r) => r.type === ROLES.OWNER);
    const isAdmin = isOwner || eventRoles[eventId].some((r) => r.type === ROLES.ADMIN);
    const isEditor =
        isAdmin ||
        eventRoles[eventId].some(
            (r) =>
                r.type === ROLES.EDITOR &&
                (r.language === '*' || r.language === language || language === null),
        );
    const isViewer =
        isEditor ||
        eventRoles[eventId].some(
            (r) => r.type === ROLES.EDITOR && (r.language === '*' || r.language === language),
        );

    if (action === ACTIONS.VIEW) return isViewer;
    return isEditor;
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
