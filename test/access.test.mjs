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
    const events = [{ id: 'E1' }, { id: 'E2' }];

    const eventRoles = runtime.get('getEventRoles')('owner@example.test', events, roles);

    assert.deepEqual(Object.keys(eventRoles).sort(), ['*', 'E1', 'E2']);
    assert.equal(runtime.get('hasEventAccess')(eventRoles, ACTIONS.CREATE), true);
    assert.equal(runtime.get('hasLanguageAccess')(eventRoles), true);
});

test('app owner receives owner access without a role row', () => {
    const runtime = loadAccess();
    const { ACTIONS } = runtime.get('({ ACTIONS })');
    const events = [{ id: 'E1' }, { id: 'E2' }];

    const eventRoles = runtime.get('getEventRoles')('owner@example.test', events, [], true);

    assert.deepEqual(Object.keys(eventRoles).sort(), ['*', 'E1', 'E2']);
    assert.equal(runtime.get('hasEventAccess')(eventRoles, ACTIONS.DELETE, 'E1'), true);
    assert.equal(runtime.get('hasLanguageAccess')(eventRoles), true);
});

test('admins can manage non-owner roles, and owners can manage owner roles', () => {
    const runtime = loadAccess();
    const { ACTIONS, ROLES } = runtime.get('({ ACTIONS, ROLES })');
    const adminEventRoles = {
        E1: [{ event: 'E1', type: ROLES.ADMIN, language: '*' }],
    };
    const ownerEventRoles = {
        E1: [{ event: 'E1', type: ROLES.OWNER, language: '*' }],
    };

    assert.equal(
        runtime.get('hasRoleAccess')(adminEventRoles, ACTIONS.CREATE, 'E1', ROLES.EDITOR),
        true,
    );
    assert.equal(
        runtime.get('hasRoleAccess')(adminEventRoles, ACTIONS.CREATE, 'E1', ROLES.OWNER),
        false,
    );
    assert.equal(
        runtime.get('hasRoleAccess')(ownerEventRoles, ACTIONS.CREATE, 'E1', ROLES.OWNER),
        true,
    );
});

test('language-restricted viewers and editors only receive matching key access', () => {
    const runtime = loadAccess();
    const { ACTIONS, ROLES } = runtime.get('({ ACTIONS, ROLES })');
    const eventRoles = {
        E1: [
            { event: 'E1', type: ROLES.VIEWER, language: 'L1' },
            { event: 'E1', type: ROLES.EDITOR, language: 'L2' },
        ],
    };

    assert.equal(runtime.get('hasKeyAccess')(eventRoles, ACTIONS.VIEW, 'E1', 'L1'), true);
    assert.equal(runtime.get('hasKeyAccess')(eventRoles, ACTIONS.UPDATE, 'E1', 'L1'), false);
    assert.equal(runtime.get('hasKeyAccess')(eventRoles, ACTIONS.UPDATE, 'E1', 'L2'), true);
    assert.equal(runtime.get('hasKeyAccess')(eventRoles, ACTIONS.VIEW, 'E1', 'L3'), false);
});
