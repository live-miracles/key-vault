function processResponse(response) {
    if (response.success === false) {
        showErrorAlert(response.error);
        return null;
    }
    return response.data;
}

function maskKey(key) {
    if (!key || key.length === 0) {
        return '';
    }
    if (key.length <= 6) {
        if (key.length === 1) {
            return key;
        }
        return key[0] + ' ... ' + key[key.length - 1];
    }
    return key.substring(0, 3) + ' ... ' + key.substring(key.length - 3);
}

let alertCount = 0;
function showErrorAlert(error, log = true) {
    const errorAlertElem = document.getElementById('error-alert');
    if (!errorAlertElem) return;
    errorAlertElem.classList.remove('hidden');
    document.getElementById('error-msg').innerText = error;
    console.error(error);
    const alertId = ++alertCount;
    setTimeout(() => {
        if (alertId !== alertCount) return;
        errorAlertElem.classList.add('hidden');
    }, 5000);
}

function renderEventTabBar(eventId = null) {
    const tabsElem = document.querySelector('.tabs');
    tabsElem.innerHTML = config.events
        .map(
            (e) => `
        <a role="tab" class="tab ${eventId === e.id ? 'tab-active' : ''}"
          onclick="selectEvent('${e.id}')">${e.name}</a>`,
        )
        .join('');
}

function showHideRoles() {
    document.querySelector('#role-table').classList.toggle('hidden');
}

function selectEvent(id) {
    setUrlParam('event', id);
    renderEventTabBar(id);
    renderKeyTable(id);
}

let config = {
    events: [],
    roles: [],
    keys: [],
};

(async () => {
    if (typeof google === 'undefined') {
        window.google = googleMock;
    }

    const email = processResponse(await getUserEmail());
    document.querySelector('#user-email').innerText = email;

    config = processResponse(await getAllDetails());

    if (config.events.length > 0) {
        selectEvent(config.events[0].id);
    }
})();
