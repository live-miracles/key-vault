const props = PropertiesService.getScriptProperties();
const SPREADSHEET_ID = props.getProperty('SPREADSHEET_ID');
const CACHE_KEY = 'DATA';
const CACHE_TTL = 6 * 60 * 60;

const SHEETS = {
    ROLE: 'Role',
    EVENT: 'Event',
    KEY: 'Key',
};

function sheetStringsToObjects(data) {
    const [headers, ...rows] = data.map((str) => str.split('¦'));
    return rows.map((r, idx) => {
        const obj = { row: idx + 2 };

        headers.forEach((h, i) => {
            obj[h] = String(r[i]);
        });

        return obj;
    });
}

function sheetToStrings(sheet) {
    return sheet
        .getDataRange()
        .getValues()
        .map((r) => r.join('¦'));
}

// ===== Common Functions =====
function getSheet(name) {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
    if (!sheet) throw new Error(`Sheet not found: ${name}`);
    return sheet;
}

function getAllRows(sheet) {
    const data = sheet.getDataRange().getValues();
    const headers = data.shift();
    return { headers, rows: data };
}

function withLock(fn, name) {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
        return fn();
    } catch (err) {
        const functionName = name || fn.name || 'anonymous';
        console.error(`Error in ${functionName}:`, err.stack || err);
        throw err;
    } finally {
        lock.releaseLock();
    }
}

function getUserEmail() {
    return Session.getActiveUser().getEmail();
}

function generateId() {
    return (
        Date.now().toString(36).toUpperCase() +
        Math.random().toString(36).substring(2, 6).toUpperCase()
    );
}

// ===== Cached Data =====
function parseCache(text) {
    const tmp = JSON.parse(text);
    return {
        etag: tmp.etag,
        events: sheetStringsToObjects(tmp.events),
        roles: sheetStringsToObjects(tmp.roles),
        keys: sheetStringsToObjects(tmp.keys),
    };
}

function getCacheString() {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    const data = {
        etag: String(Date.now()),
        events: sheetToStrings(ss.getSheetByName(SHEETS.EVENT)),
        roles: sheetToStrings(ss.getSheetByName(SHEETS.ROLE)),
        keys: sheetToStrings(ss.getSheetByName(SHEETS.KEY)),
    };

    return JSON.stringify(data);
}

function getAllData(etag) {
    const cache = CacheService.getScriptCache();
    let cacheString = cache.get(CACHE_KEY);
    if (!cacheString) {
        cacheString = getCacheString();
        cache.put(CACHE_KEY, cacheString, CACHE_TTL);
    }

    const config = parseCache(cacheString);
    if (etag === config.etag) {
        return { success: true, data: { etag: config.etag } };
    }
    config.size = cacheString.length;
    config.userEmail = getUserEmail();

    const eventRoles = getEventRoles(config.userEmail, config.events, config.roles);
    config.events = config.events.filter((e) => hasEventAccess(eventRoles, ACTIONS.VIEW, e.id));
    config.roles = config.roles.filter((r) =>
        hasRoleAccess(eventRoles, ACTIONS.VIEW, r.event, r.type),
    );
    config.keys = config.keys.filter((k) =>
        hasKeyAccess(eventRoles, ACTIONS.VIEW, k.event, k.language),
    );

    return { success: true, data: config };
}

function expireCache() {
    CacheService.getScriptCache().remove(CACHE_KEY);
}

// ===== Event API =====
function addEvent(event) {
    if (!event || !event.name) {
        return {
            success: false,
            error: 'Invalid parameters: ' + JSON.stringify(event),
        };
    }

    const config = getAllData().data;
    const eventRoles = getEventRoles(config.userEmail, config.events, config.roles);

    if (!hasEventAccess(eventRoles, ACTIONS.CREATE)) {
        return {
            success: false,
            error: 'Access denied for email: ' + config.userEmail,
        };
    }

    return withLock(() => {
        const sheet = getSheet(SHEETS.EVENT);
        event.id = generateId();
        event.row = sheet.getLastRow();
        sheet.appendRow([event.id, event.name]);

        expireCache();

        return {
            success: true,
            data: event,
        };
    }, 'addEvent');
}

function editEvent(event) {
    if (!event || !event.id || !event.name) {
        return {
            success: false,
            error: 'Invalid parameters: ' + JSON.stringify(event),
        };
    }

    const config = getAllData().data;
    const eventRoles = getEventRoles(config.userEmail, config.events, config.roles);
    const old = config.events.find((e) => e.id === event.id);
    if (!old) {
        return { success: false, error: 'Event not found: ' + event.id };
    }

    if (!hasEventAccess(eventRoles, ACTIONS.UPDATE, event.id)) {
        return {
            success: false,
            error: 'Access denied for email: ' + config.userEmail,
        };
    }

    if (old.status === EVENT_STATUS.LOCKED && event.status === EVENT_STATUS.LOCKED) {
        return { success: false, error: 'Event is locked: ' + event.id };
    }

    return withLock(() => {
        const sheet = getSheet(SHEETS.EVENT);
        sheet.getRange(old.row, 2, 1, 2).setValues([[event.name, event.status]]);

        expireCache();

        return { success: true, data: event };
    }, 'editEvent');
}

function lockEvent(event) {
    if (!event || !event.id || !['', EVENT_STATUS.LOCKED].includes(event.status)) {
        return {
            success: false,
            error: 'Invalid parameters: ' + JSON.stringify(event),
        };
    }

    const config = getAllData().data;
    const eventRoles = getEventRoles(config.userEmail, config.events, config.roles);
    const old = config.events.find((e) => e.id === event.id);
    if (!old) {
        return { success: false, error: 'Event not found: ' + event.id };
    }

    if (!hasEventAccess(eventRoles, ACTIONS.LOCK, event.id)) {
        return {
            success: false,
            error: 'Access denied for email: ' + config.userEmail,
        };
    }

    if (old.status === event.status) {
        return {
            success: false,
            error: `Event is already ${event.status ? 'locked' : 'unlocked'}: ` + event.id,
        };
    }

    return withLock(() => {
        const sheet = getSheet(SHEETS.EVENT);
        sheet.getRange(old.row, 3).setValue(event.status);

        expireCache();

        return { success: true, data: event };
    }, 'lockEvent');
}

function deleteEvent(id) {
    if (!id) {
        return {
            success: false,
            error: 'Invalid parameters: ' + id,
        };
    }

    const config = getAllData().data;
    const eventRoles = getEventRoles(config.userEmail, config.events, config.roles);
    const event = config.events.find((e) => e.id === id);
    if (!event) {
        return { success: false, error: 'Event not found: ' + id };
    }

    if (!hasEventAccess(eventRoles, ACTIONS.DELETE, event.id)) {
        return {
            success: false,
            error: 'Access denied for email: ' + config.userEmail,
        };
    }

    if (old.status === EVENT_STATUS.LOCKED) {
        return { success: false, error: 'Event is locked: ' + event.id };
    }

    return withLock(() => {
        const sheet = getSheet(SHEETS.EVENT);
        sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).clearContent();

        const roleSheet = getSheet(SHEETS.ROLE);
        config.roles
            .filter((r) => r.event === id)
            .forEach((r) =>
                roleSheet.getRange(r.row, 1, 1, roleSheet.getLastColumn()).clearContent(),
            );

        const keySheet = getSheet(SHEETS.KEY);
        config.roles
            .filter((k) => k.event === id)
            .forEach((k) =>
                keySheet.getRange(k.row, 1, 1, keySheet.getLastColumn()).clearContent(),
            );

        expireCache();

        return { success: true, data: true };
    }, 'deleteEvent');
}

// ===== Role API =====
function addRole(role) {
    if (!role || !role.event || !role.email || !role.type) {
        return {
            success: false,
            error: 'Invalid parameters: ' + JSON.stringify(role),
        };
    }

    const config = getAllData().data;
    const eventRoles = getEventRoles(config.userEmail, config.events, config.roles);

    if (!hasRoleAccess(eventRoles, ACTIONS.CREATE, role.event)) {
        return {
            success: false,
            error: 'Access denied for email: ' + config.userEmail,
        };
    }

    return withLock(() => {
        const sheet = getSheet(SHEETS.ROLE);

        role.id = generateId();
        role.row = sheet.getLastRow();
        sheet.appendRow([role.id, role.event, role.email, role.type, role.language, role.remarks]);
        expireCache();

        return { success: true, data: role };
    }, 'addRole');
}

function editRole(role) {
    if (!role || !role.id || !role.event || !role.email || !role.type || !role.language) {
        return {
            success: false,
            error: 'Invalid parameters: ' + JSON.stringify(role),
        };
    }

    const config = getAllData().data;
    const eventRoles = getEventRoles(config.userEmail, config.events, config.roles);
    const old = config.roles.find((r) => r.id === role.id);
    if (!old) {
        return { success: false, error: 'Role not found: ' + role.id };
    }

    if (
        !hasRoleAccess(eventRoles, ACTIONS.UPDATE, role.event, role.type) ||
        !hasRoleAccess(eventRoles, ACTIONS.UPDATE, old.event, old.type)
    ) {
        return {
            success: false,
            error: 'Access denied for email: ' + config.userEmail,
        };
    }

    return withLock(() => {
        const sheet = getSheet(SHEETS.ROLE);
        sheet
            .getRange(old.row, 3, 1, 4)
            .setValues([[role.email, role.type, role.language, role.remarks]]);

        expireCache();

        return { success: true, data: role };
    }, 'editRole');
}

function deleteRole(id) {
    if (!id) {
        return {
            success: false,
            error: 'Invalid parameters: ' + id,
        };
    }

    const config = getAllData().data;
    const eventRoles = getEventRoles(config.userEmail, config.events, config.roles);
    const role = config.roles.find((r) => r.id === id);

    if (!role) {
        return { success: false, error: 'Role not found: ' + id };
    }

    if (!hasRoleAccess(eventRoles, ACTIONS.DELETE, role.event, role.type)) {
        return {
            success: false,
            error: 'Access denied for email: ' + config.userEmail,
        };
    }

    return withLock(() => {
        const sheet = getSheet(SHEETS.ROLE);

        sheet.getRange(role.row, 1, 1, sheet.getLastColumn()).clearContent();

        expireCache();

        return { success: true, data: true };
    }, 'deleteRole');
}

// ===== Key API =====
function addKey(key) {
    if (!key || !key.event || !key.name || !key.language || !key.server || !key.key) {
        return {
            success: false,
            error: 'Invalid parameters: ' + JSON.stringify(key),
        };
    }

    const config = getAllData().data;
    const eventRoles = getEventRoles(config.userEmail, config.events, config.roles);

    if (!hasKeyAccess(eventRoles, ACTIONS.CREATE, key.event)) {
        return {
            success: false,
            error: 'Access denied for email: ' + config.userEmail,
        };
    }

    const event = config.events.find((e) => e.id === key.event);
    if (!event) {
        return { success: false, error: 'Event not found: ' + key.event };
    }

    if (event.status === EVENT_STATUS.LOCKED) {
        return { success: false, error: 'Event is locked: ' + event.id };
    }

    return withLock(() => {
        const sheet = getSheet(SHEETS.KEY);

        key.id = generateId();
        key.row = sheet.getLastRow();
        sheet.appendRow([
            key.id,
            key.event,
            key.name,
            key.language,
            key.server,
            key.key,
            key.server2,
            key.key2,
            key.link,
            key.color,
            key.remarks,
        ]);

        expireCache();

        return { success: true, data: key };
    }, 'addKey');
}

function editKey(key) {
    if (!key || !key.id || !key.event || !key.name || !key.language || !key.server || !key.key) {
        return {
            success: false,
            error: 'Invalid parameters: ' + JSON.stringify(key),
        };
    }

    const config = getAllData().data;
    const eventRoles = getEventRoles(config.userEmail, config.events, config.roles);
    const old = config.keys.find((k) => k.id === key.id);

    if (!old) {
        return { success: false, error: 'Key not found: ' + key.id };
    }

    if (
        !hasKeyAccess(eventRoles, ACTIONS.UPDATE, key.event, key.language) ||
        !hasKeyAccess(eventRoles, ACTIONS.UPDATE, old.event, key.language)
    ) {
        return {
            success: false,
            error: 'Access denied for email: ' + config.userEmail,
        };
    }

    const event = config.events.find((e) => e.id === key.event);
    if (!event) {
        return { success: false, error: 'Event not found: ' + key.event };
    }

    if (event.status === EVENT_STATUS.LOCKED) {
        return { success: false, error: 'Event is locked: ' + event.id };
    }

    return withLock(() => {
        const sheet = getSheet(SHEETS.KEY);
        sheet
            .getRange(old.row, 3, 1, 9)
            .setValues([
                [
                    key.name,
                    key.language,
                    key.server,
                    key.key,
                    key.server2,
                    key.key2,
                    key.link,
                    key.color,
                    key.remarks,
                ],
            ]);

        expireCache();

        return { success: true, data: key };
    }, 'editKey');
}

function deleteKey(id) {
    if (!id) {
        return {
            success: false,
            error: 'Invalid parameters: ' + id,
        };
    }

    const config = getAllData().data;
    const eventRoles = getEventRoles(config.userEmail, config.events, config.roles);
    const key = config.keys.find((k) => k.id === id);

    if (!key) {
        return { success: false, error: 'Key not found: ' + id };
    }

    if (!hasKeyAccess(eventRoles, ACTIONS.DELETE, key.event, key.language)) {
        return {
            success: false,
            error: 'Access denied for email: ' + config.userEmail,
        };
    }

    const event = config.events.find((e) => e.id === key.event);
    if (!event) {
        return { success: false, error: 'Event not found: ' + key.event };
    }

    if (event.status === EVENT_STATUS.LOCKED) {
        return { success: false, error: 'Event is locked: ' + event.id };
    }

    return withLock(() => {
        const sheet = getSheet(SHEETS.KEY);
        sheet.getRange(key.row, 1, 1, sheet.getLastColumn()).clearContent();

        expireCache();

        return { success: true, data: true };
    }, 'deleteKey');
}

// ===== Serve Webpage =====
function doGet() {
    return HtmlService.createHtmlOutputFromFile('Index');
}
