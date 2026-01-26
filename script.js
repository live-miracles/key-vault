function processResponse(response) {
    if (response.success === false) {
        showErrorAlert(response.error);
        return null;
    }
    return response.data;
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
    const event = config.events.find((e) => e.id === eventId);
    const name = event ? event.name : '';
    document.getElementById('event-name').innerText = name;

    const tabsElem = document.querySelector('.tabs');
    tabsElem.innerHTML = config.events
        .map(
            (e) => `
        <a role="tab" class="tab ${eventId === e.id ? 'tab-active' : ''}"
          onclick="selectEvent('${e.id}')">${e.name}</a>`,
        )
        .join('');
}

function selectEvent(id) {
    setUrlParam('event', id);
    renderEventTabBar(id);
    renderRoleTable(id);
    renderKeyTable(id);
}

function showHideRoles() {
    document.querySelector('#role-table').classList.toggle('hidden');
}

let config = {
    events: [],
    roles: [],
    keys: [],
};
let eventRoles = {};

(async () => {
    if (typeof google === 'undefined') {
        window.google = googleMock;
    }

    const email = processResponse(await getUserEmail());
    document.querySelector('#user-email').innerText = email;

    config = processResponse(await getAllDetails());
    eventRoles = getEventRoles(email, config.events, config.roles);

    if (hasEventAccess(eventRoles, ACTIONS.CREATE)) {
        document.querySelector('#add-event-btn').classList.remove('hidden');
        document.querySelector('#edit-event-btn').classList.remove('hidden');
        document.querySelector('#delete-event-btn').classList.remove('hidden');
    }

    if (config.events.length > 0) {
        selectEvent(config.events[0].id);
    }

    document.querySelector('#server-url-input').addEventListener('change', (event) => {
        const customUrlElem = document.querySelector('#custom-url');
        if (event.target.value === '') {
            customUrlElem.classList.remove('hidden');
        } else {
            customUrlElem.classList.add('hidden');
        }
    });
})();
