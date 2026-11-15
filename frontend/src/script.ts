// @ts-nocheck

// The real backend (supabase.ts, loaded as auth.js) or, on the demo site, the mock.
function backendCall(functionName, params) {
    if (window.kvAuth) return window.kvAuth.call(functionName, params);
    return new Promise((resolve, reject) =>
        window.google.script.run
            .withFailureHandler(reject)
            .withSuccessHandler(resolve)
            [functionName](...params),
    );
}

async function api(functionName, ...params) {
    try {
        const res = await backendCall(functionName, params);
        if (res.success === false) {
            return { success: false, error: functionName + ': ' + res.error };
        }
        return { success: true, data: res.data };
    } catch (error) {
        return { success: false, error: functionName + ': ' + (error?.message || error) };
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
}

// What bunryu reports about each key (see keys.ts, getKeyDisplay). A failed refresh keeps
// the last report: a short network problem must not blank the colors.
async function fetchStatusAndRerender() {
    const response = await api('getStatus');
    if (response.success === false) {
        console.error(response.error);
        return;
    }
    keyStatus = response.data;
    renderBunryuStatus();
    const eventId = getUrlParam('event');
    if (eventId) renderKeyTable(eventId);
}

function renderBunryuStatus() {
    const el = document.getElementById('bunryu-status');
    if (!el) return;
    const { state, text, title } = describeBunryu(keyStatus);
    el.hidden = state === 'unknown';
    // Owners can click through to the settings bunryu needs.
    el.disabled = !config.isAppOwner;
    el.title = title + (config.isAppOwner ? ' (click for bunryu settings)' : '');
    document.getElementById('bunryu-status-text').textContent = text;
    document.getElementById('bunryu-dot').className =
        'h-2 w-2 rounded-full ' + (state === 'online' ? 'bg-success' : 'bg-base-content/30');
}

// The settings are fetched when the dialog opens and dropped when it closes, so the secrets
// are not kept in the page while nobody is looking at them.
let bunryuSettings = null;
let bunryuRevealed = false;
const BUNRYU_MASK = '\u2022'.repeat(12);

function renderBunryuSettings() {
    const body = document.getElementById('bunryu-body');
    const rows = bunryuSettings
        ? [
              ['url', 'Link (url)', bunryuSettings.url, false],
              ['token', 'Ingest token (token)', bunryuSettings.token, true],
              ['hashSecret', 'Hash secret (hash_secret)', bunryuSettings.hashSecret, true],
              ['instance', 'Instance name (instance)', bunryuSettings.instance, false],
          ]
        : [];
    body.innerHTML = rows.length
        ? `<table class="table"><tbody>${rows
              .map(([field, label, value, secret]) => {
                  const shown = secret && !bunryuRevealed ? BUNRYU_MASK : value;
                  return `<tr>
                      <th class="text-base-content/70 w-1/3 text-sm font-normal">${escapeHtml(label)}</th>
                      <td class="font-mono text-sm break-all">${escapeHtml(shown)}</td>
                      <td class="w-10"><button type="button" class="btn btn-ghost btn-square btn-xs" title="Copy" aria-label="Copy ${escapeHtml(label)}" data-action="copy-bunryu-value" data-field="${field}">${iconSvg('copy')}</button></td>
                  </tr>`;
              })
              .join('')}</tbody></table>`
        : '<span class="loading loading-dots"></span>';
    document.getElementById('bunryu-reveal-btn').textContent = bunryuRevealed
        ? 'Hide secrets'
        : 'Show secrets';
}

async function showBunryuModal() {
    if (!config.isAppOwner) return;
    const modal = document.getElementById('bunryu-modal');
    bunryuSettings = null;
    bunryuRevealed = false;
    renderBunryuSettings();
    modal.showModal();

    const response = await api('getBunryuSettings');
    if (response.success === false) {
        modal.close();
        showErrorAlert(response.error);
        return;
    }
    bunryuSettings = response.data;
    renderBunryuSettings();
}

function buildBunryuJson(settings) {
    return JSON.stringify(
        {
            key_vault: {
                url: settings.url,
                token: settings.token,
                hash_secret: settings.hashSecret,
                instance: settings.instance,
            },
        },
        null,
        4,
    );
}

function copyBunryuValue(field) {
    if (bunryuSettings && field in bunryuSettings) return copyTextValue(bunryuSettings[field]);
}

function copyBunryuJson() {
    if (bunryuSettings) return copyTextValue(buildBunryuJson(bunryuSettings));
}

document.getElementById('bunryu-modal')?.addEventListener('close', () => {
    bunryuSettings = null;
    bunryuRevealed = false;
    renderBunryuSettings();
});

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
const STATUS_REFRESH_TIME = 30 * 1000;
// The latest answer of getStatus. bunryu only runs during events, so no report is normal
// and gets no warning: the colors just clear.
let keyStatus = { online: false, instances: [], keys: {} };
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
    if (window.kvAuth) {
        if (!(await window.kvAuth.start())) return;
    } else if (typeof google === 'undefined') {
        window.google = googleMock;
    }

    fetchDataAndRerender();
    setInterval(fetchDataAndRerender, REFRESH_TIME);
    fetchStatusAndRerender();
    setInterval(fetchStatusAndRerender, STATUS_REFRESH_TIME);

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
        'show-bunryu': () => showBunryuModal(),
        'toggle-bunryu-secrets': () => {
            bunryuRevealed = !bunryuRevealed;
            renderBunryuSettings();
        },
        'copy-bunryu-value': () => copyBunryuValue(target.dataset.field),
        'copy-bunryu-json': () => copyBunryuJson(),
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
