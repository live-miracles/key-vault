// The list of inputs beside an event's destinations, and adding, renaming, deleting and
// reordering them. The list is the open event's own: its admins manage it right here.

import { actions, app } from './app.ts';
import { inputDotHtml, inputLabelHtml, statusPillsHtml } from './cards.ts';
import { $, $$, confirmAction } from './dom.ts';
import { escapeHtml, iconSvg } from './html.ts';
import { inputsOf } from './model.ts';
import type { KeyItem } from './model.ts';
import {
    ALL_INPUTS,
    listEventInputs,
    resolveInputFilter,
    summarizeKeyStatuses,
} from './overview.ts';
import { route } from './route.ts';

// The input the event view is showing, so adding a destination can start on it. Empty under All.
let shownInputId = '';
export function shownInput(): string {
    return shownInputId;
}

// The list on the left: this event's own inputs, one of them always chosen. Returns the choice.
export function renderInputPanel(eventId: string, eventKeys: KeyItem[]): string {
    const { data, status } = app;
    const inputIds = listEventInputs(data, eventId, eventKeys);
    const selected = resolveInputFilter(inputIds, route.input());
    shownInputId = selected === ALL_INPUTS ? '' : selected;
    const canManage = Boolean(data.events.find((e) => e.id === eventId)?.can.manageInputs);
    $('#add-input-btn').classList.toggle('hidden', !canManage);

    const row = (input: string, keys: KeyItem[]) => {
        const active = input === selected;
        const own = data.inputs.find((i) => i.id === input && i.event === eventId);
        const isPending = Boolean(own?.pending);
        const manage = canManage && own && !isPending;
        // Shown on hover only. Delete is never greyed out: if the input is still used, clicking
        // it says what to remove first.
        const tools = manage
            ? `<span class="lang-tools">
                    <button type="button" class="btn btn-ghost btn-square btn-xs text-accent" title="Rename this input" aria-label="Rename input ${escapeHtml(own.name)}" data-action="edit-input-by-id">${iconSvg('pen')}</button>
                    <button type="button" class="btn btn-ghost btn-square btn-xs text-error" title="Delete this input" aria-label="Delete input ${escapeHtml(own.name)}" data-action="delete-input-by-id">${iconSvg('trash')}</button>
               </span>`
            : '';
        const count = isPending
            ? '<span class="loading loading-dots loading-xs" title="Saving"></span>'
            : `<span class="lang-item-count">${keys.length}</span>`;
        return `
            <div class="lang-row ${active ? 'lang-row-active' : ''}" data-input-id="${escapeHtml(input)}" ${manage ? 'draggable="true" title="Drag to change the order"' : ''}>
                <button type="button" class="lang-item ${active ? 'lang-item-active' : ''}" data-action="select-input" data-input="${escapeHtml(input)}" aria-pressed="${active}">
                    ${inputDotHtml(input, status)}
                    <span class="lang-item-name">${inputLabelHtml(data, input)}</span>
                    <span class="lang-item-pills">${statusPillsHtml(summarizeKeyStatuses(keys, status))}</span>
                    ${count}
                </button>
                ${tools}
            </div>`;
    };
    // All comes first and counts every destination of the event. It has no tools: it is not an
    // input, so it cannot be renamed, deleted or moved.
    const allRow = () => {
        const active = selected === ALL_INPUTS;
        return `
            <div class="lang-row ${active ? 'lang-row-active' : ''}">
                <button type="button" class="lang-item ${active ? 'lang-item-active' : ''}" data-action="select-input" data-input="${ALL_INPUTS}" aria-pressed="${active}">
                    <span class="lang-item-name">All</span>
                    <span class="lang-item-pills">${statusPillsHtml(summarizeKeyStatuses(eventKeys, status))}</span>
                    <span class="lang-item-count">${eventKeys.length}</span>
                </button>
            </div>`;
    };
    $('#input-list').innerHTML =
        (inputIds.length ? allRow() : '') +
        inputIds
            .map((input) =>
                row(
                    input,
                    eventKeys.filter((key) => key.input === input),
                ),
            )
            .join('');

    for (const el of $$('#input-list .lang-row[draggable="true"]')) {
        el.addEventListener('dragstart', dragInputStart);
        el.addEventListener('dragover', dragInputOver);
        el.addEventListener('drop', dropInput);
        el.addEventListener('dragend', dragInputEnd);
    }
    return selected;
}

export function selectInput(input: string | undefined) {
    route.go({ input: input && input !== ALL_INPUTS ? input : null });
}

// ===== Add, rename, delete =====

function openInputModal({ id, name }: { id: string; name: string }) {
    $<HTMLInputElement>('#input-id-field').value = id;
    $<HTMLInputElement>('#input-name-field').value = name;
    $('#input-modal-title').innerText = id ? 'Edit input' : 'Add an input';
    $('#save-input-btn').innerText = id ? 'Save changes' : 'Add input';
    ($('#input-name-field').nextElementSibling as HTMLElement).innerText = '';
    $('#input-name-field').classList.remove('input-error');
    $<HTMLDialogElement>('#input-modal').showModal();
    $('#input-name-field').focus();
}

function canManageInputs(eventId: string | null): boolean {
    return Boolean(app.data.events.find((e) => e.id === eventId)?.can.manageInputs);
}

export function addInputBtn() {
    if (!canManageInputs(route.event())) return;
    openInputModal({ id: '', name: '' });
}

export function editInputById(inputId: string | undefined) {
    const input = app.data.inputs.find((i) => i.id === inputId);
    if (!input || !canManageInputs(input.event)) return;
    openInputModal(input);
}

export async function saveInputForm(event: Event) {
    const eventId = route.event() ?? '';
    const id = $<HTMLInputElement>('#input-id-field').value.trim();
    const name = $<HTMLInputElement>('#input-name-field').value.trim();
    const errorElem = $('#input-name-field').nextElementSibling as HTMLElement;
    const fail = (message: string) => {
        errorElem.innerText = message;
        $('#input-name-field').classList.add('input-error');
        event.preventDefault();
    };

    if (!canManageInputs(eventId)) {
        event.preventDefault();
        return;
    }
    if (name === '') return fail('Please type the name of the input, for example "Hindi".');
    // A name only has to differ from the other inputs of this event.
    const taken = app.data.inputs.some(
        (i) =>
            i.event === eventId &&
            i.id !== id &&
            i.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (taken) return fail('This event already has an input with this name.');

    if (id) await actions.renameInput(id, name);
    // A new input is opened straight away, ready for its first destination.
    else await actions.addInput(eventId, name, (newId) => route.go({ input: newId }));
}

export async function deleteInputById(inputId: string | undefined) {
    const input = app.data.inputs.find((i) => i.id === inputId);
    if (!input || !canManageInputs(input.event)) return;
    if (!(await confirmAction(`Delete the input "${input.name}"? This cannot be undone.`))) return;

    if (route.input() === input.id) route.fix({ input: null });
    await actions.removeInput(input.id);
}

// ===== Reordering: drag an input in the list on the left. The order is that event's own. =====

let draggedInputId: string | null = null;

const draggableInputRows = () => $$('#input-list .lang-row[draggable="true"]');

function dragInputStart(event: DragEvent) {
    const row = event.currentTarget as HTMLElement;
    draggedInputId = row.dataset.inputId ?? null;
    row.classList.add('opacity-50');
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', draggedInputId ?? '');
    }
}

function dragInputOver(event: DragEvent) {
    event.preventDefault();
    const targetRow = event.currentTarget as HTMLElement;
    if (!draggedInputId || targetRow.dataset.inputId === draggedInputId) return;

    const draggedRow = draggableInputRows().find((row) => row.dataset.inputId === draggedInputId);
    if (!draggedRow) return;

    // The list runs down on a wide screen and across on a narrow one.
    const rect = targetRow.getBoundingClientRect();
    const vertical = window.matchMedia?.('(min-width: 768px)').matches ?? true;
    const after = vertical
        ? event.clientY > rect.top + rect.height / 2
        : event.clientX > rect.left + rect.width / 2;
    if (after) targetRow.after(draggedRow);
    else targetRow.before(draggedRow);
}

async function dropInput(event: DragEvent) {
    event.preventDefault();
    const eventId = route.event() ?? '';
    const ids = draggableInputRows().map((row) => row.dataset.inputId ?? '');
    const own = inputsOf(app.data, eventId);
    // While an input is still being saved the list is not complete, so it cannot be ordered.
    if (ids.join('|') === own.map((input) => input.id).join('|') || own.some((i) => i.pending)) {
        dragInputEnd(event);
        route.refresh();
        return;
    }
    await actions.reorderInputs(eventId, ids);
}

function dragInputEnd(event: DragEvent) {
    (event.currentTarget as HTMLElement).classList.remove('opacity-50');
    draggedInputId = null;
}
