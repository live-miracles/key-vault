function renderRoleTable(eventId = null) {
    if (hasRoleAccess(eventRoles, ACTIONS.VIEW, eventId)) {
        document.querySelector('#show-roles-btn').classList.remove('hidden');
    } else {
        document.querySelector('#show-roles-btn').classList.add('hidden');
    }

    if (hasRoleAccess(eventRoles, ACTIONS.CREATE, eventId)) {
        document.querySelector('#add-role-btn').classList.remove('hidden');
    } else {
        document.querySelector('#add-role-btn').classList.add('hidden');
    }

    document.querySelector('#role-rows').innerHTML = config.roles
        .filter((r) => r.event === eventId || r.event === '*')
        .sort((r1, r2) => {
            if (r1.role !== r2.role) return ROLE_MAP(r2.role) - ROLE_MAP(r1.role);
            return r1.email.localeCompare(r2.email);
        })
        .map(
            (r) => `
            <tr>
                <th>${r.email}</th>
                <td>${ROLE_MAP[r.type]}</td>
                <td>${LANGUAGE_MAP[r.language] || r.language}</td>
                <td>${r.remarks}</td>
            </tr>
        `,
        )
        .join('');
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
