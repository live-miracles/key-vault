// The event bar and the event's own card: which event is open, adding, renaming and deleting.

import { actions, app } from './app.ts';
import { $, confirmAction } from './dom.ts';
import { route } from './route.ts';

const NAME_PATTERN = /^[a-zA-Z0-9_\- ]*$/;

function show(selector: string, visible: boolean) {
    $(selector).classList.toggle('hidden', !visible);
}

// Opens an event, and by default its input list on All.
export function selectEvent(eventId: string, input: string | null = null) {
    route.go({ event: eventId, view: null, input });
}

export function renderEventBar(eventId: string) {
    const { data } = app;
    const event = data.events.find((e) => e.id === eventId);
    const isPending = Boolean(event?.pending);
    const hasEvents = data.events.length > 0;

    // An event is named in its own card, beside the controls that act on it alone.
    $('#event-card-name').innerText = event?.name || '';
    $('#event-card-name').title = event?.name || '';

    $<HTMLButtonElement>('#add-event-btn').disabled = !data.canCreateEvents;
    show('#add-event-btn', data.canCreateEvents);
    show('#edit-event-btn', Boolean(event?.can.rename) && !isPending);
    show('#delete-event-btn', Boolean(event?.can.delete) && !isPending);
    $<HTMLButtonElement>('#edit-event-btn').disabled = isPending;
    $<HTMLButtonElement>('#delete-event-btn').disabled = isPending;

    $('#no-events-message').innerText = data.canCreateEvents
        ? 'No events currently configured. Please add them.'
        : 'No events are available for the signed-in email:';
    $('#no-events-email').innerText = data.canCreateEvents
        ? ''
        : `${data.userEmail || 'unknown email'}.`;
    show('#no-events-access', !hasEvents);
    $('#no-events-access').classList.toggle('flex', !hasEvents);
    show('#key-table', hasEvents);

    // Who may see or change who has access, and add destinations, is the server's answer.
    show('#show-roles-btn', Boolean(event?.can.viewRoles));
    const canManageRoles = Boolean(event && event.can.addRoleTypes.length > 0);
    show('#add-role-btn', canManageRoles);
    show('#edit-role-btn', canManageRoles);
    show('#delete-role-btn', canManageRoles);
    show('#add-key-btn', Boolean(event?.can.addKeys));

    $('.tabs').replaceChildren(
        ...data.events.map((e) => {
            const tab = document.createElement('a');
            tab.role = 'tab';
            tab.className = `tab ${eventId === e.id ? 'tab-active' : ''}`;
            tab.textContent = e.name;
            tab.addEventListener('click', () => selectEvent(e.id));
            return tab;
        }),
    );
}

export async function addEventBtn() {
    if (!app.data.canCreateEvents) return;
    $<HTMLButtonElement>('#add-event-btn').disabled = true;
    await actions.addEvent((id) => selectEvent(id));
    $<HTMLButtonElement>('#add-event-btn').disabled = !app.data.canCreateEvents;
}

export function editEventBtn() {
    const event = app.data.events.find((e) => e.id === route.event());
    if (!event) return;
    $<HTMLInputElement>('#event-id-input').value = event.id;
    $<HTMLInputElement>('#event-name-input').value = event.name;
    $<HTMLDialogElement>('#event-modal').showModal();
}

export async function saveEventForm(evt: Event) {
    const id = $<HTMLInputElement>('#event-id-input').value.trim();
    const name = $<HTMLInputElement>('#event-name-input').value.trim();

    const errorElem = $('#event-name-input').nextElementSibling as HTMLElement;
    if (name === '') {
        errorElem.innerText = "Name can't be empty";
        evt.preventDefault();
        return;
    }
    if (!NAME_PATTERN.test(name)) {
        errorElem.innerText = 'Only letters, numbers, spaces, -, _';
        evt.preventDefault();
        return;
    }
    errorElem.innerText = '';

    await actions.renameEvent(id, name);
}

export async function deleteEventBtn() {
    const event = app.data.events.find((e) => e.id === route.event());
    if (!event) return;
    if (!(await confirmAction(`Delete the event "${event.name}"? This cannot be undone.`))) return;

    await actions.deleteEvent(event.id, (next) => selectEvent(next));
}
