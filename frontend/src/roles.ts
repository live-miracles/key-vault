// The Share dialog: who has access to the open event, and adding, changing and removing them.
// What a person may do is the server's answer (`canChange` on each role, `addRoleTypes` on the
// event); nothing here works a permission out.

import type { RoleType } from '../../supabase/functions/_shared/types.ts';
import { inputLabelHtml } from './cards.ts';
import { actions, app } from './app.ts';
import { $, $$, confirmAction } from './dom.ts';
import { escapeHtml, iconSvg } from './html.ts';
import { ROLE_LABELS, inputPosition, inputsOf } from './model.ts';
import type { RoleItem } from './model.ts';
import { route } from './route.ts';

// Highest first, as the role list reads and as the choices are offered.
const ROLE_ORDER: RoleType[] = ['editor', 'viewer'];

// The role being edited: null is none, '' is the new one being added.
let selectedRoleId: string | null = null;

function eventId(): string {
    return route.event() ?? '';
}

// Editors first, then viewers; within a type, those who see every input
// before those limited to one, in the order of the inputs, then by email.
export function compareRoles(
    a: RoleItem,
    b: RoleItem,
    positionOf: (inputId: string) => number = (id) => inputPosition(app.data, id),
): number {
    if (a.type !== b.type) return ROLE_ORDER.indexOf(a.type) - ROLE_ORDER.indexOf(b.type);
    if (a.input === null && b.input !== null) return -1;
    if (a.input !== null && b.input === null) return 1;
    if (a.input !== null && b.input !== null) {
        const byInput = positionOf(a.input) - positionOf(b.input);
        if (byInput !== 0) return byInput;
    }
    return a.email.localeCompare(b.email);
}

// What each role can do, in a line, shown while one is being chosen. These describe the rules in
// docs/1-user-guide.md ("Who can do what"); the server enforces them (see ADR 0003).
const ROLE_HINTS: Record<RoleType, string> = {
    viewer: 'Sees destinations and their status. Can be limited to one input.',
    editor: 'Adds, edits and deletes destinations. Can be limited to one input.',
};

function roleHint(type: string): string {
    return ROLE_HINTS[type as RoleType] ?? '';
}

function roleInputLabel(input: string | null): string {
    if (input === null) return 'All inputs';
    return `<span class="text-ink-subtle">Only</span> ${inputLabelHtml(app.data, input)}`;
}

// The role types the open event lets this person give, highest first.
function roleTypeOptions(selectedType: string): string {
    const event = app.data.events.find((e) => e.id === eventId());
    const allowed = new Set(event?.can.addRoleTypes ?? []);
    return ROLE_ORDER.filter((type) => allowed.has(type))
        .map(
            (type) =>
                `<option value="${type}" ${type === selectedType ? 'selected' : ''}>${ROLE_LABELS[type]}</option>`,
        )
        .join('');
}

function roleInputOptions(selectedInput: string | null): string {
    return [{ id: '', name: 'All inputs' }, ...inputsOf(app.data, eventId())]
        .map(
            (input) =>
                `<option value="${escapeHtml(input.id)}" ${input.id === (selectedInput ?? '') ? 'selected' : ''}>${escapeHtml(input.name)}</option>`,
        )
        .join('');
}

// The panel for adding someone or changing a role: labelled fields, a line on what the chosen
// role can do, and the buttons. A new person is `id: ''`.
function renderRoleEditRow(role: {
    id: string;
    email: string;
    type: string;
    input: string | null;
}) {
    const adding = role.id === '';
    return `
        <li class="role-edit" data-role-id="${escapeHtml(role.id)}" data-editing="true">
            <div class="role-edit-grid">
                <label class="fieldset">
                    <span class="fieldset-legend">Email</span>
                    <input type="email" class="input role-email-input w-full" value="${escapeHtml(role.email)}" placeholder="name@example.org" maxlength="100" autocomplete="off" />
                </label>
                <label class="fieldset">
                    <span class="fieldset-legend">Role</span>
                    <select class="select role-type-input w-full" data-action="render-role-input">
                        ${roleTypeOptions(role.type)}
                    </select>
                </label>
                <label class="fieldset role-input-field">
                    <span class="fieldset-legend">Can see</span>
                    <select class="select role-input-select w-full">
                        ${roleInputOptions(role.input)}
                    </select>
                </label>
            </div>
            <p class="role-hint" aria-live="polite">${escapeHtml(roleHint(role.type))}</p>
            <p class="role-error hidden" role="alert"></p>
            <div class="role-edit-actions">
                <button type="button" class="btn btn-sm" data-action="cancel-role-inline">Cancel</button>
                <button type="button" class="btn btn-sm btn-accent" data-action="save-role-inline">${adding ? 'Add person' : 'Save'}</button>
            </div>
        </li>
    `;
}

function renderRoleRow(r: RoleItem, isCurrentUser: boolean) {
    const you = isCurrentUser ? '<span class="role-you">(you)</span>' : '';
    const actions = r.pending
        ? '<span class="loading loading-dots loading-xs" title="Saving"></span>'
        : r.canChange
          ? `
                <button type="button" class="btn btn-ghost btn-square btn-sm text-accent" title="Change role" aria-label="Change ${escapeHtml(r.email)}'s role" data-action="edit-role-by-id">
                    ${iconSvg('pen')}
                </button>
                <button type="button" class="btn btn-ghost btn-square btn-sm text-error" title="Remove" aria-label="Remove ${escapeHtml(r.email)}" data-action="delete-role-by-id">
                    ${iconSvg('trash')}
                </button>
            `
          : '';
    return `
        <li class="role-row" data-role-id="${escapeHtml(r.id)}">
            <span class="role-avatar" aria-hidden="true">${escapeHtml(r.email.charAt(0))}</span>
            <div class="role-body">
                <span class="role-email"><span class="role-email-text" title="${escapeHtml(r.email)}">${escapeHtml(r.email)}</span>${you}</span>
                <span class="role-meta">
                    <span class="role-pill role-pill-${escapeHtml(r.type)}">${escapeHtml(ROLE_LABELS[r.type])}</span>
                    <span>${roleInputLabel(r.input)}</span>
                </span>
            </div>
            <div class="role-actions">${actions}</div>
        </li>
    `;
}

// An admin or an owner has every event, so they are listed here but changed under Admins.
function renderEveryEventRow(person: { email: string; owner: boolean }, isCurrentUser: boolean) {
    const you = isCurrentUser ? '<span class="role-you">(you)</span>' : '';
    const kind = person.owner ? 'owner' : 'admin';
    const why = person.owner ? 'fixed' : 'see Admins';
    return `
        <li class="role-row">
            <span class="role-avatar" aria-hidden="true">${escapeHtml(person.email.charAt(0))}</span>
            <div class="role-body">
                <span class="role-email"><span class="role-email-text" title="${escapeHtml(person.email)}">${escapeHtml(person.email)}</span>${you}</span>
                <span class="role-meta">
                    <span class="role-pill role-pill-${kind}">${person.owner ? 'Owner' : 'Admin'}</span>
                    <span>Every event <span class="text-ink-subtle">· ${why}</span></span>
                </span>
            </div>
        </li>
    `;
}

export function renderRoleTable() {
    const id = eventId();
    const { data } = app;
    const roles = data.roles.filter((r) => r.event === id).sort((a, b) => compareRoles(a, b));

    const rows = [
        ...data.everyEvent.map((p) =>
            renderEveryEventRow(p, p.email.toLowerCase() === data.userEmail.toLowerCase()),
        ),
        ...roles.map((r) =>
            selectedRoleId === r.id
                ? renderRoleEditRow(r)
                : renderRoleRow(r, r.email.toLowerCase() === data.userEmail.toLowerCase()),
        ),
    ];

    // A new person goes first, where it can be seen without scrolling.
    if (selectedRoleId === '') {
        rows.unshift(renderRoleEditRow({ id: '', email: '', type: 'viewer', input: null }));
    }
    if (rows.length === 0) rows.push('<li class="role-empty">No one has access yet.</li>');
    $('#role-rows').innerHTML = rows.join('');
    if (selectedRoleId === '') $('#role-table').scrollTop = 0;

    // Right-click on a row opens its menu.
    for (const row of $$('#role-rows [data-role-id]:not([data-editing])')) {
        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const role = app.data.roles.find((r) => r.id === row.dataset.roleId);
            if (role && !role.pending && role.canChange) showRoleContextMenu(e, role.id);
            else $('#role-context-menu').classList.add('hidden');
        });
    }

    // Enter in the email box saves, as it would in a form.
    $<HTMLInputElement>('#role-rows [data-editing] .role-email-input')?.addEventListener(
        'keydown',
        (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const save = $<HTMLElement>(
                '#role-rows [data-editing] [data-action="save-role-inline"]',
            );
            if (save) void saveRoleInline(save);
        },
    );
}

export function hideRoleContextMenu() {
    $('#role-context-menu').classList.add('hidden');
}

function showRoleContextMenu(event: MouseEvent, roleId: string) {
    selectedRoleId = roleId;
    const menu = $('#role-context-menu');
    // Make visible so it can be measured.
    menu.classList.remove('hidden');
    const rect = menu.getBoundingClientRect();
    const margin = 8;
    let x = event.clientX;
    let y = event.clientY;
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - margin;
    // Flip above the cursor if needed.
    if (y + rect.height > window.innerHeight) y = y - rect.height - margin;
    menu.style.left = `${Math.max(margin, x)}px`;
    menu.style.top = `${Math.max(margin, y)}px`;
}

function focusEditingRow() {
    $<HTMLInputElement>('#role-rows [data-editing] .role-email-input')?.focus();
}

export function addRoleBtn() {
    if (!app.data.events.some((e) => e.id === eventId())) return;
    selectedRoleId = '';
    renderRoleTable();
    focusEditingRow();
}

export function editRoleById(roleId: string | undefined) {
    if (!roleId || !app.data.roles.some((r) => r.id === roleId)) return;
    selectedRoleId = roleId;
    renderRoleTable();
    focusEditingRow();
}

// The context menu's Edit acts on the role it was opened for.
export function editSelectedRole() {
    editRoleById(selectedRoleId ?? undefined);
}

export function cancelRoleInlineEdit() {
    selectedRoleId = null;
    renderRoleTable();
}

// Choosing another role type changes what the line under it says the role can do.
export function renderRoleInputForRow(typeSelect: HTMLSelectElement) {
    const panel = typeSelect.closest<HTMLElement>('[data-role-id]');
    const hint = panel?.querySelector('.role-hint');
    if (hint) hint.textContent = roleHint(typeSelect.value);
}

export async function saveRoleInline(button: HTMLElement) {
    const row = button.closest<HTMLElement>('[data-role-id]');
    if (!row) return;
    const id = row.dataset.roleId ?? '';
    const emailInput = row.querySelector('.role-email-input') as HTMLInputElement;
    const email = emailInput.value.trim();
    const type = (row.querySelector('.role-type-input') as HTMLSelectElement).value as RoleType;
    const chosenInput = (row.querySelector('.role-input-select') as HTMLSelectElement).value;
    const input = chosenInput || null;

    const error = row.querySelector<HTMLElement>('.role-error');
    if (email === '' || !emailInput.checkValidity()) {
        emailInput.classList.add('input-error');
        if (error) {
            error.textContent =
                email === ''
                    ? 'Enter an email address.'
                    : 'That does not look like an email address.';
            error.classList.remove('hidden');
        }
        emailInput.focus();
        return;
    }
    emailInput.classList.remove('input-error');
    error?.classList.add('hidden');

    const event = id === '' ? eventId() : app.data.roles.find((r) => r.id === id)?.event;
    if (!event) return;

    selectedRoleId = null;
    const addButton = $<HTMLButtonElement>('#add-role-btn');
    if (id === '') addButton.disabled = true;
    await actions.saveRole({ id, event, email, type, input });
    addButton.disabled = false;
}

export async function deleteRoleById(roleId: string | undefined) {
    const role = app.data.roles.find((r) => r.id === roleId);
    if (!role) return;
    if (
        !(await confirmAction(
            `Remove ${role.email} (${ROLE_LABELS[role.type]}) from this event?`,
            'Remove',
        ))
    ) {
        return;
    }
    await actions.removeRole(role.id);
}

export function deleteSelectedRole() {
    return deleteRoleById(selectedRoleId ?? undefined);
}

export function showShareModal() {
    selectedRoleId = null;
    renderRoleTable();
    $<HTMLDialogElement>('#share-modal').showModal();
}

export function resetRoleInlineEdit() {
    selectedRoleId = null;
    renderRoleTable();
}
