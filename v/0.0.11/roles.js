function renderRoleTable(eventId = null) {
    document.querySelector('#role-rows').innerHTML = config.roles
        .filter((r) => r.event === eventId || r.event === '*')
        .sort((r1, r2) => {
            if (r1.type !== r2.type) return parseInt(r2.type) - parseInt(r1.type);
            if (r2.event === '*' && r1.event !== '*') return 1;
            if (r2.event !== '*' && r1.event === '*') return -1;
            return r1.email.localeCompare(r2.email);
        })
        .map(
            (r) => `
            <tr class="hover:bg-base-300 text-center" data-role-id="${r.id}">
                <th>${r.email}</th>
                <td>${(r.event === '*' ? '*' : '') + ROLE_MAP[r.type]}</td>
                <td>${LANGUAGE_MAP[r.language] || r.language}</td>
                <td>${r.remarks}</td>
            </tr>
        `,
        )
        .join('');

    // Add right-click event listeners to rows
    document.querySelectorAll('#role-rows tr').forEach((row) => {
        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const roleId = row.dataset.roleId;
            const role = config.roles.find((r) => r.id === roleId);
            if (!role) {
                console.error('Role not found');
                return;
            }
            if (hasRoleAccess(eventRoles, ACTIONS.UPDATE, role.event, role.type)) {
                showRoleContextMenu(e, roleId);
            } else {
                document.getElementById('role-context-menu').classList.add('hidden');
            }
        });
    });
}

let selectedRoleId = null;
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

    document.querySelector('#role-id-input').value = '';
    document.querySelector('#role-event-input').value = eventId;
    document.querySelector('#role-email-input').value = '';
    renderRoleTypes(eventId);
    document.querySelector('#role-type-input').value = ROLES.VIEWER;
    document.querySelector('#role-language-input').value = '*';
    document.querySelector('#role-remarks-input').value = '';

    document.querySelector('#role-modal').showModal();
}

async function editRoleRow() {
    if (!selectedRoleId) return;
    const role = config.roles.find((r) => r.id === selectedRoleId);
    if (!role) {
        console.error('Role not found:', selectedRoleId);
        return;
    }

    renderRoleTypes(role.event);
    document.querySelector('#role-id-input').value = role.id;
    document.querySelector('#role-event-input').value = role.event;
    document.querySelector('#role-email-input').value = role.email;
    document.querySelector('#role-type-input').value = role.type;
    document.querySelector('#role-language-input').value = role.language;
    document.querySelector('#role-remarks-input').value = role.remarks;

    document.getElementById('role-modal').showModal();
}

async function saveRoleFormBtn(event) {
    const role = {
        id: document.getElementById('role-id-input').value.trim(),
        event: document.getElementById('role-event-input').value.trim(),
        email: document.getElementById('role-email-input').value.trim(),
        type: document.getElementById('role-type-input').value.trim(),
        language: document.getElementById('role-language-input').value.trim(),
        remarks: document.getElementById('role-remarks-input').value.trim(),
    };

    // Validation
    let errorElem = document.querySelector('#role-email-input').nextElementSibling;
    if (role.email === '') {
        errorElem.innerText = "Email can't be empty";
        event.preventDefault();
        return;
    } else if (!document.getElementById('role-email-input').checkValidity()) {
        errorElem.innerText = 'Invalid email';
        event.preventDefault();
        return;
    } else {
        errorElem.innerText = '';
    }

    // Send request
    showLoading();
    if (role.id === '') {
        // Adding new row
        document.querySelector('#add-role-btn').disabled = true;
        console.assert(role.event);

        const newRole = processResponse(await api('addRole', role));
        if (newRole !== null) {
            config.roles.push(newRole);
        }
        document.querySelector('#add-role-btn').disabled = false;
    } else {
        // Editing existing row
        const newRole = processResponse(await api('editRole', role));
        if (newRole !== null) {
            const old = config.roles.find((r) => r.id === newRole.id);
            console.assert(old);
            config.roles.splice(config.roles.indexOf(old), 1, newRole);
        }
    }
    renderRoleTable(role.event);
    hideLoading();
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

    showLoading();
    const res = processResponse(await api('deleteRole', role.id));
    if (res !== null) {
        config.roles = config.roles.filter((r) => r.id !== role.id);
    }
    updateEventRoles(config);
    renderRoleTable(role.event);
    hideLoading();
}

function renderRoleTypes(eventId) {
    document.querySelector('#role-type-input').innerHTML = Object.values(ROLES)
        .filter((role) => hasRoleAccess(eventRoles, ACTIONS.CREATE, eventId, role))
        .map((role) => `<option value="${role}">${ROLE_MAP[role]}</option>`)
        .join('');
}

function editRoleFormBtn(event) {
    event.preventDefault();
}

function showHideRoles() {
    document.querySelector('#role-table').classList.toggle('hidden');
}
