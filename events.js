function renderEventTabBar(eventId = null) {
    if (hasEventAccess(eventRoles, ACTIONS.DELETE, eventId) && config.events.length > 1) {
        document.querySelector('#delete-event-btn').classList.remove('hidden');
    } else {
        document.querySelector('#delete-event-btn').classList.add('hidden');
    }

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
    const eventNumbers = config.events
        .filter((e) => e.name.startsWith('Event '))
        .map((e) => parseInt(e.name.split(' ')[1], 10));
    const maxNumber = Math.max(...eventNumbers, 0);
    const nextNumber = maxNumber + 1;

    showLoading();
    document.querySelector('#add-event-btn').disabled = true;
    const event = processResponse(await addEvent({ name: `Event ${nextNumber}` }));
    if (event === null) return;
    config.events.push(event);
    updateEventRoles(userEmail, config);
    selectEvent(event.id);
    document.querySelector('#add-event-btn').disabled = false;
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
    const newEvent = processResponse(await editEvent(event));
    if (newEvent !== null) {
        const old = config.events.find((e) => e.id === newEvent.id);
        console.assert(old);
        config.events.splice(config.events.indexOf(old), 1, newEvent);
    }
    selectEvent(event.id);
    document.querySelector('#edit-event-btn').disabled = false;
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
    const res = processResponse(await deleteEvent(event.id));
    if (res !== null) {
        config.events = config.events.filter((e) => e.id !== event.id);
    }
    selectEvent(config.events[0]?.id || '');
    document.querySelector('#delete-event-btn').disabled = false;
    hideLoading();
}

function selectEvent(id) {
    setUrlParam('event', id);
    renderEventTabBar(id);
    renderRoleTable(id);
    renderKeyTable(id);
}
