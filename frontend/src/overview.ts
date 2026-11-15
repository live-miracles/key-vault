// @ts-nocheck

// The language list beside an event's keys and the overview page that sums up every event.
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

// The languages an event's keys use, in the order of the Languages list, each with its keys.
function groupKeysByLanguage(keys) {
    const groups = new Map();
    for (const key of keys) {
        if (!groups.has(key.language)) groups.set(key.language, []);
        groups.get(key.language).push(key);
    }
    return [...groups.entries()]
        .map(([language, languageKeys]) => ({ language, keys: languageKeys }))
        .sort((a, b) => {
            const orderDiff = getLanguageOrder(a.language) - getLanguageOrder(b.language);
            if (orderDiff !== 0) return orderDiff;
            return getLanguageName(a.language).localeCompare(getLanguageName(b.language));
        });
}

// The language to filter by: the wanted one when the event has keys in it, otherwise all ('').
function resolveLanguageFilter(keys, wanted) {
    return wanted && keys.some((key) => key.language === wanted) ? wanted : '';
}

function statusPillsHtml(summary) {
    return STATUS_ORDER.filter((status) => summary[status] > 0)
        .map(
            (status) =>
                `<span class="status-pill status-${status}" title="${escapeHtml(STATUS_LABELS[status])}">${summary[status]}</span>`,
        )
        .join('');
}

function renderLanguagePanel(eventKeys) {
    const selected = resolveLanguageFilter(eventKeys, getUrlParam('language'));
    const item = (language, label, keys) => {
        const active = language === selected;
        return `
            <button type="button" class="lang-item ${active ? 'lang-item-active' : ''}" data-action="select-language" data-language="${escapeHtml(language)}" aria-pressed="${active}">
                <span class="lang-item-name">${label}</span>
                <span class="lang-item-pills">${statusPillsHtml(summarizeKeyStatuses(keys, keyStatus))}</span>
                <span class="lang-item-count">${keys.length}</span>
            </button>`;
    };
    document.querySelector('#language-list').innerHTML =
        item('', 'All', eventKeys) +
        groupKeysByLanguage(eventKeys)
            .map(({ language, keys }) => item(language, languageLabelHtml(language), keys))
            .join('');
    return selected;
}

function selectLanguage(language) {
    setUrlParam('language', language || null);
    renderKeyTable(getUrlParam('event'));
}

function openEvent(eventId, language = '') {
    selectEvent(eventId, language || null);
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
            const languages = groupKeysByLanguage(eventKeys).length;
            return `
                <tr class="overview-row" data-action="open-event" data-event="${escapeHtml(event.id)}" tabindex="0">
                    <td class="text-left font-medium">${escapeHtml(event.name)}${event.pending ? ' <span class="loading loading-dots loading-xs"></span>' : ''}</td>
                    <td>${eventKeys.length}</td>
                    <td>${languages}</td>
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
                <tr class="overview-row" data-action="open-event" data-event="${escapeHtml(key.event)}" data-language="${escapeHtml(key.language)}" tabindex="0" title="${escapeHtml(describeKeyStatus(status))}">
                    <td><span class="status-pill status-${status.status}">${escapeHtml(STATUS_LABELS[status.status])}</span></td>
                    <td class="text-left">${escapeHtml(eventName(key.event))}</td>
                    <td class="text-left">${languageLabelHtml(key.language)}</td>
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
                    <thead><tr class="text-center"><th class="text-left">Event</th><th>Keys</th><th>Languages</th><th>Status</th></tr></thead>
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
