function getEventRoles(email, events, roles) {
    const userRoles = roles.filter((r) => r.email === email);
    const eventRoles = events.reduce((acc, e) => {
        acc[e.id] = [];
        return acc;
    }, {});
    userRoles.forEach((r) => {
        if (r.event === '*') eventRoles.forEach((arr) => arr.push(r));
        else eventRoles[r.event].push(r);
    });
    Object.keys(eventRoles).forEach((key) => {
        if (eventRoles[key].length === 0) {
            delete eventRoles[key];
        }
    });
    return eventRoles;
}

function hasEventAccess(eventRoles, event, action) {
    if (!eventRoles[event]) return false;
    if (action === 'view') {
        return true;
    }
    // Only global Admins can manage events
    return eventRoles[event].some((r) => r.type === 'admin' && r.event === '*');
}

function hasRoleAccess(eventRoles, event, action, role = null) {
    if (!eventRoles[event]) return false;
    if (action === 'view') {
        // Only editors or admins can view roles
        return eventRoles[event].some((r) => r.type === 'editor' || r.type === 'admin');
    } else if (role === 'editor') {
        // Admins can add editors
        return eventRoles[event].some((r) => r.type === 'admin' && event !== '*');
    } else if (role === 'admin') {
        // Global Admins can add Event Admins
        return eventRoles[event].some(
            (r) => r.type === 'admin' && r.event === '*' && event !== '*',
        );
    }
}

function hasKeyAccess(eventRoles, event, action, language = null) {
    if (!eventRoles[event] || event === '*') return false;
    if (action === 'viewer') {
        return true;
    }
    return eventRoles[event].some(
        (r) =>
            (r.type === 'viewer' || r.type === 'admin') &&
            (r.language === '*' || r.language === language || language === null),
    );
}
