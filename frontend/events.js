function renderEventTabBar(eventId = null) {
    const events = config.events.filter((e) => e.id && e.name);
    const event = events.find((e) => e.id === eventId);
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

    document
        .querySelector('#show-settings-btn')
        .classList.toggle('hidden', !hasLanguageAccess(eventRoles));

    document.querySelector('#edit-event-btn').disabled = false;
    document.querySelector('#delete-event-btn').disabled = events.length <= 1;

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
    const eventNumbers = config.events
        .filter((e) => e.name.startsWith('Event '))
        .map((e) => parseInt(e.name.split(' ')[1], 10));
    const maxNumber = Math.max(...eventNumbers, 0);
    const nextNumber = maxNumber + 1;

    showLoading();
    document.querySelector('#add-event-btn').disabled = true;
    try {
        const event = processResponse(await api('addEvent', { name: `Event ${nextNumber}` }));
        if (event === null) return;
        config.events.push(event);
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

    renderKeyTable(id);
    renderKeyLanguages(id);
    if (hasKeyAccess(eventRoles, ACTIONS.CREATE, id) && config.events.some((e) => e.id === id)) {
        document.querySelector('#add-key-btn').classList.remove('hidden');
    } else {
        document.querySelector('#add-key-btn').classList.add('hidden');
    }
}
