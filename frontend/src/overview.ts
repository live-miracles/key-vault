// @ts-nocheck

// The input list beside an event's destinations. It reads what bunryu reports.

const STATUS_ORDER = ['error', 'warning', 'running', 'stopped'];

// The first item of the input list: every destination of the event, whatever its input.
const ALL_INPUTS = 'all';

// The input the event view is showing, so adding a destination can start on it. Empty under All.
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

// What to show: the wanted input when it is in the list, otherwise All. An event with no
// inputs has nothing to choose ('').
function resolveInputFilter(inputIds, wanted) {
    if (inputIds.length === 0) return '';
    return wanted && inputIds.includes(wanted) ? wanted : ALL_INPUTS;
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
    const selected = resolveInputFilter(inputIds, getUrlParam('input'));
    shownInputId = selected === ALL_INPUTS ? '' : selected;
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
    // All comes first and counts every destination of the event. It has no tools: it is not an
    // input, so it cannot be renamed, deleted or moved.
    const allRow = () => {
        const active = selected === ALL_INPUTS;
        return `
            <div class="lang-row ${active ? 'lang-row-active' : ''}">
                <button type="button" class="lang-item ${active ? 'lang-item-active' : ''}" data-action="select-input" data-input="${ALL_INPUTS}" aria-pressed="${active}">
                    <span class="lang-item-name">All</span>
                    <span class="lang-item-pills">${statusPillsHtml(summarizeKeyStatuses(eventKeys, keyStatus))}</span>
                    <span class="lang-item-count">${eventKeys.length}</span>
                </button>
            </div>`;
    };
    document.querySelector('#input-list').innerHTML =
        (inputIds.length ? allRow() : '') +
        inputIds
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
    setUrlParam('input', input && input !== ALL_INPUTS ? input : null);
    renderKeyTable(getUrlParam('event'));
}
