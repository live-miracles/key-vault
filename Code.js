const props = PropertiesService.getScriptProperties();
const SPREADSHEET_ID = props.getProperty('SPREADSHEET_ID');

const SHEETS = {
    ROLE: 'Role',
    EVENT: 'Event',
    KEY: 'Key',
};

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
    lock.waitLock(10000); // wait up to 10s

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

// ===== Events API =====
function getEvents() {
    try {
        const { rows } = getAllRows(getSheet(SHEETS.EVENTS));
        return rows.map((r) => ({
            id: r[0],
            name: r[1],
        }));
    } catch (err) {
        console.error('Error in getEvents:', err.stack || err);
        throw err;
    }
}

function createEvent(name) {
    return withLock(() => {
        const sheet = getSheet(SHEETS.EVENT);
        const id = generateId('EVT');
        sheet.appendRow([id, name]);
    }, 'createEvent');
}

function updateEvent(id, newName) {
    return withLock(() => {
        const sheet = getSheet(SHEETS.EVENT);
        const rows = sheet.getDataRange().getValues();

        for (let i = 1; i < rows.length; i++) {
            if (rows[i][0] === id) {
                sheet.getRange(i + 1, 2).setValue(newName);
                return true;
            }
        }
        throw new Error('Event not found');
    }, 'updateEvent');
}

function deleteEvent(id) {
    return withLock(() => {
        const sheet = getSheet(SHEETS.EVENTS);
        const rows = sheet.getDataRange().getValues();

        for (let i = 1; i < rows.length; i++) {
            if (rows[i][0] === id) {
                sheet.deleteRow(i + 1);
                return true;
            }
        }
        throw new Error('Event not found');
    }, 'deleteEvent');
}

// ===== Roles API =====
function getRolesByEvent(eventId) {
    const { rows } = getAllRows(getSheet(SHEETS.ROLES));
    return rows
        .filter((r) => r[1] === eventId)
        .map((r) => ({
            id: r[0],
            eventId: r[1],
            email: r[2],
            role: r[3],
        }));
}

function createRole(eventId, email, role) {
    const sheet = getSheet(SHEETS.ROLES);
    const id = generateId('ROLE');
    sheet.appendRow([id, eventId, email, role]);
    return { id, eventId, email, role };
}

function updateRole(id, newRole) {
    const sheet = getSheet(SHEETS.ROLES);
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
    const sheet = getSheet(SHEETS.ROLES);
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
    const sheet = getSheet(SHEETS.ROLES);
    const rows = sheet.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === id) {
            sheet.deleteRow(i + 1);
            return true;
        }
    }
    throw new Error('Role entry not found');
}

// ===== Keys API =====
function getKeysByEvent(eventId) {
    const { rows } = getAllRows(getSheet(SHEETS.KEYS));
    return rows
        .filter((r) => r[1] === eventId)
        .map((r) => ({
            id: r[0],
            eventId: r[1],
            serverUrl: r[2],
            key: r[3],
            remarks: r[4],
        }));
}

function createKey(eventId, serverUrl, key, remarks) {
    const sheet = getSheet(SHEETS.KEYS);
    const id = generateId('KEY');
    sheet.appendRow([id, eventId, serverUrl, key, remarks || '']);
    return { id };
}

function updateKey(id, data) {
    const sheet = getSheet(SHEETS.KEYS);
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
    const sheet = getSheet(SHEETS.KEYS);
    const rows = sheet.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === id) {
            sheet.deleteRow(i + 1);
            return true;
        }
    }
    throw new Error('Key entry not found');
}
