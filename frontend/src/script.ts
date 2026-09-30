// @ts-nocheck

async function api(functionName, ...params) {
    try {
        const res = await new Promise((resolve, reject) =>
            window.google.script.run
                .withFailureHandler(reject)
                .withSuccessHandler(resolve)
                [functionName](...params),
        );
        if (res.success === false) {
            return { success: false, error: functionName + ': ' + res.error };
        }
        return { success: true, data: res.data };
    } catch (error) {
        return { success: false, error: functionName + ': ' + error };
    }
}

function processResponse(response) {
    if (response.success === false) {
        showErrorAlert(response.error);
        return null;
    }
    return response.data;
}

function cloneConfig() {
    return structuredClone(config);
}

function restoreConfig(snapshot, eventId = getUrlParam('event')) {
    config = snapshot;
    updateEventRoles(config);
    selectEvent(eventId);
}

function replaceConfigItem(collectionName, item, oldId = item.id) {
    const collection = config[collectionName];
    const index = collection.findIndex((entry) => entry.id === oldId);
    if (index === -1) {
        collection.push(item);
    } else {
        collection.splice(index, 1, item);
    }
}

let alertCount = 0;
function showErrorAlert(error, log = true) {
    const elem = document.getElementById('error-alert');
    if (!elem) return;
    elem.classList.remove('hidden');
    elem.querySelector('.msg').innerText = error;
    if (log) console.error(error);
    const alertId = ++alertCount;
    setTimeout(() => {
        if (alertId !== alertCount) return;
        elem.classList.add('hidden');
    }, 5000);
}

function showLoading() {
    document.getElementById('saving-badge').checked = true;
}

function hideLoading() {
    document.getElementById('saving-badge').checked = false;
}

function updateEventRoles(config) {
    const validEvents = config.events.filter((e) => e.id && e.name);
    eventRoles = getEventRoles(config.userEmail, validEvents, config.roles, config.isAppOwner);
}

async function fetchDataAndRerender() {
    const newConfig = processResponse(await api('getAllData', config.etag));
    if (newConfig === null) return;
    if (newConfig.etag === config.etag) return;
    config = newConfig;
    updateEventRoles(config);

    const eventId = getUrlParam('event');
    if (config.events.find((e) => e.id === eventId)) {
        selectEvent(eventId);
    } else if (config.events.length > 0) {
        selectEvent(config.events[0].id);
    } else {
        selectEvent('');
    }

    document.querySelector('#user-email').innerText = config.userEmail;

    // ===== Storage status =====
    const storageStatus = Math.round(config.size / 1000);
    document.querySelector('#storage-progress').value = String(storageStatus);
    document.querySelector('#storage-progress').title = 'Used storage: ' + storageStatus + '%';
}

async function refreshDataBtn() {
    const button = document.querySelector('#refresh-data-btn');
    const keyRows = document.querySelector('#key-rows');
    button.disabled = true;
    keyRows.classList.add('key-rows-refreshing');
    keyRows.setAttribute('aria-busy', 'true');
    try {
        await fetchDataAndRerender();
    } finally {
        keyRows.classList.remove('key-rows-refreshing');
        keyRows.removeAttribute('aria-busy');
        button.disabled = false;
    }
}

const REFRESH_TIME = 5 * 60 * 1000;
let userEmail = null;
let config = {
    size: 0,
    userEmail: '',
    isAppOwner: false,
    etag: '',
    events: [],
    roles: [],
    keys: [],
    languages: [],
};
let eventRoles = {};

(async () => {
    if (typeof google === 'undefined') {
        window.google = googleMock;
    }

    fetchDataAndRerender();
    setInterval(fetchDataAndRerender, REFRESH_TIME);

    // ===== Roles =====
    document.addEventListener('click', () => {
        document.getElementById('role-context-menu').classList.add('hidden');
        hideKeyColorMenu();
    });
    document.getElementById('share-modal').addEventListener('close', resetRoleInlineEdit);
    document.querySelector('#key-color-input').innerHTML = Object.keys(COLORS)
        .map((id) => `<option value="${id}" class="${COLORS[id].css}">${COLORS[id].name}</option>`)
        .join('');

    document.querySelector('#key-server-input').innerHTML =
        '<option value="" disabled selected>Server URL</option>' +
        Object.keys(SERVERS)
            .filter((id) => id !== '')
            .map((id) => `<option value="${id}">${SERVERS[id].name}</option>`)
            .join('');

    document.querySelector('#key-server2-input').innerHTML = Object.keys(SERVERS)
        .map((id) => `<option value="${id}">${SERVERS[id].name}</option>`)
        .join('');

    document.querySelector('#key-server-input').addEventListener('change', (event) => {
        renderServerInput(event.target.value);
        applyBackupServerLock();
    });

    document
        .querySelector('#key-server2-input')
        .addEventListener('change', (event) => renderServerInput(event.target.value, '2'));

    document
        .querySelector('#key-custom-server-input')
        .addEventListener('input', () => convertKnownCustomServerUrl());

    document
        .querySelector('#key-custom-server2-input')
        .addEventListener('input', () => convertKnownCustomServerUrl('2'));

    document.querySelector('#stream-key-input').addEventListener('input', applyBackupServerLock);
})();

// Keep the frontend bundle scoped: the HTML uses data-action attributes and
// this delegated layer routes them to the existing UI functions. Apps Script
// RPC entry points remain global in the backend, but browser UI handlers do
// not need to leak onto window.
document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!target) return;

    const row = target.closest('tr');
    const keyContainer = target.closest('[data-key-id]');
    const action = target.dataset.action;
    const actions = {
        'save-event': () => saveEventFormBtn(event),
        'edit-role': () => editRoleRow(),
        'delete-role': () => deleteRoleRow(),
        'save-language': () => saveLanguageFormBtn(event),
        'save-key': () => saveKeyFormBtn(event),
        'edit-event': () => editEventBtn(),
        'delete-event': () => deleteEventBtn(),
        'show-settings': () => showSettingsModal(),
        'refresh-data': () => refreshDataBtn(),
        'add-key': () => addKeyBtn(),
        'show-share': () => showShareModal(),
        'add-role': () => addRoleBtn(),
        'add-language': () => addLanguageBtn(),
        'add-event': () => addEventBtn(),
        'edit-role-by-id': () => editRoleById(row?.dataset.roleId),
        'delete-role-by-id': () => deleteRoleById(row?.dataset.roleId),
        'save-role-inline': () => saveRoleInlineBtn(target),
        'cancel-role-inline': () => cancelRoleInlineEdit(),
        'edit-language-by-id': () => editLanguageById(row?.dataset.languageId),
        'delete-language-by-id': () => deleteLanguageById(row?.dataset.languageId),
        'edit-key-by-id': () => editKeyById(keyContainer?.dataset.keyId),
        'delete-key-by-id': () => deleteKeyById(keyContainer?.dataset.keyId),
        'copy-text': () => copyTextValue(target.dataset.copyValue),
        'copy-selected-key-url': () => copySelectedKeyUrl(target.dataset.actionType),
        'change-key-color': () => changeSelectedKeyColor(target.dataset.colorId),
    };

    const handler = actions[action];
    if (!handler) return;
    void handler();
});

document.addEventListener('change', (event) => {
    const target =
        event.target instanceof Element
            ? event.target.closest('[data-action="render-role-language"]')
            : null;
    if (target) renderRoleLanguageForRow(target);
});
