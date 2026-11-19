// The trash: events that were deleted and are kept for a while, so an admin can bring one back.
// Whether the person may see it is the server's answer (`canRestoreEvents`); the list is
// fetched when the dialog opens, since only admins need it and it rarely changes.

import { TRASH_DAYS } from '../../supabase/functions/_shared/types.ts';
import type { TrashedEvent } from '../../supabase/functions/_shared/types.ts';
import { actions, app } from './app.ts';
import { $, showErrorAlert } from './dom.ts';
import { selectEvent } from './events.ts';
import { formatAgo, formatDaysLeft } from './format.ts';
import { escapeHtml } from './html.ts';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function renderTrashButton() {
    $('#trash-btn').hidden = !app.data.canRestoreEvents;
}

export function trashRowHtml(event: TrashedEvent, nowMs = Date.now()): string {
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
            <button type="button" class="btn btn-sm btn-accent" data-action="restore-event">Restore</button>
        </li>`;
}

function renderTrash(list: TrashedEvent[] | null) {
    $('#trash-rows').innerHTML =
        list === null
            ? '<li class="trash-empty"><span class="loading loading-dots loading-xs"></span></li>'
            : list.length
              ? list.map((event) => trashRowHtml(event)).join('')
              : '<li class="trash-empty">The trash is empty.</li>';
}

export async function showTrashModal() {
    if (!app.data.canRestoreEvents || !app.backend) return;
    const modal = $<HTMLDialogElement>('#trash-modal');
    $('#trash-note').textContent =
        `A deleted event is kept for ${TRASH_DAYS} days, then removed for good. Restoring it brings back its destinations, inputs and the people who had access.`;
    renderTrash(null);
    modal.showModal();
    try {
        renderTrash(await app.backend.getTrash(undefined));
    } catch (error) {
        modal.close();
        showErrorAlert(error instanceof Error ? error.message : String(error));
    }
}

// Brings the event back, then opens it.
export async function restoreEventById(id: string | undefined) {
    if (!id) return;
    const restored = await actions.restoreEvent(id);
    if (!restored) return;
    $<HTMLDialogElement>('#trash-modal').close();
    selectEvent(restored.id);
}
