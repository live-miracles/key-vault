function renderEventTabBar(eventId = null) {
    const events = config.events.filter((e) => e.id && e.name);
    const event = events.find((e) => e.id === eventId);
    const name = event?.name || '';
    const isPending = Boolean(event?.pending);
    const canCreateEvents = hasEventAccess(eventRoles, ACTIONS.CREATE);
    const canManageLanguages = hasLanguageAccess(eventRoles);
    document.getElementById('event-name').innerText = name;

    document.querySelector('#add-event-btn').disabled = !canCreateEvents;
    document.querySelector('#add-event-btn').classList.toggle('hidden', !canCreateEvents);

    if (hasEventAccess(eventRoles, ACTIONS.UPDATE, eventId) && !isPending) {
        document.querySelector('#edit-event-btn').classList.remove('hidden');
        document.querySelector('#delete-event-btn').classList.remove('hidden');
    } else {
        document.querySelector('#edit-event-btn').classList.add('hidden');
        document.querySelector('#delete-event-btn').classList.add('hidden');
    }

    document.querySelector('#show-settings-btn').disabled = !canManageLanguages;
    document.querySelector('#show-settings-btn').classList.toggle('hidden', !canManageLanguages);

    document.querySelector('#edit-event-btn').disabled = isPending;
    document.querySelector('#delete-event-btn').disabled = isPending;

    const tabsElem = document.querySelector('.tabs');
    tabsElem.replaceChildren(
        ...events.map((e) => {
            const tab = document.createElement('a');
            tab.role = 'tab';
            tab.className = `tab ${eventId === e.id ? 'tab-active' : ''}`;
            tab.textContent = e.name;
            tab.addEventListener('click', () => selectEvent(e.id));
            return tab;
        }),
    );
}

async function addEventBtn() {
    if (!hasEventAccess(eventRoles, ACTIONS.CREATE)) return;

    const eventNumbers = config.events
        .filter((e) => e.name.startsWith('Event '))
        .map((e) => parseInt(e.name.split(' ')[1], 10));
    const maxNumber = Math.max(...eventNumbers, 0);
    const nextNumber = maxNumber + 1;

    const snapshot = cloneConfig();
    const optimisticEvent = {
        id: getNextSequentialId(config.events, 'E'),
        name: `Event ${nextNumber}`,
        pending: true,
    };

    config.events.push(optimisticEvent);
    updateEventRoles(config);
    selectEvent(optimisticEvent.id);

    showLoading();
    document.querySelector('#add-event-btn').disabled = true;
    try {
        const event = processResponse(await api('addEvent', { name: `Event ${nextNumber}` }));
        if (event === null) {
            restoreConfig(snapshot);
            return;
        }
        replaceConfigItem('events', event, optimisticEvent.id);
        updateEventRoles(config);
        selectEvent(event.id);
    } finally {
        document.querySelector('#add-event-btn').disabled = false;
        hideLoading();
    }
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
    const snapshot = cloneConfig();
    replaceConfigItem('events', event);
    updateEventRoles(config);
    selectEvent(event.id);

    showLoading();
    document.querySelector('#edit-event-btn').disabled = true;
    try {
        const newEvent = processResponse(await api('editEvent', event));
        if (newEvent === null) {
            restoreConfig(snapshot, event.id);
            return;
        }
        replaceConfigItem('events', newEvent);
        updateEventRoles(config);
        selectEvent(newEvent.id);
    } finally {
        document.querySelector('#edit-event-btn').disabled = false;
        hideLoading();
    }
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

    const snapshot = cloneConfig();
    config.events = config.events.filter((e) => e.id !== event.id);
    updateEventRoles(config);
    selectEvent(config.events[0]?.id || '');

    showLoading();
    document.querySelector('#delete-event-btn').disabled = true;
    try {
        const res = processResponse(await api('deleteEvent', event.id));
        if (res === null) {
            restoreConfig(snapshot, event.id);
        }
    } finally {
        document.querySelector('#delete-event-btn').disabled = false;
        hideLoading();
    }
}

function selectEvent(id) {
    setUrlParam('event', id);

    const hasEvents = config.events.length > 0;
    const canCreateEvents = hasEventAccess(eventRoles, ACTIONS.CREATE);
    document.querySelector('#no-events-message').innerText = canCreateEvents
        ? 'No events currently configured. Please add them.'
        : 'No events are available for the signed-in email:';
    document.querySelector('#no-events-email').innerText = canCreateEvents
        ? ''
        : `${config.userEmail || 'unknown email'}.`;
    document.querySelector('#no-events-access').classList.toggle('hidden', hasEvents);
    document.querySelector('#no-events-access').classList.toggle('flex', !hasEvents);
    document.querySelector('#key-table').classList.toggle('hidden', !hasEvents);

    renderEventTabBar(id);

    if (!hasEvents) {
        document.querySelector('#show-roles-btn').classList.add('hidden');
        document.querySelector('#add-role-btn').classList.add('hidden');
        document.querySelector('#edit-role-btn').classList.add('hidden');
        document.querySelector('#delete-role-btn').classList.add('hidden');
        document.querySelector('#add-key-btn').classList.add('hidden');
        renderRoleTable(id);
        renderKeyTable(id);
        return;
    }

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

    renderKeyTable(id);
    renderKeyLanguages(id);
    if (hasKeyAccess(eventRoles, ACTIONS.CREATE, id) && config.events.some((e) => e.id === id)) {
        document.querySelector('#add-key-btn').classList.remove('hidden');
    } else {
        document.querySelector('#add-key-btn').classList.add('hidden');
    }
}
