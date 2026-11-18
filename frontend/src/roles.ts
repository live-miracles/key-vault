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
const ROLE_ORDER: RoleType[] = ['owner', 'admin', 'editor', 'viewer'];

// The role being edited: null is none, '' is the new one being added.
let selectedRoleId: string | null = null;

function eventId(): string {
    return route.event() ?? '';
}

// Owners first, then admins, editors and viewers; within a type, those who see every input
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

function roleInputLabel(input: string | null): string {
    return input === null ? 'All' : inputLabelHtml(app.data, input);
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

// Admins and owners see every input, so their only choice is All.
function roleInputOptions(selectedInput: string | null, roleType: string): string {
    const everything = roleType === 'admin' || roleType === 'owner';
    const inputs = everything ? [] : inputsOf(app.data, eventId());
    return [{ id: '', name: 'All' }, ...inputs]
        .map(
            (input) =>
                `<option value="${escapeHtml(input.id)}" ${input.id === (selectedInput ?? '') ? 'selected' : ''}>${escapeHtml(input.name)}</option>`,
        )
        .join('');
}

function renderRoleEditRow(role: {
    id: string;
    email: string;
    type: string;
    input: string | null;
}) {
    return `
        <tr class="text-center" data-role-id="${escapeHtml(role.id)}" data-editing="true">
            <th class="w-100" style="padding: 5px;">
                <input type="email" class="input input-sm role-email-input w-full" value="${escapeHtml(role.email)}" placeholder="email@example.com" maxlength="100" />
            </th>
            <td class="w-30" style="padding: 5px;">
                <select class="select select-sm role-type-input w-full" data-action="render-role-input">
                    ${roleTypeOptions(role.type)}
                </select>
            </td>
            <td class="w-50" style="padding: 5px;">
                <select class="select select-sm role-input-select w-full">
                    ${roleInputOptions(role.input, role.type)}
                </select>
            </td>
            <td style="padding: 5px;">
                <div class="flex justify-center gap-1">
                    <button type="button" class="btn btn-ghost btn-square btn-xs text-accent" title="Save" aria-label="Save role" data-action="save-role-inline">
                        ${iconSvg('check')}
                    </button>
                    <button type="button" class="btn btn-ghost btn-square btn-xs" title="Cancel" aria-label="Cancel role edit" data-action="cancel-role-inline">
                        ${iconSvg('x')}
                    </button>
                </div>
            </td>
        </tr>
    `;
}

export function renderRoleTable() {
    const id = eventId();
    const { data } = app;
    const roles = data.roles.filter((r) => r.event === id).sort((a, b) => compareRoles(a, b));

    const rows = roles.map((r) => {
        if (selectedRoleId === r.id) return renderRoleEditRow(r);

        const isCurrentUser = r.email.toLowerCase() === data.userEmail.toLowerCase();
        const emailLabel = `${escapeHtml(r.email)}${isCurrentUser ? ' <span class="text-base-content/60 font-normal">(you)</span>' : ''}`;
        const actions = r.pending
            ? '<span class="loading loading-dots loading-xs" title="Saving"></span>'
            : r.canChange
              ? `
                        <div class="flex justify-center gap-1">
                            <button type="button" class="btn btn-ghost btn-square btn-xs text-accent" title="Edit" aria-label="Edit role" data-action="edit-role-by-id">
                                ${iconSvg('pen')}
                            </button>
                            <button type="button" class="btn btn-ghost btn-square btn-xs text-error" title="Delete" aria-label="Delete role" data-action="delete-role-by-id">
                                ${iconSvg('trash')}
                            </button>
                        </div>
                    `
              : '';
        return `
            <tr class="hover:bg-base-300 text-center" data-role-id="${escapeHtml(r.id)}">
                <th class="w-100" style="padding: 5px;">
                    <span>${emailLabel}</span>
                </th>
                <td class="w-30" style="padding: 5px;">${escapeHtml(ROLE_LABELS[r.type])}</td>
                <td class="w-50" style="padding: 5px;">${roleInputLabel(r.input)}</td>
                <td style="padding: 5px;">${actions}</td>
            </tr>
        `;
    });

    if (selectedRoleId === '') {
        rows.push(renderRoleEditRow({ id: '', email: '', type: 'viewer', input: null }));
    }
    $('#role-rows').innerHTML = rows.join('');

    // Right-click on a row opens its menu.
    for (const row of $$('#role-rows tr[data-role-id]:not([data-editing])')) {
        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const role = app.data.roles.find((r) => r.id === row.dataset.roleId);
            if (role && !role.pending && role.canChange) showRoleContextMenu(e, role.id);
            else $('#role-context-menu').classList.add('hidden');
        });
    }
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
    $<HTMLInputElement>('#role-rows tr[data-editing] .role-email-input')?.focus();
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

// Choosing another role type changes which inputs it can be limited to.
export function renderRoleInputForRow(typeSelect: HTMLSelectElement) {
    const inputSelect = typeSelect
        .closest('tr')
        ?.querySelector<HTMLSelectElement>('.role-input-select');
    if (inputSelect)
        inputSelect.innerHTML = roleInputOptions(inputSelect.value || null, typeSelect.value);
}

export async function saveRoleInline(button: HTMLElement) {
    const row = button.closest('tr') as HTMLTableRowElement;
    const id = row.dataset.roleId ?? '';
    const emailInput = row.querySelector('.role-email-input') as HTMLInputElement;
    const email = emailInput.value.trim();
    const type = (row.querySelector('.role-type-input') as HTMLSelectElement).value as RoleType;
    const chosenInput = (row.querySelector('.role-input-select') as HTMLSelectElement).value;
    const input = type === 'admin' || type === 'owner' ? null : chosenInput || null;

    if (email === '' || !emailInput.checkValidity()) {
        emailInput.classList.add('input-error');
        return;
    }
    emailInput.classList.remove('input-error');

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
