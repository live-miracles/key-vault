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
    eventRoles = getEventRoles(config.userEmail, config.events, config.roles);
}

async function fetchDataAndRerender() {
    const newConfig = processResponse(await api('getAllData'));
    if (newConfig.etag === config.etag) return;
    config = newConfig;
    updateEventRoles(config);

    const eventId = getUrlParam('eventId');
    if (config.events.find((e) => e.id === eventId)) {
        selectEvent(eventId);
    } else if (config.events.length > 0) {
        selectEvent(config.events[0].id);
    } else {
        console.error('No events');
        selectEvent('');
    }

    document.querySelector('#user-email').innerText = config.userEmail;

    // ===== Storage status =====
    const storageStatus = Math.round(config.size / 1000);
    document.querySelector('#storage-progress').value = String(storageStatus);
    document.querySelector('#storage-progress').title = 'Used storage: ' + storageStatus + '%';

    // ===== Events =====
    if (hasEventAccess(eventRoles, ACTIONS.CREATE)) {
        document.querySelector('#add-event-btn').classList.remove('hidden');
        document.querySelector('#edit-event-btn').classList.remove('hidden');
    }
}

const REFRESH_TIME = 5 * 60 * 1000;
let userEmail = null;
let config = {
    size: 0,
    userEmail: '',
    etag: '',
    events: [],
    roles: [],
    keys: [],
};
let eventRoles = {};

(async () => {
    if (typeof google === 'undefined') {
        window.google = googleMock;
    }

    fetchDataAndRerender();
    setInterval(fetchDataAndRerender, REFRESH_TIME);

    // ===== Roles =====
    document.addEventListener('click', () =>
        document.getElementById('role-context-menu').classList.add('hidden'),
    );
    document.querySelector('#role-language-input').innerHTML =
        '<option value="*">* (All)</option>' +
        LANGUAGES.map((lang) => `<option value="${lang}">${LANGUAGE_MAP[lang]}</option>`).join('');

    // ===== Keys =====
    document.addEventListener('click', () =>
        document.getElementById('key-context-menu').classList.add('hidden'),
    );

    document.querySelector('#key-color-input').innerHTML = Object.keys(COLORS)
        .map((id) => `<option value="${id}" class="${COLORS[id].css}">${COLORS[id].name}</option>`)
        .join('');

    document.querySelector('#key-server-input').innerHTML = Object.keys(SERVERS)
        .map((id) => `<option value="${id}">${SERVERS[id].name}</option>`)
        .join('');

    document.querySelector('#key-server2-input').innerHTML = Object.keys(SERVERS)
        .map((id) => `<option value="${id}">${SERVERS[id].name}</option>`)
        .join('');

    document
        .querySelector('#key-server-input')
        .addEventListener('change', (event) => renderServerInput(event.target.value));

    document
        .querySelector('#key-server2-input')
        .addEventListener('change', (event) => renderServerInput(event.target.value, '2'));
})();
