// @ts-nocheck

// The input list beside an event's destinations, and the strip above them that sums up its
// inputs and destinations. Both read what bunryu reports.

const STATUS_ORDER = ['error', 'warning', 'running', 'stopped'];

// The input the event view is showing, so adding a destination can start on it.
let shownInputId = '';

// How many of `keys` are in each state. A key bunryu does not report on is "unreported".
function summarizeKeyStatuses(keys, report) {
    const summary = { total: 0, running: 0, warning: 0, error: 0, stopped: 0, unreported: 0 };
    for (const key of keys) {
        summary.total++;
        const status = getKeyStatus(key, report);
        if (status && status.status in summary) summary[status.status]++;
        else summary.unreported++;
    }
    return summary;
}

// The inputs listed for an event: its own, in the order its admins gave them, then any input
// a stream still points at that the event does not have, so such a stream is never hidden.
function listEventInputs(eventId, keys) {
    const own = getInputs(eventId).map((input) => input.id);
    const strays = [...new Set(keys.map((key) => key.input))].filter((id) => !own.includes(id));
    return own.concat(strays);
}

// The input to show: the wanted one when it is in the list, otherwise the preferred one (for
// example the first with a problem), otherwise the first. An event with no inputs has none ('').
function resolveInputFilter(inputIds, wanted, preferred = '') {
    if (wanted && inputIds.includes(wanted)) return wanted;
    if (preferred && inputIds.includes(preferred)) return preferred;
    return inputIds[0] || '';
}

// The first input with a stream in trouble: errors before warnings, else none.
function firstInputWithProblem(inputIds, keys, report) {
    const summaries = inputIds.map((id) => ({
        id,
        summary: summarizeKeyStatuses(
            keys.filter((key) => key.input === id),
            report,
        ),
    }));
    for (const status of ['error', 'warning']) {
        const found = summaries.find(({ summary }) => summary[status] > 0);
        if (found) return found.id;
    }
    return '';
}

function statusPillsHtml(summary) {
    return STATUS_ORDER.filter((status) => summary[status] > 0)
        .map(
            (status) =>
                `<span class="status-pill status-${status}" title="${escapeHtml(STATUS_LABELS[status])}">${summary[status]}</span>`,
        )
        .join('');
}

// A small colored dot before an input's name: whether its signal is arriving.
function inputDotHtml(inputId) {
    const input = getInputStatus(inputId, keyStatus);
    if (!input) return '';
    const label = `Input: ${INPUT_LABELS[input.status] || input.status}`;
    return `<span class="input-dot input-dot-${input.status}" title="${escapeHtml(label)}" role="img" aria-label="${escapeHtml(label)}"></span>`;
}

// The list on the left: this event's own inputs, one of them always chosen. Its admins add,
// rename, delete and drag them into order right here, so the list is plainly this event's and
// nobody else's.
function renderInputPanel(eventId, eventKeys) {
    const inputIds = listEventInputs(eventId, eventKeys);
    const selected = resolveInputFilter(
        inputIds,
        getUrlParam('input'),
        firstInputWithProblem(inputIds, eventKeys, keyStatus),
    );
    shownInputId = selected;
    // Keep the choice in the address, so a status change later cannot move the view. Not before
    // bunryu has reported: the first with a problem is not known yet, and the report is coming.
    // Replaces, so Back is unharmed.
    if (selected && keyStatus.online && getUrlParam('input') !== selected) {
        const url = new URL(window.location);
        url.searchParams.set('input', selected);
        window.history.replaceState({}, '', url);
    }
    const canManage = hasInputAccess(eventRoles, eventId);
    document.querySelector('#add-input-btn').classList.toggle('hidden', !canManage);

    const row = (input, keys) => {
        const active = input === selected;
        const own = input ? config.inputs.find((i) => i.id === input && i.event === eventId) : null;
        const isPending = Boolean(own?.pending);
        const manage = canManage && own && !isPending;
        const label = inputLabelHtml(input);
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
            <div class="lang-row ${active ? 'lang-row-active' : ''}" ${input ? `data-input-id="${escapeHtml(input)}"` : ''} ${manage ? 'draggable="true" title="Drag to change the order"' : ''}>
                <button type="button" class="lang-item ${active ? 'lang-item-active' : ''}" data-action="select-input" data-input="${escapeHtml(input)}" aria-pressed="${active}">
                    ${input ? inputDotHtml(input) : ''}
                    <span class="lang-item-name">${label}</span>
                    <span class="lang-item-pills">${statusPillsHtml(summarizeKeyStatuses(keys, keyStatus))}</span>
                    ${count}
                </button>
                ${tools}
            </div>`;
    };
    document.querySelector('#input-list').innerHTML = inputIds
        .map((input) =>
            row(
                input,
                eventKeys.filter((key) => key.input === input),
            ),
        )
        .join('');

    document.querySelectorAll('#input-list .lang-row[draggable="true"]').forEach((el) => {
        el.addEventListener('dragstart', dragInputStart);
        el.addEventListener('dragover', dragInputOver);
        el.addEventListener('drop', dropInput);
        el.addEventListener('dragend', dragInputEnd);
    });
    return selected;
}

function selectInput(input) {
    setUrlParam('input', input || null);
    renderKeyTable(getUrlParam('event'));
}

// The strip above an event: how many of its inputs are receiving, unstable, not arriving or
// idle, then the same for its destinations. Only states that have something in them are shown.
function summaryGroupHtml(title, total, counts, labels) {
    const pills = STATUS_ORDER.filter((status) => counts[status] > 0)
        .map(
            (status) =>
                `<span class="status-pill status-${status}">${counts[status]} ${escapeHtml(labels[status])}</span>`,
        )
        .join('');
    return `<div class="summary-group"><span class="summary-title">${escapeHtml(title)}</span><span class="summary-total">${total}</span>${pills}</div>`;
}

function renderEventSummary(inputIds, eventKeys) {
    const el = document.querySelector('#event-summary');
    el.classList.toggle('hidden', inputIds.length === 0);
    if (inputIds.length === 0) {
        el.innerHTML = '';
        return;
    }
    const inputCounts = { running: 0, warning: 0, error: 0, stopped: 0 };
    for (const id of inputIds) {
        const status = getInputStatus(id, keyStatus)?.status;
        if (status in inputCounts) inputCounts[status]++;
    }
    el.innerHTML =
        summaryGroupHtml('Inputs', inputIds.length, inputCounts, INPUT_LABELS) +
        summaryGroupHtml(
            'Destinations',
            eventKeys.length,
            summarizeKeyStatuses(eventKeys, keyStatus),
            NOTE_LABELS,
        );
}
