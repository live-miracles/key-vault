const props = PropertiesService.getScriptProperties();
const SPREADSHEET_ID = props.getProperty('SPREADSHEET_ID');
const CACHE_KEY = 'DATA_V2';
const CACHE_TTL = 6 * 60 * 60;
const CACHE_CELL_DELIMITER = String.fromCharCode(166);
const EVENT_CACHE_FIELDS = ['id', 'name'];
const ROLE_CACHE_FIELDS = ['id', 'event', 'email', 'type', 'language', 'remarks'];
const LANGUAGE_CACHE_FIELDS = ['id', 'name', 'order'];
const KEY_CACHE_FIELDS = [
    'id',
    'event',
    'name',
    'language',
    'server',
    'key',
    'server2',
    'key2',
    'link',
    'color',
    'remarks',
];

const SHEETS = {
    ROLE: 'Role',
    EVENT: 'Event',
    KEY: 'Key',
    LANGUAGE: 'Language',
};

function sheetStringsToObjects(data) {
    const [headers, ...rows] = data.map((str) => str.split('¦'));
    return rows.map((r, idx) => {
        const obj = { row: idx + 2 };

        headers.forEach((h, i) => {
            obj[h] = r[i] == null ? '' : String(r[i]);
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

function sheetToCacheStrings(sheet) {
    return sheet
        .getDataRange()
        .getValues()
        .map((r, rowIndex) => {
            const delimiterColumn = r.findIndex((value) =>
                String(value ?? '').includes(CACHE_CELL_DELIMITER),
            );
            if (delimiterColumn !== -1) {
                const sheetName = sheet.getName ? sheet.getName() : 'Unknown';
                throw new Error(
                    `Reserved delimiter found in ${sheetName} row ${rowIndex + 1}, column ${
                        delimiterColumn + 1
                    }`,
                );
            }
            return r.join(CACHE_CELL_DELIMITER);
        });
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

function setTextCell(sheet, row, column, value) {
    sheet.getRange(row, column).setNumberFormat('@').setValue(value);
}

function getCacheDelimiterField(item, fields) {
    return fields.find((field) => String(item?.[field] ?? '').includes(CACHE_CELL_DELIMITER));
}

function validateCacheSafeFields(item, fields) {
    const field = getCacheDelimiterField(item, fields);
    if (!field) return null;

    return {
        success: false,
        error: `Invalid ${field}: value contains a reserved character.`,
    };
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

function getAppOwnerEmail() {
    return Session.getEffectiveUser().getEmail();
}

function isAppOwnerEmail(email) {
    return Boolean(email) && email === getAppOwnerEmail();
}

function getSequentialIdNumber(id, prefix) {
    const match = String(id ?? '').match(new RegExp(`^${prefix}([1-9][0-9]*)$`));
    return match ? Number(match[1]) : null;
}

function getNextSequentialId(items, prefix) {
    const maxNumber = Math.max(
        ...items
            .map((item) => getSequentialIdNumber(item.id, prefix))
            .filter((number) => number !== null),
        0,
    );
    return `${prefix}${maxNumber + 1}`;
}

const KEY_COLORS = {
    NONE: '',
    ERROR: '1',
    WARNING: '3',
    CONFIGURED: '6',
};

function normalizeKeyColor(color) {
    const value = String(color ?? '').trim();
    return Object.values(KEY_COLORS).includes(value) ? value : KEY_COLORS.NONE;
}

function hasStreamingConfigChanged(oldKey, key) {
    return ['server', 'key', 'server2', 'key2'].some(
        (field) => String(oldKey[field] ?? '') !== String(key[field] ?? ''),
    );
}

// ===== Cached Data =====
function parseCache(text) {
    const tmp = JSON.parse(text);
    const roles = sheetStringsToObjects(tmp.roles).map((role) => {
        const cleanRole = { ...role, language: normalizeLanguageId(role.language, true) };
        delete cleanRole.remarks;
        return cleanRole;
    });
    const keys = sheetStringsToObjects(tmp.keys).map((key) => ({
        ...key,
        language: normalizeLanguageId(key.language),
    }));

    return {
        etag: tmp.etag,
        events: sheetStringsToObjects(tmp.events).filter((event) => event.id || event.name),
        roles,
        keys,
        languages: tmp.languages
            ? sheetStringsToObjects(tmp.languages)
                  .map((language) => ({
                      ...language,
                      id: normalizeLanguageId(language.id),
                  }))
                  .filter((language) => language.id || language.name)
            : [],
    };
}

function getCacheString() {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    const data = {
        events: sheetToCacheStrings(ss.getSheetByName(SHEETS.EVENT)),
        roles: sheetToCacheStrings(ss.getSheetByName(SHEETS.ROLE)),
        keys: sheetToCacheStrings(ss.getSheetByName(SHEETS.KEY)),
        languages: sheetToCacheStrings(ss.getSheetByName(SHEETS.LANGUAGE)),
    };
    data.etag = getContentEtag(data);

    return JSON.stringify(data);
}

function getContentEtag(data) {
    const text = JSON.stringify(data);
    if (typeof Utilities !== 'undefined' && Utilities.computeDigest) {
        return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text)
            .map((byte) => (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, '0'))
            .join('');
    }

    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
        hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    }
    return String(hash);
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
    config.isAppOwner = isAppOwnerEmail(config.userEmail);

    const eventRoles = getEventRoles(
        config.userEmail,
        config.events,
        config.roles,
        config.isAppOwner,
    );
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

function isValidLanguage(config, language, allowAll = false) {
    const languageId = normalizeLanguageId(language, allowAll);
    return (allowAll && languageId === '*') || config.languages.some((l) => l.id === languageId);
}

function isValidLanguageId(id) {
    return /^L([1-9][0-9]*)$/.test(String(id));
}

function normalizeLanguageId(id, allowAll = false) {
    const languageId = String(id ?? '').trim();
    if (allowAll && languageId === '*') return languageId;
    if (/^[1-9][0-9]*$/.test(languageId)) return `L${languageId}`;

    const prefixedMatch = languageId.match(/^(?:L|lang)([1-9][0-9]*)$/i);
    if (prefixedMatch) return `L${prefixedMatch[1]}`;

    return languageId;
}

// ===== Event API =====
function addEvent(event) {
    if (!event || !event.name) {
        return {
            success: false,
            error: 'Invalid parameters: ' + JSON.stringify(event),
        };
    }
    const delimiterError = validateCacheSafeFields(event, EVENT_CACHE_FIELDS);
    if (delimiterError) return delimiterError;

    const config = getAllData().data;
    const eventRoles = getEventRoles(
        config.userEmail,
        config.events,
        config.roles,
        config.isAppOwner,
    );

    if (!hasEventAccess(eventRoles, ACTIONS.CREATE)) {
        return {
            success: false,
            error: 'Access denied for email: ' + config.userEmail,
        };
    }

    return withLock(() => {
        const sheet = getSheet(SHEETS.EVENT);
        const { headers, rows } = getAllRows(sheet);
        const idIndex = headers.indexOf('id');
        const events = rows.map((row) => ({ id: row[idIndex] }));
        event.id = getNextSequentialId(events, 'E');
        sheet.appendRow([event.id, event.name]);
        event.row = sheet.getLastRow();

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
    const delimiterError = validateCacheSafeFields(event, EVENT_CACHE_FIELDS);
    if (delimiterError) return delimiterError;

    const config = getAllData().data;
    const eventRoles = getEventRoles(
        config.userEmail,
        config.events,
        config.roles,
        config.isAppOwner,
    );
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

    return withLock(() => {
        const sheet = getSheet(SHEETS.EVENT);
        const newEvent = { ...old, name: event.name };
        sheet.getRange(old.row, 2).setValue(newEvent.name);

        expireCache();

        return { success: true, data: newEvent };
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
    const eventRoles = getEventRoles(
        config.userEmail,
        config.events,
        config.roles,
        config.isAppOwner,
    );
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

    return withLock(() => {
        const sheet = getSheet(SHEETS.EVENT);
        sheet.getRange(event.row, 1, 1, sheet.getLastColumn()).clearContent();

        const roleSheet = getSheet(SHEETS.ROLE);
        config.roles
            .filter((r) => r.event === id)
            .forEach((r) =>
                roleSheet.getRange(r.row, 1, 1, roleSheet.getLastColumn()).clearContent(),
            );

        const keySheet = getSheet(SHEETS.KEY);
        config.keys
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
    role.language =
        role.type === ROLES.ADMIN || role.type === ROLES.OWNER
            ? '*'
            : normalizeLanguageId(role.language, true);
    const delimiterError = validateCacheSafeFields(role, ROLE_CACHE_FIELDS);
    if (delimiterError) return delimiterError;

    const config = getAllData().data;
    const eventRoles = getEventRoles(
        config.userEmail,
        config.events,
        config.roles,
        config.isAppOwner,
    );

    if (!isValidLanguage(config, role.language, true)) {
        return { success: false, error: 'Language not found: ' + role.language };
    }

    if (!hasRoleAccess(eventRoles, ACTIONS.CREATE, role.event, role.type)) {
        return {
            success: false,
            error: 'Access denied for email: ' + config.userEmail,
        };
    }

    return withLock(() => {
        const sheet = getSheet(SHEETS.ROLE);
        const { headers, rows } = getAllRows(sheet);
        const idIndex = headers.indexOf('id');
        const roles = rows.map((row) => ({ id: row[idIndex] }));

        role.id = getNextSequentialId(roles, 'R');
        sheet.appendRow([role.id, role.event, role.email, role.type, '']);
        role.row = sheet.getLastRow();
        setTextCell(sheet, role.row, 5, role.language);
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
    role.language =
        role.type === ROLES.ADMIN || role.type === ROLES.OWNER
            ? '*'
            : normalizeLanguageId(role.language, true);
    const delimiterError = validateCacheSafeFields(role, ROLE_CACHE_FIELDS);
    if (delimiterError) return delimiterError;

    const config = getAllData().data;
    const eventRoles = getEventRoles(
        config.userEmail,
        config.events,
        config.roles,
        config.isAppOwner,
    );
    const old = config.roles.find((r) => r.id === role.id);
    if (!old) {
        return { success: false, error: 'Role not found: ' + role.id };
    }

    if (!isValidLanguage(config, role.language, true)) {
        return { success: false, error: 'Language not found: ' + role.language };
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
        setTextCell(sheet, old.row, 5, role.language);
        sheet.getRange(old.row, 3, 1, 3).setValues([[role.email, role.type, role.language]]);
        if (sheet.getLastColumn() >= 6) {
            sheet.getRange(old.row, 6).clearContent();
        }

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
    const eventRoles = getEventRoles(
        config.userEmail,
        config.events,
        config.roles,
        config.isAppOwner,
    );
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

// ===== Language API =====
function addLanguage(language) {
    if (!language || !language.id || !language.name) {
        return {
            success: false,
            error: 'Invalid parameters: ' + JSON.stringify(language),
        };
    }
    language.id = normalizeLanguageId(language.id);
    const delimiterError = validateCacheSafeFields(language, LANGUAGE_CACHE_FIELDS);
    if (delimiterError) return delimiterError;

    const config = getAllData().data;
    const eventRoles = getEventRoles(
        config.userEmail,
        config.events,
        config.roles,
        config.isAppOwner,
    );

    if (!hasLanguageAccess(eventRoles)) {
        return {
            success: false,
            error: 'Access denied for email: ' + config.userEmail,
        };
    }

    if (language.id === '*') {
        return { success: false, error: 'Language id is reserved: *' };
    }

    if (!isValidLanguageId(language.id)) {
        return { success: false, error: 'Language id must be L1 or higher' };
    }

    if (config.languages.some((l) => l.id === language.id)) {
        return { success: false, error: 'Language already exists: ' + language.id };
    }

    return withLock(() => {
        const sheet = getSheet(SHEETS.LANGUAGE);
        language.order = String(
            Math.max(...config.languages.map((l) => Number(l.order) || 0), 0) + 1,
        );
        sheet.appendRow(['', language.name, language.order]);
        language.row = sheet.getLastRow();
        setTextCell(sheet, language.row, 1, language.id);

        expireCache();

        return { success: true, data: language };
    }, 'addLanguage');
}

function editLanguage(language) {
    if (!language || !language.id || !language.name) {
        return {
            success: false,
            error: 'Invalid parameters: ' + JSON.stringify(language),
        };
    }
    language.id = normalizeLanguageId(language.id);
    const delimiterError = validateCacheSafeFields(language, LANGUAGE_CACHE_FIELDS);
    if (delimiterError) return delimiterError;

    const config = getAllData().data;
    const eventRoles = getEventRoles(
        config.userEmail,
        config.events,
        config.roles,
        config.isAppOwner,
    );
    const old = config.languages.find((l) => l.id === language.id);
    if (!old) {
        return { success: false, error: 'Language not found: ' + language.id };
    }

    if (!hasLanguageAccess(eventRoles)) {
        return {
            success: false,
            error: 'Access denied for email: ' + config.userEmail,
        };
    }

    if (!isValidLanguageId(language.id)) {
        return { success: false, error: 'Language id must be L1 or higher' };
    }

    return withLock(() => {
        const sheet = getSheet(SHEETS.LANGUAGE);
        sheet.getRange(old.row, 2).setValue(language.name);

        expireCache();

        return { success: true, data: { ...old, name: language.name } };
    }, 'editLanguage');
}

function reorderLanguages(languageIds) {
    if (!Array.isArray(languageIds)) {
        return {
            success: false,
            error: 'Invalid parameters: ' + JSON.stringify(languageIds),
        };
    }
    languageIds = languageIds.map((id) => normalizeLanguageId(id));

    const config = getAllData().data;
    const eventRoles = getEventRoles(
        config.userEmail,
        config.events,
        config.roles,
        config.isAppOwner,
    );

    if (!hasLanguageAccess(eventRoles)) {
        return {
            success: false,
            error: 'Access denied for email: ' + config.userEmail,
        };
    }

    if (languageIds.length !== config.languages.length) {
        return { success: false, error: 'Language list mismatch' };
    }

    const currentIds = new Set(config.languages.map((language) => language.id));
    const newIds = new Set(languageIds);
    if (newIds.size !== languageIds.length || newIds.size !== currentIds.size) {
        return { success: false, error: 'Language list mismatch' };
    }
    if (languageIds.some((id) => !currentIds.has(id))) {
        return { success: false, error: 'Language list mismatch' };
    }

    if (languageIds.length === 0) {
        return { success: true, data: [] };
    }

    return withLock(() => {
        const sheet = getSheet(SHEETS.LANGUAGE);
        const minRow = Math.min(...config.languages.map((language) => language.row));
        const maxRow = Math.max(...config.languages.map((language) => language.row));
        const orderRange = sheet.getRange(minRow, 3, maxRow - minRow + 1, 1);
        const orderValues = orderRange.getValues();

        languageIds.forEach((id, index) => {
            const language = config.languages.find((l) => l.id === id);
            const order = String(index + 1);
            orderValues[language.row - minRow][0] = order;
            language.order = order;
        });

        orderRange.setValues(orderValues);

        expireCache();

        return { success: true, data: config.languages };
    }, 'reorderLanguages');
}

function deleteLanguage(id) {
    if (!id) {
        return {
            success: false,
            error: 'Invalid parameters: ' + id,
        };
    }
    id = normalizeLanguageId(id);

    const config = getAllData().data;
    const eventRoles = getEventRoles(
        config.userEmail,
        config.events,
        config.roles,
        config.isAppOwner,
    );
    const language = config.languages.find((l) => l.id === id);

    if (!language) {
        return { success: false, error: 'Language not found: ' + id };
    }

    if (!hasLanguageAccess(eventRoles)) {
        return {
            success: false,
            error: 'Access denied for email: ' + config.userEmail,
        };
    }

    if (config.keys.some((k) => k.language === id) || config.roles.some((r) => r.language === id)) {
        return { success: false, error: 'Language is in use: ' + id };
    }

    return withLock(() => {
        const sheet = getSheet(SHEETS.LANGUAGE);
        sheet.getRange(language.row, 1, 1, sheet.getLastColumn()).clearContent();

        expireCache();

        return { success: true, data: true };
    }, 'deleteLanguage');
}

// ===== Key API =====
function addKey(key) {
    if (!key || !key.event || !key.name || !key.language || !key.server || !key.key) {
        return {
            success: false,
            error: 'Invalid parameters: ' + JSON.stringify(key),
        };
    }
    key.language = normalizeLanguageId(key.language);
    key.color = normalizeKeyColor(key.color);
    const delimiterError = validateCacheSafeFields(key, KEY_CACHE_FIELDS);
    if (delimiterError) return delimiterError;

    const config = getAllData().data;
    const eventRoles = getEventRoles(
        config.userEmail,
        config.events,
        config.roles,
        config.isAppOwner,
    );

    if (!isValidLanguage(config, key.language)) {
        return { success: false, error: 'Language not found: ' + key.language };
    }

    if (!hasKeyAccess(eventRoles, ACTIONS.CREATE, key.event, key.language)) {
        return {
            success: false,
            error: 'Access denied for email: ' + config.userEmail,
        };
    }

    const event = config.events.find((e) => e.id === key.event);
    if (!event) {
        return { success: false, error: 'Event not found: ' + key.event };
    }

    if (key.color !== KEY_COLORS.NONE && !hasKeyColorAccess(eventRoles, key.event)) {
        return {
            success: false,
            error: 'Only owners or admins can edit key colors.',
        };
    }

    return withLock(() => {
        const sheet = getSheet(SHEETS.KEY);
        const { headers, rows } = getAllRows(sheet);
        const idIndex = headers.indexOf('id');
        const keys = rows.map((row) => ({ id: row[idIndex] }));

        key.id = getNextSequentialId(keys, 'K');
        sheet.appendRow([
            key.id,
            key.event,
            key.name,
            '',
            key.server,
            key.key,
            key.server2,
            key.key2,
            key.link,
            key.color,
            key.remarks,
        ]);
        key.row = sheet.getLastRow();
        setTextCell(sheet, key.row, 4, key.language);

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
    key.language = normalizeLanguageId(key.language);
    key.color = normalizeKeyColor(key.color);
    const delimiterError = validateCacheSafeFields(key, KEY_CACHE_FIELDS);
    if (delimiterError) return delimiterError;

    const config = getAllData().data;
    const eventRoles = getEventRoles(
        config.userEmail,
        config.events,
        config.roles,
        config.isAppOwner,
    );
    const old = config.keys.find((k) => k.id === key.id);

    if (!old) {
        return { success: false, error: 'Key not found: ' + key.id };
    }

    if (key.event !== old.event) {
        return { success: false, error: 'Cannot move key between events: ' + key.id };
    }

    if (!isValidLanguage(config, key.language)) {
        return { success: false, error: 'Language not found: ' + key.language };
    }

    if (
        !hasKeyAccess(eventRoles, ACTIONS.UPDATE, key.event, key.language) ||
        !hasKeyAccess(eventRoles, ACTIONS.UPDATE, old.event, old.language)
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

    const oldColor = normalizeKeyColor(old.color);
    const streamingConfigChanged = hasStreamingConfigChanged(old, key);
    if (streamingConfigChanged) {
        key.color = KEY_COLORS.NONE;
    } else if (key.color !== oldColor && !hasKeyColorAccess(eventRoles, key.event)) {
        return {
            success: false,
            error: 'Only owners or admins can edit key colors.',
        };
    }

    return withLock(() => {
        const sheet = getSheet(SHEETS.KEY);
        setTextCell(sheet, old.row, 4, key.language);
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
    const eventRoles = getEventRoles(
        config.userEmail,
        config.events,
        config.roles,
        config.isAppOwner,
    );
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

    return withLock(() => {
        const sheet = getSheet(SHEETS.KEY);
        sheet.getRange(key.row, 1, 1, sheet.getLastColumn()).clearContent();

        expireCache();

        return { success: true, data: true };
    }, 'deleteKey');
}

// ===== Serve Webpage =====
function doGet() {
    return HtmlService.createHtmlOutputFromFile('Index').setTitle('Key Vault');
}
