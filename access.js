function getEventRoles(email, events, roles) {
    const userRoles = roles.filter((r) => r.email === email);
    const eventRoles = events.reduce((acc, e) => {
        acc[e.id] = [];
        return acc;
    }, {});
    eventRoles['*'] = [];
    userRoles.forEach((r) => {
        if (r.event === '*') {
            Object.keys(eventRoles).forEach((key) => eventRoles[key].push(r));
        } else eventRoles[r.event]?.push(r);
    });
    Object.keys(eventRoles).forEach((key) => {
        if (eventRoles[key].length === 0) {
            delete eventRoles[key];
        }
    });
    return eventRoles;
}

function hasEventAccess(eventRoles, action, event = null) {
    if (!eventRoles[event] && action !== ACTIONS.CREATE) return false;
    if (action === ACTIONS.VIEW) {
        return true;
    }
    // Only global Admins can manage events
    if (!eventRoles['*']) return false;
    return eventRoles['*'].some((r) => r.type === ROLES.ADMIN && r.event === '*');
}

function hasRoleAccess(eventRoles, action, event, role = null) {
    if (!eventRoles[event]) return false;
    if (action === ACTIONS.VIEW) {
        // Only editors or admins can view roles
        return eventRoles[event].some((r) => r.type === ROLES.EDITOR || r.type === ROLES.ADMIN);
    } else if (action === ACTIONS.CREATE && role === null) {
        // Admins can add roles
        return eventRoles[event].some((r) => r.type === ROLES.ADMIN && event !== '*');
    } else if (role === ROLES.VIEWER || role === ROLES.EDITOR) {
        // Admins can add editors
        return eventRoles[event].some((r) => r.type === ROLES.ADMIN && event !== '*');
    } else if (role === ROLES.ADMIN) {
        // Global Admins can add Event Admins
        return eventRoles[event].some(
            (r) => r.type === ROLES.ADMIN && r.event === '*' && event !== '*',
        );
    }
    console.error('Unexpected error, this code should not be reachable.');
    return false;
}

function hasKeyAccess(eventRoles, action, event, language = null) {
    if (!eventRoles[event] || event === '*') return false;
    if (action === ACTIONS.VIEW) {
        return true;
    }
    return eventRoles[event].some(
        (r) =>
            (r.type === ROLES.EDITOR || r.type === ROLES.ADMIN) &&
            (r.language === '*' || r.language === language || language === null),
    );
}

const ACTIONS = {
    VIEW: 'view',
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
};

const ROLES = {
    VIEWER: 0,
    EDITOR: 1,
    ADMIN: 2,
};

const ROLE_MAP = {
    [ROLES.VIEWER]: 'Viewer',
    [ROLES.EDITOR]: 'Editor',
    [ROLES.ADMIN]: 'Admin',
};
