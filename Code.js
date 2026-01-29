const props = PropertiesService.getScriptProperties();
const SPREADSHEET_ID = props.getProperty('SPREADSHEET_ID');
const CACHE_KEY = 'DATA';
const CACHE_TTL = 6 * 60 * 60;

const SHEETS = {
    ROLE: 'Role',
    EVENT: 'Event',
    KEY: 'Key',
};

function sheetToObjects(sheet) {
    const [headers, ...rows] = sheet.getDataRange().getValues();
    return rows.map((r, idx) => {
        const obj = { row: idx + 2 };

        headers.forEach((h, i) => {
            obj[h] = r[i];
        });

        return obj;
    });
}

// ===== Cached Data =====
function getAllData(etag) {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(CACHE_KEY);
    if (cached) {
        const config = JSON.parse(cached);
        if (etag === config.etag)
            return {
                success: true,
                data: { etag: config.etag },
            };
        config.userEmail = getUserEmail();
        config.size = cached.length;
        return { success: true, data: config };
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    const config = {
        etag: String(Date.now()),
        events: sheetToObjects(ss.getSheetByName(SHEETS.EVENT)),
        roles: sheetToObjects(ss.getSheetByName(SHEETS.ROLE)),
        keys: sheetToObjects(ss.getSheetByName(SHEETS.KEY)),
    };

    const configString = JSON.stringify(config);
    cache.put(CACHE_KEY, configString, CACHE_TTL);
    config.userEmail = getUserEmail();
    config.size = configString.length;

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

function generateId(prefix) {
    return `${prefix}_${Utilities.getUuid()}`;
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

// ===== Event API =====
function addEvent(event) {
    if (!event || !event.name) {
        return {
            success: false,
            error: 'Invalid parameters: ' + JSON.stringify(event),
        };
    }

    const config = getAllData().data;
    const eventRoles = getEventRoles(config.email, config.events, config.roles);

    if (!hasEventAccess(eventRoles, ACTIONS.CREATE)) {
        return {
            success: false,
            error: 'Access denied for email: ' + config.userEmail,
        };
    }

    return withLock(() => {
        const sheet = getSheet(SHEETS.EVENT);
        event.id = Utilities.getUuid();
        sheet.appendRow([event.id, event.name]);
        expireCache();

        event.row = sheet.getLastRow();
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
    const eventRoles = getEventRoles(config.email, config.events, config.roles);

    if (!hasEventAccess(eventRoles, ACTIONS.UPDATE, event.id)) {
        return {
            success: false,
            error: 'Access denied for email: ' + config.userEmail,
        };
    }

    return withLock(() => {
        for (let i = 0; i < config.events.length; i++) {
            if (config.events[i].id === event.id) {
                const sheet = getSheet(SHEETS.EVENT);
                sheet.getRange(config.events[i].row, 2).setValue(event.name);
                expireCache();
                return { success: true, data: event };
            }
        }
        throw new Error('Event not found');
    }, 'editEvent');
}

function deleteEvent(id) {
    if (!id) {
        return {
            success: false,
            error: 'Invalid parameters: ' + id,
        };
    }

    const config = getAllData().data;
    const eventRoles = getEventRoles(config.email, config.events, config.roles);
    const event = config.events.find((e) => e.id === id);
    if (!event) {
        return {
            success: false,
            error: 'Event not found: ' + id,
        };
    }

    if (!hasEventAccess(eventRoles, ACTIONS.DELETE, event.id)) {
        return {
            success: false,
            error: 'Access denied for email: ' + config.userEmail,
        };
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
function createRole(eventId, email, role) {
    const sheet = getSheet(SHEETS.ROLE);
    const id = generateId('ROLE');
    sheet.appendRow([id, eventId, email, role]);
    return { id, eventId, email, role };
}

function updateRole(id, newRole) {
    const sheet = getSheet(SHEETS.ROLE);
    const rows = sheet.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === id) {
            sheet.getRange(i + 1, 4).setValue(newRole);
            return true;
        }
    }
    throw new Error('Role entry not found');
}

function deleteRole(id) {
    const sheet = getSheet(SHEETS.ROLE);
    const rows = sheet.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === id) {
            sheet.deleteRow(i + 1);
            return true;
        }
    }
    throw new Error('Role entry not found');
}

function deleteRole(id) {
    const sheet = getSheet(SHEETS.ROLE);
    const rows = sheet.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === id) {
            sheet.deleteRow(i + 1);
            return true;
        }
    }
    throw new Error('Role entry not found');
}

// ===== Key API =====
function createKey(eventId, serverUrl, key, remarks) {
    const sheet = getSheet(SHEETS.KEY);
    const id = generateId('KEY');
    sheet.appendRow([id, eventId, serverUrl, key, remarks || '']);
    return { id };
}

function updateKey(id, data) {
    const sheet = getSheet(SHEETS.KEY);
    const rows = sheet.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === id) {
            if (data.serverUrl !== undefined) sheet.getRange(i + 1, 3).setValue(data.serverUrl);
            if (data.key !== undefined) sheet.getRange(i + 1, 4).setValue(data.key);
            if (data.remarks !== undefined) sheet.getRange(i + 1, 5).setValue(data.remarks);
            return true;
        }
    }
    throw new Error('Key entry not found');
}

function deleteKey(id) {
    const sheet = getSheet(SHEETS.KEY);
    const rows = sheet.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === id) {
            sheet.deleteRow(i + 1);
            return true;
        }
    }
    throw new Error('Key entry not found');
}

// ===== Serve Webpage =====
function doGet() {
    return HtmlService.createHtmlOutputFromFile('Index');
}
