function renderRoleTable(eventId = null) {
    const roles = config.roles
        .filter((r) => r.event === eventId || r.event === '*')
        .sort((r1, r2) => {
            if (r1.type !== r2.type) return parseInt(r2.type) - parseInt(r1.type);
            if (r2.event === '*' && r1.event !== '*') return 1;
            if (r2.event !== '*' && r1.event === '*') return -1;
            const languageOrderDiff = getLanguageOrder(r1.language) - getLanguageOrder(r2.language);
            if (languageOrderDiff !== 0) return languageOrderDiff;
            return r1.email.localeCompare(r2.email);
        });

    const roleRows = roles.map((r) => {
        if (selectedRoleId === r.id) {
            return renderRoleEditRow(r);
        }

        const idIssue = getIdIssue(config.roles, r);
        const isCurrentUser = r.email.toLowerCase() === config.userEmail.toLowerCase();
        const canManageRole = hasRoleAccess(eventRoles, ACTIONS.UPDATE, r.event, r.type);
        const emailLabel = `${escapeHtml(r.email)}${isCurrentUser ? ' <span class="text-base-content/60 font-normal">(you)</span>' : ''}`;
        const actions = r.pending
            ? '<span class="loading loading-dots loading-xs" title="Saving"></span>'
            : canManageRole
              ? `
                        <div class="flex justify-center gap-1">
                            <button type="button" class="btn btn-ghost btn-square btn-xs text-accent" title="Edit" aria-label="Edit role" onclick="editRoleById(this.closest('tr').dataset.roleId)">
                                ${iconSvg('pen')}
                            </button>
                            <button type="button" class="btn btn-ghost btn-square btn-xs text-error" title="Delete" aria-label="Delete role" onclick="deleteRoleById(this.closest('tr').dataset.roleId)">
                                ${iconSvg('trash')}
                            </button>
                        </div>
                    `
              : '';

        return `
            <tr class="hover:bg-base-300 text-center ${idIssueClass(idIssue)}" data-role-id="${escapeHtml(r.id)}" title="${escapeHtml(idIssue)}">
                <th class="w-100" style="padding: 5px;">
                    <div class="flex items-center justify-center gap-2">
                        <span>${emailLabel}</span>
                        ${idIssueBadgeHtml(idIssue)}
                    </div>
                </th>
                <td class="w-30" style="padding: 5px;">${escapeHtml(ROLE_MAP[r.type])}</td>
                <td class="w-50" style="padding: 5px;">${languageLabelHtml(r.language)}</td>
                <td style="padding: 5px;">${actions}</td>
            </tr>
        `;
    });

    if (selectedRoleId === '') {
        roleRows.push(
            renderRoleEditRow({
                id: '',
                event: eventId,
                email: '',
                type: ROLES.VIEWER,
                language: '*',
            }),
        );
    }

    document.querySelector('#role-rows').innerHTML = roleRows.join('');

    // Add right-click event listeners to rows
    document.querySelectorAll('#role-rows tr[data-role-id]:not([data-editing])').forEach((row) => {
        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const roleId = row.dataset.roleId;
            const role = config.roles.find((r) => r.id === roleId);
            if (!role) {
                console.error('Role not found');
                return;
            }
            if (role.pending) return;
            if (hasRoleAccess(eventRoles, ACTIONS.UPDATE, role.event, role.type)) {
                showRoleContextMenu(e, roleId);
            } else {
                document.getElementById('role-context-menu').classList.add('hidden');
            }
        });
    });
}

let selectedRoleId = null;

function renderRoleEditRow(role) {
    return `
        <tr class="text-center" data-role-id="${escapeHtml(role.id)}" data-editing="true">
            <th class="w-100" style="padding: 5px;">
                <input type="email" class="input input-sm role-email-input w-full" value="${escapeHtml(role.email)}" placeholder="email@example.com" maxlength="100" />
            </th>
            <td class="w-30" style="padding: 5px;">
                <select class="select select-sm role-type-input w-full" onchange="renderRoleLanguageForRow(this)">
                    ${roleTypeOptions(role.event, role.type)}
                </select>
            </td>
            <td class="w-50" style="padding: 5px;">
                <select class="select select-sm role-language-input w-full">
                    ${roleLanguageOptions(role.language, role.type)}
                </select>
            </td>
            <td style="padding: 5px;">
                <div class="flex justify-center gap-1">
                    <button type="button" class="btn btn-ghost btn-square btn-xs text-accent" title="Save" aria-label="Save role" onclick="saveRoleInlineBtn(this)">
                        ${iconSvg('check')}
                    </button>
                    <button type="button" class="btn btn-ghost btn-square btn-xs" title="Cancel" aria-label="Cancel role edit" onclick="cancelRoleInlineEdit()">
                        ${iconSvg('x')}
                    </button>
                </div>
            </td>
        </tr>
    `;
}

function editRoleById(roleId) {
    selectedRoleId = roleId;
    editRoleRow();
}

function deleteRoleById(roleId) {
    selectedRoleId = roleId;
    deleteRoleRow();
}

function showRoleContextMenu(event, roleId) {
    event.preventDefault();

    selectedRoleId = roleId;
    const menu = document.getElementById('role-context-menu');

    // Make visible so we can measure it
    menu.classList.remove('hidden');

    const rect = menu.getBoundingClientRect();
    const margin = 8;

    let x = event.clientX;
    let y = event.clientY;

    // Horizontal clamp
    if (x + rect.width > window.innerWidth) {
        x = window.innerWidth - rect.width - margin;
    }

    // Vertical: flip above cursor if needed
    if (y + rect.height > window.innerHeight) {
        y = y - rect.height - margin;
    }

    // Final safety clamp
    x = Math.max(margin, x);
    y = Math.max(margin, y);

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
}

async function addRoleBtn() {
    const eventId = getUrlParam('event');
    const event = config.events.find((e) => e.id === eventId);
    if (!event) {
        console.error('Event not found:', eventId);
        return;
    }

    selectedRoleId = '';
    renderRoleTable(eventId);
    document.querySelector('#role-rows tr[data-editing] .role-email-input')?.focus();
}

async function editRoleRow() {
    if (!selectedRoleId) return;
    const role = config.roles.find((r) => r.id === selectedRoleId);
    if (!role) {
        console.error('Role not found:', selectedRoleId);
        return;
    }

    renderRoleTable(role.event);
    document.querySelector('#role-rows tr[data-editing] .role-email-input')?.focus();
}

function cancelRoleInlineEdit() {
    const eventId =
        selectedRoleId === ''
            ? getUrlParam('event')
            : config.roles.find((r) => r.id === selectedRoleId)?.event || getUrlParam('event');
    selectedRoleId = null;
    renderRoleTable(eventId);
}

async function saveRoleInlineBtn(button) {
    const row = button.closest('tr');
    const role = {
        id: row.dataset.roleId,
        event:
            row.dataset.roleId === ''
                ? getUrlParam('event')
                : config.roles.find((r) => r.id === row.dataset.roleId)?.event,
        email: row.querySelector('.role-email-input').value.trim(),
        type: row.querySelector('.role-type-input').value.trim(),
        language: row.querySelector('.role-language-input').value.trim(),
    };
    if (role.type === ROLES.ADMIN || role.type === ROLES.OWNER) {
        role.language = '*';
    }

    // Validation
    const emailInput = row.querySelector('.role-email-input');
    if (role.email === '') {
        emailInput.classList.add('input-error');
        return;
    } else if (!emailInput.checkValidity()) {
        emailInput.classList.add('input-error');
        return;
    } else {
        emailInput.classList.remove('input-error');
    }

    // Send request
    const snapshot = cloneConfig();
    const isAdd = role.id === '';
    const optimisticRole = {
        ...role,
        id: isAdd ? getNextSequentialId(config.roles, 'R') : role.id,
        pending: isAdd,
    };

    selectedRoleId = null;
    replaceConfigItem('roles', optimisticRole, role.id || optimisticRole.id);
    updateEventRoles(config);
    renderRoleTable(role.event);

    showLoading();
    if (role.id === '') {
        // Adding new row
        document.querySelector('#add-role-btn').disabled = true;
        console.assert(role.event);

        try {
            const newRole = processResponse(await api('addRole', role));
            if (newRole === null) {
                restoreConfig(snapshot, role.event);
                return;
            }
            replaceConfigItem('roles', newRole, optimisticRole.id);
            updateEventRoles(config);
            renderRoleTable(newRole.event);
        } finally {
            document.querySelector('#add-role-btn').disabled = false;
            hideLoading();
        }
    } else {
        // Editing existing row
        try {
            const newRole = processResponse(await api('editRole', role));
            if (newRole === null) {
                restoreConfig(snapshot, role.event);
                return;
            }
            replaceConfigItem('roles', newRole);
            updateEventRoles(config);
            renderRoleTable(newRole.event);
        } finally {
            hideLoading();
        }
    }
}

async function deleteRoleRow() {
    if (!selectedRoleId) return;
    const role = config.roles.find((r) => r.id === selectedRoleId);
    if (!role) {
        console.error('Role not found:', selectedRoleId);
        return;
    }

    if (!confirm(`Are you sure you want to delete role ${role.email} | ${ROLE_MAP[role.type]}?`)) {
        return;
    }

    const snapshot = cloneConfig();
    config.roles = config.roles.filter((r) => r.id !== role.id);
    updateEventRoles(config);
    renderRoleTable(role.event);

    showLoading();
    try {
        const res = processResponse(await api('deleteRole', role.id));
        if (res === null) {
            restoreConfig(snapshot, role.event);
        }
    } finally {
        hideLoading();
    }
}

function renderRoleTypes(eventId) {
    document.querySelectorAll('.role-type-input').forEach((input) => {
        input.innerHTML = roleTypeOptions(eventId, input.value);
    });
}

function roleTypeOptions(eventId, selectedType = ROLES.VIEWER) {
    return [...Object.values(ROLES)]
        .reverse()
        .filter((role) => hasRoleAccess(eventRoles, ACTIONS.CREATE, eventId, role))
        .map(
            (role) =>
                `<option value="${role}" ${role === selectedType ? 'selected' : ''}>${ROLE_MAP[role]}</option>`,
        )
        .join('');
}

function renderRoleLanguages() {
    document.querySelectorAll('.role-language-input').forEach((input) => {
        const row = input.closest('tr');
        const type = row?.querySelector('.role-type-input')?.value || ROLES.VIEWER;
        input.innerHTML = roleLanguageOptions(input.value, type);
    });
}

function renderRoleLanguageForRow(typeInput) {
    const row = typeInput.closest('tr');
    const languageInput = row?.querySelector('.role-language-input');
    if (!languageInput) return;

    languageInput.innerHTML = roleLanguageOptions(languageInput.value, typeInput.value);
}

function roleLanguageOptions(selectedLanguage = '*', roleType = ROLES.VIEWER) {
    const options =
        roleType === ROLES.ADMIN || roleType === ROLES.OWNER
            ? [{ id: '*', name: '* (All)' }]
            : languageOptions({ includeAll: true });

    return options
        .map(
            (language) =>
                `<option value="${escapeHtml(language.id)}" ${language.id === selectedLanguage ? 'selected' : ''}>${escapeHtml(language.name)}</option>`,
        )
        .join('');
}

function resetRoleInlineEdit() {
    selectedRoleId = null;
    renderRoleTable(getUrlParam('event'));
}

function showShareModal() {
    resetRoleInlineEdit();
    document.querySelector('#share-modal').showModal();
}

function showHideRoles() {
    showShareModal();
}
