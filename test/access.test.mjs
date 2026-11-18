import assert from 'node:assert/strict';
import test from 'node:test';

import { createAccess } from '../supabase/functions/_shared/access.ts';

const role = (event, email, type, input = null) => ({ event, email, type, input });
const ME = 'me@example.test';

test('an owner has access to every event, wherever the role was given', () => {
    const access = createAccess(ME, false, [role('e1', ME, 'owner')]);
    assert.equal(access.canViewEvent('e2'), true);
    assert.equal(access.canChangeEvent('e2'), true);
    assert.equal(access.canCreateEvent(), true);
    assert.equal(access.canManageInputs('e2'), true);
    assert.equal(access.canAddRole('e2', 'owner'), true);
    assert.equal(access.canChangeKey('e2', 'i9'), true);
});

test('the app owner is an owner without a role row', () => {
    const access = createAccess(ME, true, []);
    assert.equal(access.canViewEvent('e1'), true);
    assert.equal(access.canChangeEvent('e1'), true);
    assert.equal(access.canChangeRole('e1', 'owner'), true);
});

test('someone with no role sees nothing and can do nothing', () => {
    const access = createAccess(ME, false, [role('e1', 'other@example.test', 'owner')]);
    assert.equal(access.canViewEvent('e1'), false);
    assert.equal(access.canCreateEvent(), false);
    assert.equal(access.canViewKey('e1', 'i1'), false);
    assert.equal(access.canChangeKey('e1', null), false);
    assert.equal(access.canViewRoles('e1'), false);
    assert.equal(access.canAddRole('e1', 'viewer'), false);
});

test('an admin of any event can create events, but only owners rename or delete them', () => {
    const access = createAccess(ME, false, [role('e1', ME, 'admin')]);
    assert.equal(access.canCreateEvent(), true);
    assert.equal(access.canViewEvent('e1'), true);
    assert.equal(access.canChangeEvent('e1'), false);
    assert.equal(access.canViewEvent('e2'), false);
});

test("an event's admins manage its inputs, and nobody else does", () => {
    const admin = createAccess(ME, false, [role('e1', ME, 'admin')]);
    assert.equal(admin.canManageInputs('e1'), true);
    assert.equal(admin.canManageInputs('e2'), false);
    for (const type of ['viewer', 'editor']) {
        assert.equal(createAccess(ME, false, [role('e1', ME, type)]).canManageInputs('e1'), false);
    }
});

test('admins manage non-owner roles, and only owners add or change admins and owners', () => {
    const admin = createAccess(ME, false, [role('e1', ME, 'admin')]);
    assert.equal(admin.canAddRole('e1', 'viewer'), true);
    assert.equal(admin.canAddRole('e1', 'editor'), true);
    assert.equal(admin.canAddRole('e1', 'admin'), true);
    assert.equal(admin.canAddRole('e1', 'owner'), false);
    assert.equal(admin.canChangeRole('e1', 'editor'), true);
    assert.equal(admin.canChangeRole('e1', 'admin'), false);
    assert.equal(admin.canChangeRole('e1', 'owner'), false);

    const owner = createAccess(ME, false, [role('e1', ME, 'owner')]);
    assert.equal(owner.canAddRole('e1', 'owner'), true);
    assert.equal(owner.canChangeRole('e1', 'admin'), true);

    const editor = createAccess(ME, false, [role('e1', ME, 'editor')]);
    assert.equal(editor.canViewRoles('e1'), true);
    assert.equal(editor.canAddRole('e1', 'viewer'), false);
});

test('viewers and editors limited to an input only reach that input', () => {
    const access = createAccess(ME, false, [
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
    const access = createAccess(ME, false, [role('e1', ME, 'viewer')]);
    assert.equal(access.canViewKey('e1', 'anything'), true);
    assert.equal(access.canChangeKey('e1', 'anything'), false);
    assert.equal(access.canViewKey('e2', 'anything'), false);
});

test('technical status detail is for owners only', () => {
    const editor = createAccess(ME, false, [role('e1', ME, 'editor')]);
    const admin = createAccess(ME, false, [role('e1', ME, 'admin')]);
    const owner = createAccess(ME, false, [role('e1', ME, 'owner')]);
    assert.equal(editor.canSeeTechnicalStatus('e1'), false);
    assert.equal(admin.canSeeTechnicalStatus('e1'), false);
    assert.equal(owner.canSeeTechnicalStatus('e1'), true);
    assert.equal(createAccess(ME, true, []).canSeeTechnicalStatus('e1'), true);
});

test('what the browser is told about an event follows the same rules', () => {
    const can = createAccess(ME, false, [role('e1', ME, 'admin')]).describeEvent('e1');
    assert.deepEqual(can, {
        rename: false,
        delete: false,
        manageInputs: true,
        viewRoles: true,
        addRoleTypes: ['viewer', 'editor', 'admin'],
        addKeys: true,
        seeTechnicalStatus: false,
    });
});
