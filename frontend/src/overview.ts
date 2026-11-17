// @ts-nocheck

// The input list beside an event's keys and the overview page that sums up every event.
// Both read the same thing: how many keys there are and what bunryu reports about them.

const OVERVIEW_VIEW = 'overview';

const STATUS_ORDER = ['error', 'warning', 'running', 'stopped'];

function isOverviewView() {
    return getUrlParam('view') === OVERVIEW_VIEW;
}

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

// The inputs an event's keys use, in the order of the Inputs list, each with its keys.
function groupKeysByInput(keys) {
    const groups = new Map();
    for (const key of keys) {
        if (!groups.has(key.input)) groups.set(key.input, []);
        groups.get(key.input).push(key);
    }
    return [...groups.entries()]
        .map(([input, inputKeys]) => ({ input, keys: inputKeys }))
        .sort((a, b) => {
            const orderDiff = getInputOrder(a.input) - getInputOrder(b.input);
            if (orderDiff !== 0) return orderDiff;
            return getInputName(a.input).localeCompare(getInputName(b.input));
        });
}

// The inputs listed for an event: its own, in the order its admins gave them, then any input
// a stream still points at that the event does not have, so such a stream is never hidden.
function listEventInputs(eventId, keys) {
    const own = getInputs(eventId).map((input) => input.id);
    const strays = [...new Set(keys.map((key) => key.input))].filter((id) => !own.includes(id));
    return own.concat(strays);
}

// The input to filter by: the wanted one when it is in the list, otherwise all ('').
function resolveInputFilter(inputIds, wanted) {
    return wanted && inputIds.includes(wanted) ? wanted : '';
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

// The list on the left: All, then this event's own inputs. Its admins add, rename, delete and
// drag them into order right here, so the list is plainly this event's and nobody else's.
function renderInputPanel(eventId, eventKeys) {
    const inputIds = listEventInputs(eventId, eventKeys);
    const selected = resolveInputFilter(inputIds, getUrlParam('input'));
    const canManage = hasInputAccess(eventRoles, eventId);
    document.querySelector('#add-input-btn').classList.toggle('hidden', !canManage);

    const row = (input, keys) => {
        const active = input === selected;
        const own = input ? config.inputs.find((i) => i.id === input && i.event === eventId) : null;
        const isPending = Boolean(own?.pending);
        const manage = canManage && own && !isPending;
        const label = input ? inputLabelHtml(input) : 'All';
        const inUse = keys.length > 0 || config.roles.some((role) => role.input === input);
        const tools = manage
            ? `<span class="lang-tools">
                    <button type="button" class="btn btn-ghost btn-square btn-xs text-accent" title="Rename this input" aria-label="Rename input ${escapeHtml(own.name)}" data-action="edit-input-by-id">${iconSvg('pen')}</button>
                    <button type="button" class="btn btn-ghost btn-square btn-xs text-error" title="${inUse ? 'Remove its streams first' : 'Delete this input'}" aria-label="Delete input ${escapeHtml(own.name)}" data-action="delete-input-by-id" ${inUse ? 'disabled' : ''}>${iconSvg('trash')}</button>
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
    document.querySelector('#input-list').innerHTML =
        row('', eventKeys) +
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
    setUrlParam('input', input || null);
    renderKeyTable(getUrlParam('event'));
}

function openEvent(eventId, input = '') {
    selectEvent(eventId, input || null);
}

function statCardHtml(label, value, className = '') {
    return `
        <div class="stat-card ${className}">
            <div class="stat-card-value">${value}</div>
            <div class="stat-card-label">${escapeHtml(label)}</div>
        </div>`;
}

function renderOverview() {
    const events = config.events.filter((e) => e.id && e.name);
    const keys = config.keys.filter((k) => events.some((e) => e.id === k.event));
    const total = summarizeKeyStatuses(keys, keyStatus);

    const stats = [
        statCardHtml('Events', events.length),
        statCardHtml('Keys', total.total),
        statCardHtml('Running', total.running, 'stat-running'),
        statCardHtml('Warning', total.warning, 'stat-warning'),
        statCardHtml('Error', total.error, 'stat-error'),
        statCardHtml('Configured', total.stopped, 'stat-stopped'),
    ].join('');

    const eventRows = events
        .map((event) => {
            const eventKeys = keys.filter((k) => k.event === event.id);
            const summary = summarizeKeyStatuses(eventKeys, keyStatus);
            const inputs = groupKeysByInput(eventKeys).length;
            return `
                <tr class="overview-row" data-action="open-event" data-event="${escapeHtml(event.id)}" tabindex="0">
                    <td class="text-left font-medium">${escapeHtml(event.name)}${event.pending ? ' <span class="loading loading-dots loading-xs"></span>' : ''}</td>
                    <td>${eventKeys.length}</td>
                    <td>${inputs}</td>
                    <td><span class="inline-flex gap-1">${statusPillsHtml(summary) || '<span class="text-base-content/40">—</span>'}</span></td>
                </tr>`;
        })
        .join('');

    const problems = keys
        .map((key) => ({ key, status: getKeyStatus(key, keyStatus) }))
        .filter(
            ({ status }) => status && (status.status === 'error' || status.status === 'warning'),
        )
        .sort(
            (a, b) =>
                STATUS_RANK[b.status.status] - STATUS_RANK[a.status.status] ||
                a.key.name.localeCompare(b.key.name),
        );
    const eventName = (id) => events.find((e) => e.id === id)?.name || '';
    const problemRows = problems
        .map(
            ({ key, status }) => `
                <tr class="overview-row" data-action="open-event" data-event="${escapeHtml(key.event)}" data-input="${escapeHtml(key.input)}" tabindex="0" title="${escapeHtml(describeKeyStatus(status))}">
                    <td><span class="status-pill status-${status.status}">${escapeHtml(STATUS_LABELS[status.status])}</span></td>
                    <td class="text-left">${escapeHtml(eventName(key.event))}</td>
                    <td class="text-left">${inputLabelHtml(key.input)}</td>
                    <td class="text-left">${escapeHtml(getPlatformNamePreview(key.name))}</td>
                    <td class="text-base-content/70 text-left">${escapeHtml(getMiddleEllipsisText(status.message || '', 70, 55, 10))}</td>
                </tr>`,
        )
        .join('');

    const bunryu = describeBunryu(keyStatus);
    const note =
        bunryu.state === 'online'
            ? ''
            : `<p class="text-base-content/60 text-sm">Live status appears here while bunryu is connected. ${escapeHtml(bunryu.text)}.</p>`;

    document.querySelector('#overview-body').innerHTML = `
        <div class="stat-row">${stats}</div>
        ${note}
        <section class="overview-section">
            <h2 class="overview-heading">Events</h2>
            <div class="overview-table-wrap">
                <table class="table">
                    <thead><tr class="text-center"><th class="text-left">Event</th><th>Keys</th><th>Inputs</th><th>Status</th></tr></thead>
                    <tbody>${eventRows}</tbody>
                </table>
            </div>
        </section>
        <section class="overview-section">
            <h2 class="overview-heading">Needs attention</h2>
            ${
                problems.length
                    ? `<div class="overview-table-wrap"><table class="table"><tbody>${problemRows}</tbody></table></div>`
                    : `<p class="text-base-content/60 text-sm">${total.running + total.warning + total.error + total.stopped ? 'No warnings or errors.' : 'Nothing reported yet.'}</p>`
            }
        </section>`;
}
