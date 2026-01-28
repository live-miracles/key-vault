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

function updateEventRoles(userEmail, config) {
    eventRoles = getEventRoles(userEmail, config.events, config.roles);
}

let userEmail = null;
let config = {
    size: 0,
    events: [],
    roles: [],
    keys: [],
};
let eventRoles = {};

(async () => {
    if (typeof google === 'undefined') {
        window.google = googleMock;
    }

    userEmail = processResponse(await getUserEmail());
    document.querySelector('#user-email').innerText = userEmail;

    config = processResponse(await getAllData());
    updateEventRoles(userEmail, config);

    // ===== Storage status =====
    const storageStatus = Math.round(config.size / 1000);
    document.querySelector('#storage-progress').value = String(storageStatus);
    document.querySelector('#storage-progress').title = 'Used storage: ' + storageStatus + '%';

    // ===== Events =====
    if (hasEventAccess(eventRoles, ACTIONS.CREATE)) {
        document.querySelector('#add-event-btn').classList.remove('hidden');
        document.querySelector('#edit-event-btn').classList.remove('hidden');
    }

    if (config.events.length > 0) {
        selectEvent(config.events[0].id);
    }

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
