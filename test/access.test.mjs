import assert from 'node:assert/strict';
import test from 'node:test';

import { createAccess } from '../supabase/functions/_shared/access.ts';

const role = (event, email, type, input = null) => ({ event, email, type, input });
const ME = 'me@example.test';

test('an owner has access to every event, with no role in any of them', () => {
    const access = createAccess(ME, 'owner', []);
    assert.equal(access.isAdmin(), true);
    assert.equal(access.canViewEvent('e2'), true);
    assert.equal(access.canChangeEvent('e2'), true);
    assert.equal(access.canCreateEvent(), true);
    assert.equal(access.canManageInputs('e2'), true);
    assert.equal(access.canAddRole('e2'), true);
    assert.equal(access.canChangeRole('e2'), true);
    assert.equal(access.canChangeKey('e2', 'i9'), true);
    assert.equal(access.canManageAdmins(), true);
    assert.equal(access.canRestoreEvents(), true);
});

test('an admin can do everything an owner can, except see the technical status', () => {
    const access = createAccess(ME, 'admin', []);
    assert.equal(access.isAdmin(), true);
    assert.equal(access.canViewEvent('e2'), true);
    assert.equal(access.canChangeEvent('e2'), true);
    assert.equal(access.canCreateEvent(), true);
    assert.equal(access.canManageInputs('e2'), true);
    assert.equal(access.canAddRole('e2'), true);
    assert.equal(access.canChangeRole('e2'), true);
    assert.equal(access.canViewRoles('e2'), true);
    assert.equal(access.canViewKey('e2', 'i9'), true);
    assert.equal(access.canChangeKey('e2', 'i9'), true);
    assert.equal(access.canManageAdmins(), true);
    assert.equal(access.canRestoreEvents(), true);
    assert.equal(access.canSeeTechnicalStatus('e2'), false);
});

test('a role in an event never makes someone an admin', () => {
    for (const type of ['editor', 'viewer']) {
        const access = createAccess(ME, null, [role('e1', ME, type)]);
        assert.equal(access.isAdmin(), false);
        assert.equal(access.canManageAdmins(), false);
        assert.equal(access.canRestoreEvents(), false);
        assert.equal(access.canCreateEvent(), false);
        assert.equal(access.canViewEvent('e2'), false);
    }
});

test('someone with no role sees nothing and can do nothing', () => {
    const access = createAccess(ME, null, [role('e1', 'other@example.test', 'editor')]);
    assert.equal(access.canViewEvent('e1'), false);
    assert.equal(access.canCreateEvent(), false);
    assert.equal(access.canViewKey('e1', 'i1'), false);
    assert.equal(access.canChangeKey('e1', null), false);
    assert.equal(access.canViewRoles('e1'), false);
    assert.equal(access.canAddRole('e1'), false);
});

test('editors and viewers cannot rename, delete or manage an event', () => {
    for (const type of ['viewer', 'editor']) {
        const access = createAccess(ME, null, [role('e1', ME, type)]);
        assert.equal(access.canChangeEvent('e1'), false);
        assert.equal(access.canManageInputs('e1'), false);
        assert.equal(access.canAddRole('e1'), false);
        assert.equal(access.canChangeRole('e1'), false);
    }
});

test('editors see who has access to their event, and viewers do not', () => {
    assert.equal(createAccess(ME, null, [role('e1', ME, 'editor')]).canViewRoles('e1'), true);
    assert.equal(createAccess(ME, null, [role('e1', ME, 'editor')]).canViewRoles('e2'), false);
    assert.equal(createAccess(ME, null, [role('e1', ME, 'viewer')]).canViewRoles('e1'), false);
});

test('viewers and editors limited to an input only reach that input', () => {
    const access = createAccess(ME, null, [
        role('e1', ME, 'editor', 'i1'),
        role('e1', ME, 'viewer', 'i2'),
    ]);
    assert.equal(access.canViewKey('e1', 'i1'), true);
    assert.equal(access.canChangeKey('e1', 'i1'), true);
    assert.equal(access.canViewKey('e1', 'i2'), true);
    assert.equal(access.canChangeKey('e1', 'i2'), false);
    assert.equal(access.canViewKey('e1', 'i3'), false);
    // Adding somewhere in the event is allowed because one input is editable.
    assert.equal(access.canChangeKey('e1', null), true);
    assert.equal(access.canViewKey('e2', 'i1'), false);
});

test('a role with no input covers every input of its event, and only that event', () => {
    const access = createAccess(ME, null, [role('e1', ME, 'viewer')]);
    assert.equal(access.canViewKey('e1', 'anything'), true);
    assert.equal(access.canChangeKey('e1', 'anything'), false);
    assert.equal(access.canViewKey('e2', 'anything'), false);
});

test('technical status detail is for owners only, not admins', () => {
    const editor = createAccess(ME, null, [role('e1', ME, 'editor')]);
    assert.equal(editor.canSeeTechnicalStatus('e1'), false);
    assert.equal(createAccess(ME, 'admin', []).canSeeTechnicalStatus('e1'), false);
    assert.equal(createAccess(ME, 'owner', []).canSeeTechnicalStatus('e1'), true);
});

test('what the browser is told about an event follows the same rules', () => {
    const everything = {
        rename: true,
        delete: true,
        manageInputs: true,
        viewRoles: true,
        addRoleTypes: ['viewer', 'editor'],
        addKeys: true,
    };
    assert.deepEqual(createAccess(ME, 'admin', []).describeEvent('e1'), {
        ...everything,
        seeTechnicalStatus: false,
    });
    assert.deepEqual(createAccess(ME, 'owner', []).describeEvent('e1'), {
        ...everything,
        seeTechnicalStatus: true,
    });
    assert.deepEqual(createAccess(ME, null, [role('e1', ME, 'viewer')]).describeEvent('e1'), {
        rename: false,
        delete: false,
        manageInputs: false,
        viewRoles: false,
        addRoleTypes: [],
        addKeys: false,
        seeTechnicalStatus: false,
    });
});
