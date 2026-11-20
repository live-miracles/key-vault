// The Admins dialog: who has access to every event. The owners named in the server's settings
// (KEY_VAULT_OWNER_EMAILS) are listed and cannot be changed; any admin can add and remove the
// others. Whether the person may open it is the server's answer (`canManageAdmins`). The list is
// fetched when the dialog opens and kept only while it is open.

import type { AdminRow } from '../../supabase/functions/_shared/types.ts';
import { app } from './app.ts';
import { $ } from './dom.ts';
import { escapeHtml, iconSvg } from './html.ts';

interface AdminList {
    owners: string[];
    admins: AdminRow[];
}

let list: AdminList | null = null;

export function renderAdminsButton() {
    $('#admins-btn').hidden = !app.data.canManageAdmins;
}

function avatar(email: string) {
    return `<span class="role-avatar" aria-hidden="true">${escapeHtml(email.charAt(0))}</span>`;
}

function isMe(email: string) {
    return email.toLowerCase() === app.data.userEmail.toLowerCase();
}

export function adminRowsHtml(current: AdminList): { owners: string; added: string } {
    const you = (email: string) => (isMe(email) ? '<span class="role-you">(you)</span>' : '');
    const owners = current.owners.map(
        (email) => `
        <li class="admin-row">
            ${avatar(email)}
            <div class="role-body">
                <span class="role-email"><span class="role-email-text" title="${escapeHtml(email)}">${escapeHtml(email)}</span>${you(email)}</span>
            </div>
            <span class="admin-fixed" title="Set in the server settings">${iconSvg('lock')} Fixed</span>
        </li>`,
    );
    const added = current.admins.map((admin) => {
        const by = admin.addedBy ? `Added by ${escapeHtml(admin.addedBy)}` : '';
        // Removing yourself would leave you locked out of this dialog, so the server refuses it.
        const remove = isMe(admin.email)
            ? ''
            : `<button type="button" class="btn btn-ghost btn-square btn-sm text-error" title="Remove" aria-label="Remove ${escapeHtml(admin.email)}" data-action="remove-admin">${iconSvg('trash')}</button>`;
        return `
        <li class="admin-row" data-admin-id="${escapeHtml(admin.id)}">
            ${avatar(admin.email)}
            <div class="role-body">
                <span class="role-email"><span class="role-email-text" title="${escapeHtml(admin.email)}">${escapeHtml(admin.email)}</span>${you(admin.email)}</span>
                <span class="role-meta">${by}</span>
            </div>
            <div class="role-actions">${remove}</div>
        </li>`;
    });
    return {
        owners: owners.join('') || '<li class="admin-empty">None are set on the server.</li>',
        added: added.join('') || '<li class="admin-empty">No one else has been added.</li>',
    };
}

function render() {
    const loading =
        '<li class="admin-empty"><span class="loading loading-dots loading-xs"></span></li>';
    const rows = list ? adminRowsHtml(list) : { owners: loading, added: loading };
    $('#admins-owners').innerHTML = rows.owners;
    $('#admins-added').innerHTML = rows.added;
}

// The server's message in the dialog itself: the page's alerts sit behind an open dialog.
function showError(message: string) {
    const error = $('#admins-error');
    error.textContent = message;
    error.classList.toggle('hidden', message === '');
}

const messageOf = (error: unknown) =>
    error instanceof Error ? error.message : 'Something went wrong. Please try again.';

async function load() {
    if (!app.backend) return;
    try {
        list = await app.backend.getAdmins(undefined);
        showError('');
    } catch (error) {
        showError(messageOf(error));
    }
    render();
}

export async function showAdminsModal() {
    if (!app.data.canManageAdmins || !app.backend) return;
    list = null;
    showError('');
    $<HTMLInputElement>('#admin-email-input').value = '';
    render();
    $<HTMLDialogElement>('#admins-modal').showModal();
    await load();
}

export async function addAdminFromForm() {
    if (!app.backend) return;
    const input = $<HTMLInputElement>('#admin-email-input');
    const email = input.value.trim();
    if (email === '') return showError('Type the email address of the new admin.');
    try {
        await app.backend.addAdmin({ email });
        input.value = '';
    } catch (error) {
        return showError(messageOf(error));
    }
    await load();
}

export async function removeAdminById(id: string | undefined) {
    if (!app.backend || !id) return;
    try {
        await app.backend.removeAdmin({ id });
    } catch (error) {
        return showError(messageOf(error));
    }
    await load();
}
