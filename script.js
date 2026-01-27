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
    errorAlertElem.querySelector('.msg').innerText = error;
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

async function addEventBtn() {
    const maxNumber =
        Math.max(...config.events.map((e) => parseInt(e.name.split(' ')[1], 10))) || 0;
    const nextNumber = maxNumber + 1;
    const res = await addEvent({ name: `Event ${nextNumber}` });

    const data = processResponse(res);
    if (data === null) return;
    selectEvent(data.id);
}

function selectEvent(id) {
    setUrlParam('event', id);
    renderEventTabBar(id);
    renderRoleTable(id);
    renderKeyTable(id);
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

    config = processResponse(await getAllData());
    eventRoles = getEventRoles(email, config.events, config.roles);
    const storageStatus = Math.round(new Blob([JSON.stringify(config)]).size / 1000);
    document.querySelector('#storage-progress').value = String(storageStatus);
    document.querySelector('#storage-progress').title = storageStatus + '%';

    if (hasEventAccess(eventRoles, ACTIONS.CREATE)) {
        document.querySelector('#add-event-btn').classList.remove('hidden');
        document.querySelector('#edit-event-btn').classList.remove('hidden');
        document.querySelector('#delete-event-btn').classList.remove('hidden');
    }

    if (config.events.length > 0) {
        selectEvent(config.events[0].id);
    }

    document.querySelector('#role-language-input').innerHTML =
        '<option value="*">* (All)</option>' +
        LANGUAGES.map((lang) => `<option value="${lang}">${LANGUAGE_MAP[lang]}</option>`).join('');

    document.querySelector('#key-color-input').innerHTML = Object.keys(COLORS)
        .map((id) => `<option value="${id}" class="${COLORS[id].css}">${COLORS[id].name}</option>`)
        .join('');

    document.querySelector('#key-server-input').innerHTML = Object.keys(SERVERS)
        .map((id) => `<option value="${id}">${SERVERS[id].name}</option>`)
        .join('');

    document.querySelector('#key-server-input').addEventListener('change', (event) => {
        const customUrlElem = document.querySelector('#custom-url');
        if (event.target.value === '') {
            customUrlElem.classList.remove('hidden');
        } else {
            customUrlElem.classList.add('hidden');
        }
    });
})();
