function renderEventTabBar(eventId = null) {
    const event = config.events.find((e) => e.id === eventId);
    const name = event?.name || '';
    document.getElementById('event-name').innerText = name;

    if (hasEventAccess(eventRoles, ACTIONS.CREATE)) {
        document.querySelector('#add-event-btn').disabled = false;
        document.querySelector('#add-event-btn').classList.remove('hidden');
    } else {
        document.querySelector('#add-event-btn').classList.add('hidden');
    }

    if (hasEventAccess(eventRoles, ACTIONS.UPDATE, eventId)) {
        document.querySelector('#edit-event-btn').classList.remove('hidden');
        document.querySelector('#delete-event-btn').classList.remove('hidden');
    } else {
        document.querySelector('#edit-event-btn').classList.add('hidden');
        document.querySelector('#delete-event-btn').classList.add('hidden');
    }

    if (event.status === EVENT_STATUS.LOCKED) {
        document.querySelector('#lock-event-btn').classList.remove('btn-neutral');
        document.querySelector('#lock-event-btn').classList.add('btn-accent');
        document.querySelector('#edit-event-btn').disabled = true;
        document.querySelector('#delete-event-btn').disabled = true;
    } else {
        document.querySelector('#lock-event-btn').classList.add('btn-neutral');
        document.querySelector('#lock-event-btn').classList.remove('btn-soft');
        document.querySelector('#edit-event-btn').disabled = false;
        document.querySelector('#delete-event-btn').disabled = config.events.length <= 1;
    }

    const tabsElem = document.querySelector('.tabs');
    tabsElem.innerHTML = config.events
        .map(
            (e) => `
        <a role="tab" class="tab ${eventId === e.id ? 'tab-active' : ''}"
          onclick="selectEvent('${e.id}')">${e.name}</a>`,
        )
        .join('');
}

async function lockEventBtn() {
    const eventId = getUrlParam('event');
    const event = config.events.find((e) => e.id === eventId);
    if (!event) {
        console.error('Event not found:', eventId);
        return;
    }

    const locked = event.status === EVENT_STATUS.LOCKED;
    if (!hasEventAccess(eventRoles, ACTIONS.LOCK, eventId)) {
        alert(`Only Admins can ${locked ? 'unlock' : 'lock'} the event.`);
        return;
    }

    if (
        !confirm(
            `Are you sure you want to ${locked ? 'unlock' : 'lock'} the event "${event.name}"?`,
        )
    ) {
        return;
    }

    showLoading();
    document.querySelector('#lock-event-btn').disabled = true;
    const newEvent = processResponse(
        await api('lockEvent', { id: event.id, status: locked ? '' : EVENT_STATUS.LOCKED }),
    );
    if (newEvent !== null) {
        event.status = newEvent.status;
    }
    document.querySelector('#lock-event-btn').disabled = false;
    selectEvent(event.id);
    hideLoading();
}

async function addEventBtn() {
    const eventNumbers = config.events
        .filter((e) => e.name.startsWith('Event '))
        .map((e) => parseInt(e.name.split(' ')[1], 10));
    const maxNumber = Math.max(...eventNumbers, 0);
    const nextNumber = maxNumber + 1;

    showLoading();
    document.querySelector('#add-event-btn').disabled = true;
    const event = processResponse(
        await api('addEvent', { name: `Event ${nextNumber}`, status: '' }),
    );
    if (event === null) return;
    config.events.push(event);
    updateEventRoles(config);
    selectEvent(event.id);
    hideLoading();
}

function editEventBtn() {
    const eventId = getUrlParam('event');
    const event = config.events.find((e) => e.id === eventId);
    if (!event) {
        console.error('Event not found:', eventId);
        return;
    }

    document.querySelector('#event-id-input').value = event.id;
    document.querySelector('#event-name-input').value = event.name;
    document.querySelector('#event-status-input').value = event.status;
    document.getElementById('event-modal').showModal();
}

async function saveEventFormBtn(evt) {
    const event = {
        id: document.getElementById('event-id-input').value.trim(),
        name: document.getElementById('event-name-input').value.trim(),
    };

    // Validation
    let errorElem = document.querySelector('#event-name-input').nextElementSibling;
    if (event.name === '') {
        errorElem.innerText = "Name can't be empty";
        evt.preventDefault();
        return;
    } else if (!/^[a-zA-Z0-9_\- ]*$/.test(event.name)) {
        errorElem.innerText = 'Only letters, numbers, spaces, -, _';
        evt.preventDefault();
        return;
    } else {
        errorElem.innerText = '';
    }

    // Sending request
    showLoading();
    document.querySelector('#edit-event-btn').disabled = true;
    const newEvent = processResponse(await api('editEvent', event));
    if (newEvent !== null) {
        const old = config.events.find((e) => e.id === newEvent.id);
        console.assert(old);
        config.events.splice(config.events.indexOf(old), 1, newEvent);
    }
    selectEvent(event.id);
    hideLoading();
}

async function deleteEventBtn() {
    const eventId = getUrlParam('event');
    const event = config.events.find((e) => e.id === eventId);
    if (!event) {
        console.error('Event not found:', eventId);
        return;
    }

    if (!confirm(`Are you sure you want to delete event "${event.name}"?`)) {
        return;
    }

    showLoading();
    document.querySelector('#delete-event-btn').disabled = true;
    const res = processResponse(await api('deleteEvent', event.id));
    if (res !== null) {
        config.events = config.events.filter((e) => e.id !== event.id);
    }
    selectEvent(config.events[0]?.id || '');
    hideLoading();
}

function selectEvent(id) {
    setUrlParam('event', id);

    renderEventTabBar(id);

    renderRoleTable(id);
    if (hasRoleAccess(eventRoles, ACTIONS.VIEW, id)) {
        document.querySelector('#show-roles-btn').classList.remove('hidden');
    } else {
        document.querySelector('#show-roles-btn').classList.add('hidden');
    }

    if (hasRoleAccess(eventRoles, ACTIONS.CREATE, id)) {
        document.querySelector('#add-role-btn').classList.remove('hidden');
        document.querySelector('#edit-role-btn').classList.remove('hidden');
        document.querySelector('#delete-role-btn').classList.remove('hidden');
    } else {
        document.querySelector('#add-role-btn').classList.add('hidden');
        document.querySelector('#edit-role-btn').classList.add('hidden');
        document.querySelector('#delete-role-btn').classList.add('hidden');
    }

    const event = config.events.find((e) => e.id === id);
    renderKeyTable(id);
    renderKeyLanguages(id);
    if (
        hasKeyAccess(eventRoles, ACTIONS.CREATE, id) &&
        event &&
        event.status !== EVENT_STATUS.LOCKED
    ) {
        document.querySelector('#add-key-btn').classList.remove('hidden');
    } else {
        document.querySelector('#add-key-btn').classList.add('hidden');
    }
}
