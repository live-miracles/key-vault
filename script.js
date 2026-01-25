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

function renderRoleTable(eventId = null) {
    document.querySelector('#role-rows').innerHTML = config.roles
        .filter((r) => (r.event = eventId))
        .sort((r1, r2) => {
            if (r1.role === 'admin' && r2.role !== 'admin') return -1;
            if (r1.role !== 'admin' && r2.role === 'admin') return 1;
            if (r1.role === 'editor' && r2.role !== 'editor') return -1;
            if (r1.role !== 'editor' && r2.role === 'editor') return 1;
            if (r1.role === 'viewer' && r2.role !== 'viewer') return -1;
            if (r1.role !== 'viewer' && r2.role === 'viewer') return 1;
            return r1.email.localeCompare(r2.email);
        })
        .map(
            (r) => `
            <tr>
                <th>${r.email}</th>
                <td>${capitalize(r.role)}</td>
                <td>${capitalize(r.language)}</td>
                <td>${r.remarks}</td>
            </tr>
        `,
        )
        .join('');
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

    document.querySelector('#server-url-input').addEventListener('change', (event) => {
        const customUrlElem = document.querySelector('#custom-url');
        if (event.target.value === '') {
            customUrlElem.classList.remove('hidden');
        } else {
            customUrlElem.classList.add('hidden');
        }
    });
})();
