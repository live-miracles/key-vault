// The compare view: one event as it was right after a chosen change, with every difference from
// now marked, like version history in a Google Sheet. It takes the place of the event's main
// area until it is closed. On the right is the event's timeline of versions; at the top the
// version shown, what changed since, and the button that restores it. Admins only: whether the
// person may open it is the server's answer (`canSeeHistory`). The version is worked out on the
// server (`compareEvent`); this file only draws it and asks.

import type {
    ChangeView,
    EventState,
    InputRow,
    KeyRow,
    RoleRow,
    RowDiff,
    RowSnapshot,
} from '../../supabase/functions/_shared/types.ts';
import { app } from './app.ts';
import { ApiError } from './api-client.ts';
import { renderCard } from './cards.ts';
import { $, confirmAction } from './dom.ts';
import { formatClock, formatDay, formatWhen } from './format.ts';
import {
    KEY_FIELD_LABELS,
    ROLE_FIELD_LABELS,
    describeLine,
    describeOperation,
    describeRestoreEffect,
    foldOperations,
    groupByDay,
    groupOperations,
    summarizeDiff,
    who,
} from './history-format.ts';
import type { Line, Operation } from './history-format.ts';
import { escapeHtml, iconSvg } from './html.ts';
import { ROLE_LABELS, emptyData, inputsOf } from './model.ts';
import type { InputItem, KeyItem, LoadedData } from './model.ts';

const PAGE_SIZE = 200;
// A big event opens showing only what differs, so the changes are not buried.
const BIG_EVENT_KEYS = 8;

// What nothing in a read-only copy may do: every button stays hidden.
const NO_RIGHTS = {
    rename: false,
    delete: false,
    manageInputs: false,
    viewRoles: false,
    addRoleTypes: [],
    addKeys: false,
    seeTechnicalStatus: false,
};

interface Compare {
    event: string;
    // The change the event is shown right after; 0 is the start of history. null until chosen.
    version: number | null;
    // This event's changes, newest first, as many as are loaded.
    changes: ChangeView[];
    // Older changes exist beyond the ones loaded.
    more: boolean;
    // The newest version, which is the event as it is: "Now".
    latest: number;
    then: EventState | null;
    diff: RowDiff[];
    loading: boolean;
    diffOnly: boolean;
    // Whether the person has chosen, so a new version does not change their mind.
    diffOnlyChosen: boolean;
    // Stream keys shown, as "<row id>:<field>".
    revealed: Set<string>;
    error: string;
    restoring: boolean;
}

let current: Compare | null = null;
// An answer for a version that is no longer the one chosen is dropped.
let token = 0;

export function isComparing(): boolean {
    return current !== null;
}

// ===== Words and values =====

const SECRET_FIELDS = ['streamKey', 'backupStreamKey'];

const INPUT_FIELD_LABELS: Record<string, string> = { name: 'name', position: 'order' };

function fieldLabels(kind: RowDiff['kind']): Record<string, string> {
    if (kind === 'key') return KEY_FIELD_LABELS;
    if (kind === 'role') return ROLE_FIELD_LABELS;
    if (kind === 'input') return INPUT_FIELD_LABELS;
    return { name: 'name' };
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const BADGES: Record<RowDiff['status'], { label: string; hint: string }> = {
    added: { label: 'Added since', hint: 'Restoring removes it.' },
    deleted: { label: 'Deleted since', hint: 'Restoring brings it back.' },
    changed: { label: 'Changed since', hint: 'Restoring puts the old values back.' },
};

function badgeHtml(status: RowDiff['status'], extra = ''): string {
    const { label, hint } = BADGES[status];
    return `<span class="cmp-badge cmp-badge-${status}" title="${escapeHtml(hint)}">${escapeHtml(label)}${extra ? ` · ${escapeHtml(extra)}` : ''}</span>`;
}

// ===== The version =====

// Everything the cards need to draw the version: its own rows, and the ones added since (which
// are not in it, but are shown marked so an admin sees what a restore would remove).
interface Shown {
    inputs: InputRow[];
    keys: KeyRow[];
    roles: RoleRow[];
    data: LoadedData;
    byRow: Map<string, RowDiff>;
}

function shownOf(then: EventState, diff: RowDiff[]): Shown {
    const addedSince = <T>(kind: RowDiff['kind']) =>
        diff.filter((d) => d.kind === kind && d.status === 'added').map((d) => d.now as T);
    const inputs = [...then.inputs, ...addedSince<InputRow>('input')];
    const keys = [...then.keys, ...addedSince<KeyRow>('key')];
    const roles = [...then.roles, ...addedSince<RoleRow>('role')];
    const data: LoadedData = {
        ...emptyData(),
        events: [{ ...then.event, can: NO_RIGHTS }],
        inputs: inputs.map((i): InputItem => ({ ...i, canAddKeys: false })),
        keys: keys.map((k): KeyItem => ({ ...k, canChange: false })),
    };
    return { inputs, keys, roles, data, byRow: new Map(diff.map((d) => [d.rowId, d])) };
}

// ===== Drawing the main area =====

// A value in the list of what changed. A stream key is dots until its button is pressed.
function valueHtml(c: Compare, shown: Shown, rowId: string, field: string, value: unknown): string {
    const text = String(value ?? '');
    if (!text) return '<span class="cmp-empty">(empty)</span>';
    if (SECRET_FIELDS.includes(field)) {
        return c.revealed.has(`${rowId}:${field}`)
            ? `<code class="cmp-secret">${escapeHtml(text)}</code>`
            : '<span class="cmp-secret">••••••••</span>';
    }
    if (field === 'input') {
        const input = shown.inputs.find((i) => i.id === text);
        return escapeHtml(input?.name ?? 'an input that is gone');
    }
    return escapeHtml(text);
}

// What a changed row had and has: the old value beside the current one.
function fieldsHtml(c: Compare, shown: Shown, diff: RowDiff): string {
    const labels = fieldLabels(diff.kind);
    const fields = diff.fields.filter((f) => f in labels);
    if (fields.length === 0) return '';
    const rows = fields
        .map((field) => {
            const reveal = SECRET_FIELDS.includes(field)
                ? `<button type="button" class="btn btn-ghost btn-square btn-xs" data-action="compare-reveal" data-reveal="${escapeHtml(`${diff.rowId}:${field}`)}" title="Show or hide the key" aria-label="Show or hide the key">${iconSvg(c.revealed.has(`${diff.rowId}:${field}`) ? 'eye-off' : 'eye')}</button>`
                : '';
            return `
            <div class="cmp-field">
                <dt>${escapeHtml(capital(labels[field]))}</dt>
                <dd>
                    <span class="cmp-then"><span class="cmp-when">Then</span> ${valueHtml(c, shown, diff.rowId, field, diff.then?.[field])}</span>
                    <span class="cmp-now"><span class="cmp-when">Now</span> ${valueHtml(c, shown, diff.rowId, field, diff.now?.[field])}</span>
                    ${reveal}
                </dd>
            </div>`;
        })
        .join('');
    return `<dl class="cmp-fields">${rows}</dl>`;
}

function keyItemHtml(c: Compare, shown: Shown, key: KeyRow, nowMs: number): string {
    const diff = shown.byRow.get(key.id);
    const added = diff?.status === 'added';
    // A link used twice is only worth a warning between destinations that exist together, so
    // the ones added since are left out of the others' clash check (and have none of their own).
    const together = shown.data.keys.filter((k) => shown.byRow.get(k.id)?.status !== 'added');
    const item = shown.data.keys.find((k) => k.id === key.id) as KeyItem;
    // No bunryu report: how a destination was doing then is not known, so no color is given.
    const card = renderCard(item, added ? [] : together, { data: shown.data, report: null, nowMs });
    return `
        <div class="cmp-item${diff ? ` cmp-item-${diff.status}` : ''}">
            ${diff ? badgeHtml(diff.status) : ''}
            ${card}
            ${diff?.status === 'changed' ? fieldsHtml(c, shown, diff) : ''}
        </div>`;
}

function inputBadgeHtml(diff: RowDiff | undefined): string {
    if (!diff) return '';
    if (diff.status !== 'changed') return badgeHtml(diff.status);
    const parts = diff.fields.map((f) =>
        f === 'name' ? `now “${String(diff.now?.name ?? '')}”` : 'moved',
    );
    return badgeHtml('changed', parts.join(', '));
}

function sectionsHtml(c: Compare, shown: Shown, nowMs: number): string {
    return inputsOf(shown.data)
        .map((input) => {
            const diff = shown.byRow.get(input.id);
            const keys = shown.keys.filter((k) => k.input === input.id);
            const touched = Boolean(diff) || keys.some((k) => shown.byRow.has(k.id));
            if (c.diffOnly && !touched) return '';
            const items = keys.filter((k) => !c.diffOnly || shown.byRow.has(k.id));
            return `
        <section class="dest-section">
            <h3 class="dest-section-head">
                <span class="dest-section-name">${escapeHtml(input.name)}</span>
                ${inputBadgeHtml(diff)}
                <span class="dest-section-count">${keys.length}</span>
            </h3>
            <div class="dest-grid">${items.map((k) => keyItemHtml(c, shown, k, nowMs)).join('')}</div>
        </section>`;
        })
        .join('');
}

function roleLine(shown: Shown, role: RoleRow | RowSnapshot): string {
    const input = role.input ? shown.inputs.find((i) => i.id === role.input)?.name : null;
    const access = input ? `only ${input}` : 'every input';
    return `${escapeHtml(String(role.email))} · ${escapeHtml(ROLE_LABELS[String(role.type)] ?? String(role.type))}, ${escapeHtml(access)}`;
}

function peopleHtml(c: Compare, shown: Shown): string {
    const roles = shown.roles.filter((r) => !c.diffOnly || shown.byRow.has(r.id));
    if (roles.length === 0) return '';
    const rows = roles
        .map((role) => {
            const diff = shown.byRow.get(role.id);
            const now =
                diff?.status === 'changed'
                    ? ` <span class="cmp-now"><span class="cmp-when">Now</span> ${roleLine(shown, diff.now as RowSnapshot)}</span>`
                    : '';
            return `<li class="cmp-role${diff ? ` cmp-item-${diff.status}` : ''}">${diff ? badgeHtml(diff.status) : ''}<span class="cmp-then">${roleLine(shown, role)}</span>${now}</li>`;
        })
        .join('');
    return `<section class="dest-section"><h3 class="dest-section-head"><span class="dest-section-name">People with access</span><span class="dest-section-count">${shown.roles.length}</span></h3><ul class="cmp-roles">${rows}</ul></section>`;
}

function mainHtml(c: Compare, nowMs: number): string {
    if (c.loading && !c.then) {
        return '<p class="history-empty"><span class="loading loading-dots loading-xs"></span></p>';
    }
    if (!c.then) return '';
    const shown = shownOf(c.then, c.diff);
    const renamed = c.diff.find((d) => d.kind === 'event');
    const name = renamed
        ? `<p class="cmp-eventname">${escapeHtml(String(renamed.then?.name ?? ''))} ${badgeHtml('changed', `now “${String(renamed.now?.name ?? '')}”`)}</p>`
        : '';
    const current = c.version === c.latest;
    const body = [sectionsHtml(c, shown, nowMs), peopleHtml(c, shown)].join('');
    const empty =
        c.diff.length === 0
            ? current
                ? 'This is the current version. Pick an earlier one on the right to see what changed.'
                : 'This version is the same as it is now.'
            : 'Nothing here to show.';
    return `
        <label class="cmp-toggle">
            <input type="checkbox" class="checkbox" data-action="compare-diff-only" ${c.diffOnly ? 'checked' : ''} />
            <span>Only show differences</span>
        </label>
        ${name}
        ${body || `<p class="history-empty">${escapeHtml(empty)}</p>`}`;
}

// ===== Drawing the timeline =====

function operationButton(c: Compare, operation: Operation, text: string, nowMs: number): string {
    const active = c.version === operation.version && operation.version !== c.latest;
    return `
        <button type="button" class="cmp-version${active ? ' cmp-version-active' : ''}" data-action="compare-select" data-change="${operation.version}" aria-pressed="${active}">
            <span class="cmp-version-text"><strong title="${escapeHtml(operation.by)}">${escapeHtml(who(operation.by))}</strong> ${escapeHtml(text)}</span>
            <time class="history-time" title="${escapeHtml(formatWhen(operation.at, nowMs))}">${escapeHtml(formatClock(operation.at))}</time>
        </button>`;
}

function lineHtml(c: Compare, line: Line, nowMs: number): string {
    if (line.operations.length === 1) {
        const [operation] = line.operations;
        return `<li>${operationButton(c, operation, describeOperation(operation, false, nowMs), nowMs)}</li>`;
    }
    const [newest] = line.operations;
    const open = line.operations.some((o) => o.version === c.version && o.version !== c.latest);
    return `
        <li>
            <details class="history-fold"${open ? ' open' : ''}>
                <summary class="cmp-version">
                    <span class="cmp-version-text"><strong title="${escapeHtml(newest.by)}">${escapeHtml(who(newest.by))}</strong> ${escapeHtml(describeLine(line, false, nowMs))}</span>
                    <time class="history-time">${escapeHtml(formatClock(newest.at))}</time>
                    <span class="history-chevron" aria-hidden="true">${iconSvg('chevron', 'h-4 w-4')}</span>
                </summary>
                <ul class="history-fold-list">${line.operations.map((o) => `<li>${operationButton(c, o, describeOperation(o, false, nowMs), nowMs)}</li>`).join('')}</ul>
            </details>
        </li>`;
}

function timelineHtml(c: Compare, nowMs: number): string {
    const operations = groupOperations(c.changes);
    const lines = foldOperations(operations);
    const oldest = operations[operations.length - 1];
    // An event added after history began has no version before that: it did not exist yet.
    const existedAtStart =
        !c.more &&
        oldest &&
        !oldest.changes.some((x) => x.kind === 'event' && x.action === 'added');
    const days = groupByDay(
        lines,
        (l) => l.operations[0].at,
        (iso) => formatDay(iso, nowMs),
    )
        .map(
            ({ day, items }) => `
            <li class="cmp-day">
                <h4 class="history-day-head">${escapeHtml(day)}</h4>
                <ul class="history-list">${items.map((l) => lineHtml(c, l, nowMs)).join('')}</ul>
            </li>`,
        )
        .join('');
    const nowActive = c.version === c.latest;
    return `
        <h3 class="cmp-timeline-title">Versions</h3>
        <div class="cmp-timeline-body">
            <ol class="cmp-versions">
                <li><button type="button" class="cmp-version cmp-version-now${nowActive ? ' cmp-version-active' : ''}" data-action="compare-select" data-change="${c.latest}" aria-pressed="${nowActive}"><span class="cmp-version-text"><strong>Now</strong></span></button></li>
                ${days || '<li class="history-empty">No changes recorded yet.</li>'}
                ${existedAtStart ? `<li><button type="button" class="cmp-version${c.version === 0 ? ' cmp-version-active' : ''}" data-action="compare-select" data-change="0" aria-pressed="${c.version === 0}"><span class="cmp-version-text"><strong>Start of history</strong> · before ${escapeHtml(formatWhen(oldest.at, nowMs))}</span></button></li>` : ''}
            </ol>
            ${c.more ? '<div class="mt-2 text-center"><button type="button" class="btn btn-sm" data-action="compare-older">Load older</button></div>' : ''}
        </div>`;
}

// ===== The version shown, in words =====

function operationAt(c: Compare, version: number): Operation | undefined {
    return groupOperations(c.changes).find((o) => o.version === version);
}

// "Current version", "After ravi deleted “Instagram English” · 18 Nov, 3:42 pm".
function versionLabel(c: Compare, nowMs: number): string {
    if (c.version === c.latest) return 'Current version';
    if (c.version === 0) {
        const oldest = groupOperations(c.changes).at(-1);
        return `Start of history${oldest ? ` · before ${formatWhen(oldest.at, nowMs)}` : ''}`;
    }
    const operation = operationAt(c, c.version ?? -1);
    if (!operation) return 'An earlier version';
    return `After ${who(operation.by)} ${describeOperation(operation, false, nowMs)} · ${formatWhen(operation.at, nowMs)}`;
}

// ===== Drawing it all =====

function render() {
    const c = current;
    $('#event-layout').classList.toggle('hidden', c !== null);
    const view = $('#compare-view');
    view.classList.toggle('hidden', c === null);
    if (!c) {
        view.innerHTML = '';
        return;
    }
    const nowMs = Date.now();
    const eventName = app.data.events.find((e) => e.id === c.event)?.name ?? '';
    const scroll = view.querySelector<HTMLElement>('.cmp-timeline-body')?.scrollTop ?? 0;
    const canRestore = Boolean(c.then) && c.diff.length > 0 && !c.loading && !c.restoring;

    view.innerHTML = `
        <div class="cmp-bar">
            <div class="cmp-bar-title">
                <h2 class="cmp-title">History of ${escapeHtml(eventName)}</h2>
                <p class="cmp-sub">${escapeHtml(c.version === null ? '' : versionLabel(c, nowMs))}</p>
                <p class="cmp-summary">${c.then ? escapeHtml(summarizeDiff(c.diff)) : ''}</p>
            </div>
            <div class="cmp-bar-actions">
                <button type="button" class="btn btn-primary btn-sm" data-action="compare-restore" ${canRestore ? '' : 'disabled'} title="${canRestore ? 'Make the event exactly as it was in this version' : 'Pick an earlier version to restore it'}">
                    ${c.restoring ? '<span class="loading loading-dots loading-xs"></span>' : iconSvg('history')}
                    Restore this version
                </button>
                <button type="button" class="btn btn-ghost btn-sm" data-action="compare-close">Close</button>
            </div>
        </div>
        ${c.error ? `<p class="cmp-error" role="alert">${escapeHtml(c.error)}</p>` : ''}
        <div class="cmp-layout">
            <div class="cmp-main">${mainHtml(c, nowMs)}</div>
            <aside class="cmp-timeline" aria-label="Versions of this event">${timelineHtml(c, nowMs)}</aside>
        </div>`;
    const body = view.querySelector<HTMLElement>('.cmp-timeline-body');
    if (body) body.scrollTop = scroll;
}

// ===== Loading =====

function messageOf(error: unknown): string {
    if (error instanceof ApiError) return error.message;
    console.error(error);
    return 'Something went wrong. Please try again.';
}

// This event's changes, newest first; with `older`, the page after the ones already loaded.
async function loadTimeline(c: Compare, older: boolean) {
    if (!app.backend) return;
    const smallest = older ? Math.min(...c.changes.map((x) => x.id)) : undefined;
    const page = await app.backend.getHistory({
        event: c.event,
        ...(smallest === undefined ? {} : { before: smallest }),
        limit: PAGE_SIZE,
    });
    c.changes = older ? [...c.changes, ...page] : page;
    c.more = page.length === PAGE_SIZE;
    if (!older) c.latest = page[0]?.id ?? 0;
}

async function select(c: Compare, version: number) {
    if (!app.backend) return;
    const mine = ++token;
    c.version = version;
    c.loading = true;
    c.error = '';
    render();
    try {
        const result = await app.backend.compareEvent({ event: c.event, atChange: version });
        if (mine !== token || current !== c) return;
        c.then = result.then;
        c.diff = result.diff;
        if (!c.diffOnlyChosen)
            c.diffOnly = c.then.keys.length > BIG_EVENT_KEYS && c.diff.length > 0;
    } catch (error) {
        if (mine !== token || current !== c) return;
        c.then = null;
        c.diff = [];
        c.error = messageOf(error);
    }
    c.loading = false;
    render();
}

// ===== What a person can do =====

// Opens the event's history at a version; by default the newest change, which is the event as
// it is now.
export async function openCompare(eventId?: string, version?: number) {
    const event = eventId ?? new URL(window.location.href).searchParams.get('event');
    if (!event || !app.backend || !app.data.canSeeHistory) return;
    const c: Compare = {
        event,
        version: null,
        changes: [],
        more: false,
        latest: 0,
        then: null,
        diff: [],
        loading: true,
        diffOnly: false,
        diffOnlyChosen: false,
        revealed: new Set(),
        error: '',
        restoring: false,
    };
    current = c;
    render();
    try {
        await loadTimeline(c, false);
    } catch (error) {
        if (current === c) c.error = messageOf(error);
        c.loading = false;
        render();
        return;
    }
    if (current !== c) return;
    await select(c, version ?? c.latest);
}

export function closeCompare() {
    token++;
    current = null;
    render();
}

// Called whenever the page is drawn: the view belongs to one event, so it goes when another is
// opened or this one is gone.
export function syncCompare(eventId: string) {
    if (!current) return;
    const gone = !app.data.events.some((e) => e.id === current?.event);
    if (current.event !== eventId || gone || !app.data.canSeeHistory) closeCompare();
}

export function selectVersion(change: string | undefined) {
    if (!current || change === undefined) return;
    const version = Number(change);
    if (Number.isInteger(version) && version >= 0) void select(current, version);
}

export async function loadOlderVersions() {
    const c = current;
    if (!c || !c.more) return;
    try {
        await loadTimeline(c, true);
    } catch (error) {
        c.error = messageOf(error);
    }
    if (current === c) render();
}

export function toggleDiffOnly() {
    if (!current) return;
    current.diffOnly = !current.diffOnly;
    current.diffOnlyChosen = true;
    render();
}

export function toggleReveal(key: string | undefined) {
    if (!current || !key) return;
    if (!current.revealed.delete(key)) current.revealed.add(key);
    render();
}

// Asks, then makes the event what it was in this version. The server checks it again and, if
// something in it is not allowed any more, refuses with the reasons, which are shown here and
// stay until the next try (an alert disappears too soon to read a list).
export async function restoreVersion() {
    const c = current;
    if (!c || !c.then || c.version === null || !app.backend) return;
    const operation = operationAt(c, c.version);
    const when =
        c.version === 0
            ? 'at the start of history'
            : operation
              ? `on ${formatWhen(operation.at)}`
              : 'in that version';
    const name = app.data.events.find((e) => e.id === c.event)?.name ?? 'this event';
    const message = `Restore ${name} to how it was ${when}? ${describeRestoreEffect(c.diff)} You can undo this from History.`;
    if (!(await confirmAction(message, 'Restore'))) return;

    c.restoring = true;
    c.error = '';
    render();
    try {
        await app.backend.restoreEventVersion({ event: c.event, atChange: c.version });
        // What the page shows is now out of date: load it again, and show the new entry.
        await Promise.all([app.refresh(), app.refreshStatus()]);
        c.restoring = false;
        await loadTimeline(c, false);
        if (current === c) await select(c, c.latest);
    } catch (error) {
        c.restoring = false;
        c.error = messageOf(error);
        if (current === c) render();
    }
}
