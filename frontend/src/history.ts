// The History dialog: every change of the last HISTORY_DAYS days, in every event, with who made
// it. It replaces the old trash dialog: its "Deleted events" filter is that list, with a
// button to bring an event back. Whether the person may open it is the server's answer
// (`canSeeHistory`); the list is fetched when the dialog opens and kept only while it is open.
// Clicking a change in an event that still exists opens that event's compare view (compare.ts).

import { HISTORY_DAYS } from '../../supabase/functions/_shared/types.ts';
import type { ChangeView, TrashedEvent } from '../../supabase/functions/_shared/types.ts';
import { actions, app } from './app.ts';
import { openCompare } from './compare.ts';
import { $, showErrorAlert } from './dom.ts';
import { selectEvent } from './events.ts';
import { formatAgo, formatClock, formatDay, formatDaysLeft, formatWhen } from './format.ts';
import {
    describeLine,
    describeOperation,
    foldOperations,
    groupByDay,
    groupOperations,
    who,
} from './history-format.ts';
import type { Line, Operation } from './history-format.ts';
import { escapeHtml, iconSvg } from './html.ts';

const PAGE_SIZE = 100;

// What the dialog shows: every event, one event, the deleted events, or the admins.
// 'all', 'deleted', 'admins', or 'event:<id>'.
let filter = 'all';
let changes: ChangeView[] = [];
let trash: TrashedEvent[] = [];
let hasMore = false;
// A slow answer for a filter that is no longer the one chosen is dropped.
let request = 0;

export function renderHistoryButton() {
    $('#history-btn').hidden = !app.data.canSeeHistory;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function fillFilter() {
    const select = $<HTMLSelectElement>('#history-filter');
    const events = app.data.events
        .filter((e) => !e.pending)
        .map((e) => `<option value="event:${escapeHtml(e.id)}">${escapeHtml(e.name)}</option>`);
    select.innerHTML = `
        <option value="all">All events</option>
        ${events.length ? `<optgroup label="One event">${events.join('')}</optgroup>` : ''}
        <option value="deleted">Deleted events</option>
        <option value="admins">Admins</option>`;
    select.value = [...select.options].some((o) => o.value === filter) ? filter : 'all';
    filter = select.value;
}

// ===== Drawing =====

const isLive = (event: string | null) =>
    Boolean(event && app.data.events.some((e) => e.id === event));

function avatar(email: string) {
    return `<span class="role-avatar" aria-hidden="true">${escapeHtml(email.charAt(0))}</span>`;
}

// One operation as a row you can click to see the event as it was right after it. A change in
// a deleted event or to the admins has no version to open, so it is only text.
function operationHtml(operation: Operation, text: string, nowMs: number): string {
    const inner = `
        ${avatar(operation.by)}
        <span class="history-text"><strong title="${escapeHtml(operation.by)}">${escapeHtml(who(operation.by))}</strong> ${escapeHtml(text)}</span>
        <time class="history-time" datetime="${escapeHtml(operation.at)}" title="${escapeHtml(formatWhen(operation.at, nowMs))}">${escapeHtml(formatClock(operation.at))}</time>`;
    if (!isLive(operation.event)) return `<div class="history-row">${inner}</div>`;
    return `<button type="button" class="history-row history-row-link" data-action="open-compare" data-event-id="${escapeHtml(operation.event ?? '')}" data-change="${operation.version}" title="See ${escapeHtml(operation.eventName || 'the event')} right after this change">${inner}</button>`;
}

export function lineHtml(line: Line, showEvent: boolean, nowMs = Date.now()): string {
    if (line.operations.length === 1) {
        const [operation] = line.operations;
        return `<li>${operationHtml(operation, describeOperation(operation, showEvent, nowMs), nowMs)}</li>`;
    }
    // Several changes by one person in a short time: one line that opens to show each.
    const [newest] = line.operations;
    const each = line.operations
        .map((o) => `<li>${operationHtml(o, describeOperation(o, false, nowMs), nowMs)}</li>`)
        .join('');
    return `
        <li>
            <details class="history-fold">
                <summary class="history-row">
                    ${avatar(newest.by)}
                    <span class="history-text"><strong title="${escapeHtml(newest.by)}">${escapeHtml(who(newest.by))}</strong> ${escapeHtml(describeLine(line, showEvent, nowMs))}</span>
                    <time class="history-time" title="${escapeHtml(formatWhen(newest.at, nowMs))}">${escapeHtml(formatClock(newest.at))}</time>
                    <span class="history-chevron" aria-hidden="true">${iconSvg('chevron', 'h-4 w-4')}</span>
                </summary>
                <ul class="history-fold-list">${each}</ul>
            </details>
        </li>`;
}

// The changes under a heading for each day.
export function changesHtml(list: ChangeView[], showEvent: boolean, nowMs = Date.now()): string {
    const lines = foldOperations(groupOperations(list));
    return groupByDay(
        lines,
        (line) => line.operations[0].at,
        (iso) => formatDay(iso, nowMs),
    )
        .map(
            ({ day, items }) => `
        <section class="history-day">
            <h4 class="history-day-head">${escapeHtml(day)}</h4>
            <ul class="history-list">${items.map((line) => lineHtml(line, showEvent, nowMs)).join('')}</ul>
        </section>`,
        )
        .join('');
}

// A deleted event and the button that brings it back.
export function deletedEventHtml(event: TrashedEvent, nowMs = Date.now()): string {
    const holds = `${plural(event.destinations, 'destination')}, ${plural(event.inputs, 'input')}`;
    const by = event.deletedBy ? ` by ${escapeHtml(event.deletedBy)}` : '';
    const ago = escapeHtml(formatAgo(nowMs - Date.parse(event.deletedAt)));
    return `
        <li class="trash-row" data-trash-id="${escapeHtml(event.id)}">
            <div class="min-w-0 flex-1">
                <p class="trash-name">${escapeHtml(event.name)}</p>
                <p class="trash-meta">Deleted${by}, ${ago} · ${holds}</p>
                <p class="trash-meta">${escapeHtml(formatDaysLeft(event.expiresAt, nowMs))}</p>
            </div>
            <button type="button" class="btn btn-sm btn-accent" data-action="restore-event">Bring back event</button>
        </li>`;
}

function render(loading = false) {
    const list = $('#history-list');
    const showEvent = filter === 'all' || filter === 'admins';
    if (loading) {
        list.innerHTML =
            '<p class="history-empty"><span class="loading loading-dots loading-xs"></span></p>';
    } else if (filter === 'deleted') {
        list.innerHTML = trash.length
            ? `<ul class="trash-list">${trash.map((e) => deletedEventHtml(e)).join('')}</ul>`
            : '<p class="history-empty">No event has been deleted.</p>';
    } else if (changes.length === 0) {
        list.innerHTML = '<p class="history-empty">No changes recorded yet.</p>';
    } else {
        list.innerHTML = changesHtml(changes, showEvent);
    }
    $('#history-older').classList.toggle('hidden', loading || filter === 'deleted' || !hasMore);

    const notes: Record<string, string> = {
        deleted: `A deleted event is kept for ${HISTORY_DAYS} days, then removed for good. Bringing it back restores its destinations, inputs and people.`,
    };
    $('#history-note').textContent =
        notes[filter] ??
        `Every change of the last ${HISTORY_DAYS} days. Open one to see the event as it was right after it, and go back to it.`;
}

// ===== Loading =====

async function load(older: boolean) {
    if (!app.backend) return;
    const mine = ++request;
    if (!older) render(true);
    try {
        if (filter === 'deleted') {
            const list = await app.backend.getTrash(undefined);
            if (mine !== request) return;
            trash = list;
            hasMore = false;
        } else {
            const smallest = older ? Math.min(...changes.map((c) => c.id)) : undefined;
            const page = await app.backend.getHistory({
                ...(filter.startsWith('event:') ? { event: filter.slice('event:'.length) } : {}),
                ...(filter === 'admins' ? { kind: 'admin' as const } : {}),
                ...(smallest === undefined ? {} : { before: smallest }),
                limit: PAGE_SIZE,
            });
            if (mine !== request) return;
            changes = older ? [...changes, ...page] : page;
            hasMore = page.length === PAGE_SIZE;
        }
    } catch (error) {
        if (mine !== request) return;
        $<HTMLDialogElement>('#history-modal').close();
        showErrorAlert(error instanceof Error ? error.message : String(error));
        return;
    }
    render();
}

export async function showHistoryModal() {
    if (!app.data.canSeeHistory || !app.backend) return;
    filter = 'all';
    changes = [];
    trash = [];
    fillFilter();
    $<HTMLDialogElement>('#history-modal').showModal();
    await load(false);
}

export function setHistoryFilter(value: string) {
    filter = value;
    changes = [];
    hasMore = false;
    void load(false);
}

export function loadOlderHistory() {
    if (changes.length) void load(true);
}

export function closeHistoryModal() {
    $<HTMLDialogElement>('#history-modal').close();
}

// Opens an event at a version, from a line of the list.
export function openCompareFromHistory(eventId: string | undefined, change: string | undefined) {
    if (!eventId || !isLive(eventId)) return;
    closeHistoryModal();
    selectEvent(eventId);
    void openCompare(eventId, change === undefined ? undefined : Number(change));
}

// Brings the event back, then opens it.
export async function restoreEventById(id: string | undefined) {
    if (!id) return;
    const restored = await actions.restoreEvent(id);
    if (!restored) return;
    closeHistoryModal();
    selectEvent(restored.id);
}
