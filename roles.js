function renderRoleTable(eventId = null) {
    document.querySelector('#role-rows').innerHTML = config.roles
        .filter((r) => (r.event = eventId))
        .sort((r1, r2) => {
            if (r1.role !== r2.role) return ROLE_MAP(r2.role) - ROLE_MAP(r1.role);
            return r1.email.localeCompare(r2.email);
        })
        .map(
            (r) => `
            <tr>
                <th>${r.email}</th>
                <td>${capitalize(r.type)}</td>
                <td>${capitalize(r.language)}</td>
                <td>${r.remarks}</td>
            </tr>
        `,
        )
        .join('');
}

const ROLE_MAP = {
    viewer: 0,
    editor: 1,
    admin: 2,
};
