import assert from 'node:assert/strict';
import test from 'node:test';

import { loadFrontendScripts } from './frontend-harness.mjs';

function loadAccess() {
    return loadFrontendScripts(['frontend/access.js']);
}

test('owners receive access to every event and global language settings', () => {
    const runtime = loadAccess();
    const { ACTIONS, ROLES } = runtime.get('({ ACTIONS, ROLES })');
    const roles = [
        {
            event: '*',
            email: 'owner@example.test',
            type: ROLES.OWNER,
            language: '*',
        },
    ];
    const events = [{ id: 'EVT01' }, { id: 'EVT02' }];

    const eventRoles = runtime.get('getEventRoles')('owner@example.test', events, roles);

    assert.deepEqual(Object.keys(eventRoles).sort(), ['*', 'EVT01', 'EVT02']);
    assert.equal(runtime.get('hasEventAccess')(eventRoles, ACTIONS.CREATE), true);
    assert.equal(runtime.get('hasLanguageAccess')(eventRoles), true);
});

test('admins can manage non-owner roles, but cannot create owners', () => {
    const runtime = loadAccess();
    const { ACTIONS, ROLES } = runtime.get('({ ACTIONS, ROLES })');
    const eventRoles = {
        EVT01: [{ event: 'EVT01', type: ROLES.ADMIN, language: '*' }],
    };

    assert.equal(
        runtime.get('hasRoleAccess')(eventRoles, ACTIONS.CREATE, 'EVT01', ROLES.EDITOR),
        true,
    );
    assert.equal(
        runtime.get('hasRoleAccess')(eventRoles, ACTIONS.CREATE, 'EVT01', ROLES.OWNER),
        false,
    );
});

test('language-restricted viewers and editors only receive matching key access', () => {
    const runtime = loadAccess();
    const { ACTIONS, ROLES } = runtime.get('({ ACTIONS, ROLES })');
    const eventRoles = {
        EVT01: [
            { event: 'EVT01', type: ROLES.VIEWER, language: 'L01' },
            { event: 'EVT01', type: ROLES.EDITOR, language: 'L02' },
        ],
    };

    assert.equal(runtime.get('hasKeyAccess')(eventRoles, ACTIONS.VIEW, 'EVT01', 'L01'), true);
    assert.equal(runtime.get('hasKeyAccess')(eventRoles, ACTIONS.UPDATE, 'EVT01', 'L01'), false);
    assert.equal(runtime.get('hasKeyAccess')(eventRoles, ACTIONS.UPDATE, 'EVT01', 'L02'), true);
    assert.equal(runtime.get('hasKeyAccess')(eventRoles, ACTIONS.VIEW, 'EVT01', 'L03'), false);
});
