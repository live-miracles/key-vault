import assert from 'node:assert/strict';
import test from 'node:test';

import * as ops from '../supabase/functions/_shared/operations.ts';
import { hashUrl, keyUrl } from '../supabase/functions/_shared/key-url.ts';
import { createMemoryStore } from './memory-store.mjs';

const NOW = Date.parse('2026-11-13T10:00:00Z');
const key = (id, event, input, extra = {}) => ({
    id,
    event,
    name: `Key ${id}`,
    input,
    server: 'yt',
    key: `abcd-${id}`,
    server2: '',
    key2: '',
    link: '',
    color: '',
    remarks: '',
    ...extra,
});

function seed() {
    return createMemoryStore({
        events: [
            { id: 'E1', name: 'Event one' },
            { id: 'E2', name: 'Event two' },
        ],
        inputs: [
            { id: 'L1', name: 'English', order: '1' },
            { id: 'L2', name: 'Hindi', order: '2' },
        ],
        roles: [
            { id: 'R1', event: 'E1', email: 'admin@example.test', type: '2', input: '*' },
            { id: 'R2', event: 'E1', email: 'editor@example.test', type: '1', input: 'L1' },
            { id: 'R3', event: 'E1', email: 'viewer@example.test', type: '0', input: 'L2' },
        ],
        keys: [key('K1', 'E1', 'L1'), key('K2', 'E1', 'L2'), key('K3', 'E2', 'L1')],
    });
}

const as = (email, isAppOwner = false) => ({
    email,
    isAppOwner,
    hashSecret: 'secret',
    nowMs: NOW,
});
const owner = as('owner@example.test', true);
const admin = as('admin@example.test');
const editor = as('editor@example.test');
const viewer = as('viewer@example.test');
const stranger = as('nobody@example.test');

test('a user only receives the events, roles and keys they may view', async () => {
    const store = seed();

    const asViewer = (await ops.getAllData(store, viewer)).data;
    assert.deepEqual(
        asViewer.events.map((e) => e.id),
        ['E1'],
    );
    assert.deepEqual(
        asViewer.keys.map((k) => k.id),
        ['K2'],
    );
    assert.deepEqual(asViewer.roles, []);
    assert.equal(asViewer.userEmail, 'viewer@example.test');
    assert.equal(asViewer.inputs.length, 2);

    const asOwner = (await ops.getAllData(store, owner)).data;
    assert.equal(asOwner.keys.length, 3);
    assert.equal(asOwner.isAppOwner, true);

    const nothing = (await ops.getAllData(store, stranger)).data;
    assert.deepEqual([nothing.events, nothing.keys, nothing.roles], [[], [], []]);
});

test('an unchanged etag returns only the etag, and any change moves it', async () => {
    const store = seed();
    const first = (await ops.getAllData(store, admin)).data;
    const again = (await ops.getAllData(store, admin, first.etag)).data;
    assert.deepEqual(again, { etag: first.etag });

    await ops.editEvent(store, owner, { id: 'E1', name: 'Renamed' });
    const changed = (await ops.getAllData(store, admin, first.etag)).data;
    assert.notEqual(changed.etag, first.etag);
    assert.equal(changed.events[0].name, 'Renamed');
});

test('events: admins create, only owners edit and delete', async () => {
    const store = seed();

    assert.equal((await ops.addEvent(store, stranger, { name: 'X' })).success, false);
    assert.equal((await ops.addEvent(store, admin, {})).success, false);

    const created = await ops.addEvent(store, admin, { name: '  New event  ' });
    assert.equal(created.success, true);
    assert.equal(created.data.name, 'New event');
    assert.equal(created.data.adminRole.email, 'admin@example.test');
    assert.equal(created.data.adminRole.type, '2');

    const byOwner = await ops.addEvent(store, owner, { name: 'Owner event' });
    assert.equal(byOwner.data.adminRole, undefined);

    assert.equal((await ops.editEvent(store, admin, { id: 'E1', name: 'x' })).success, false);
    assert.equal((await ops.editEvent(store, owner, { id: 'E1', name: 'ok' })).success, true);
    assert.equal((await ops.deleteEvent(store, admin, 'E1')).success, false);
    assert.equal((await ops.deleteEvent(store, stranger, 'E1')).error, 'Event not found: E1');

    assert.equal((await ops.deleteEvent(store, owner, 'E1')).success, true);
    assert.equal(
        store.state.keys.some((k) => k.event === 'E1'),
        false,
    );
    assert.equal(
        store.state.roles.some((r) => r.event === 'E1'),
        false,
    );
});

test('keys: editors write only their input, viewers nothing', async () => {
    const store = seed();
    const input = (input) => ({
        event: 'E1',
        name: 'New',
        input,
        server: 'yt',
        key: 'abcd-9999',
    });

    assert.equal((await ops.addKey(store, viewer, input('L2'))).success, false);
    assert.equal((await ops.addKey(store, editor, input('L2'))).success, false);
    const added = await ops.addKey(store, editor, input('L1'));
    assert.equal(added.success, true);
    assert.ok(added.data.id);
    assert.notEqual(added.data.id, 'K1');

    assert.equal((await ops.addKey(store, editor, { ...input('L1'), input: '9' })).success, false);
    assert.equal((await ops.addKey(store, editor, { ...input('L1'), key: '' })).success, false);

    assert.equal(
        (await ops.editKey(store, editor, { ...key('K2', 'E1', 'L2'), name: 'x' })).success,
        false,
    );
    assert.equal(
        (await ops.editKey(store, editor, { ...key('K1', 'E1', 'L1'), name: 'Renamed' })).success,
        true,
    );
    assert.equal((await ops.deleteKey(store, viewer, 'K2')).success, false);
    assert.equal((await ops.deleteKey(store, editor, 'K1')).success, true);
});

test('key colors: only owners and admins set them, and a new destination clears them', async () => {
    const store = seed();

    const byEditor = await ops.editKey(store, editor, { ...key('K1', 'E1', 'L1'), color: '3' });
    assert.equal(byEditor.success, false);
    assert.match(byEditor.error, /owners or admins/);

    const byAdmin = await ops.editKey(store, admin, { ...key('K1', 'E1', 'L1'), color: '3' });
    assert.equal(byAdmin.success, true);
    assert.equal(store.state.keys.find((k) => k.id === 'K1').color, '3');

    // An editor may save the key again when the color is left as it was.
    const same = await ops.editKey(store, editor, {
        ...key('K1', 'E1', 'L1'),
        color: '3',
        remarks: 'note',
    });
    assert.equal(same.success, true);

    const moved = await ops.editKey(store, admin, {
        ...key('K1', 'E1', 'L1'),
        color: '3',
        key: 'another-key',
    });
    assert.equal(moved.success, true);
    assert.equal(store.state.keys.find((k) => k.id === 'K1').color, '');

    const bogus = await ops.editKey(store, admin, { ...key('K1', 'E1', 'L1'), color: '99' });
    assert.equal(store.state.keys.find((k) => k.id === 'K1').color, '');
    assert.equal(bogus.success, true);
});

test('a key cannot move between events', async () => {
    const store = seed();
    const result = await ops.editKey(store, owner, { ...key('K1', 'E2', 'L1') });
    assert.match(result.error, /Cannot move key/);
});

test('roles: admins manage non-owner roles, emails are validated and lowercased', async () => {
    const store = seed();
    const add = (ctx, extra) =>
        ops.addRole(store, ctx, {
            event: 'E1',
            email: 'New@Example.test',
            type: '1',
            input: 'L1',
            ...extra,
        });

    assert.equal((await add(editor)).success, false);
    const added = await add(admin);
    assert.equal(added.success, true);
    assert.equal(added.data.email, 'new@example.test');

    assert.equal((await add(admin, { type: '3' })).success, false);
    assert.equal((await add(owner, { type: '3' })).success, true);

    const admins = await add(admin, { type: '2', input: 'L1' });
    assert.equal(admins.data.input, '*');

    assert.equal((await add(admin, { email: 'a@b.test, c@d.test' })).success, false);
    assert.equal((await add(admin, { type: '7' })).success, false);
    assert.equal((await add(admin, { input: 'L9' })).success, false);

    const editedRole = await ops.editRole(store, admin, {
        id: added.data.id,
        event: 'E1',
        email: 'new@example.test',
        type: '0',
        input: 'L2',
    });
    assert.equal(editedRole.success, true);
    assert.equal(store.state.roles.find((r) => r.id === added.data.id).type, '0');

    assert.equal((await ops.deleteRole(store, editor, 'R2')).success, false);
    assert.equal((await ops.deleteRole(store, admin, added.data.id)).success, true);
    assert.equal((await ops.deleteRole(store, admin, 'R404')).success, false);
});

test('inputs: only owners manage them, and one in use stays', async () => {
    const store = seed();

    assert.equal((await ops.addInput(store, admin, { name: 'Tamil' })).success, false);
    const added = await ops.addInput(store, owner, { name: '  Tamil  ' });
    assert.equal(added.success, true);
    assert.equal(added.data.name, 'Tamil');
    assert.equal(added.data.order, '3');
    // The id is made by the store, never taken from the caller, and is never reused.
    const again = await ops.addInput(store, owner, { id: added.data.id, name: 'Again' });
    assert.notEqual(again.data.id, added.data.id);
    assert.equal((await ops.deleteInput(store, owner, again.data.id)).success, true);
    assert.equal((await ops.addInput(store, owner, { name: '   ' })).success, false);
    assert.equal((await ops.addInput(store, owner, {})).success, false);

    const newId = added.data.id;
    assert.equal((await ops.editInput(store, owner, { id: newId, name: 'Tamizh' })).success, true);
    assert.equal(store.state.inputs.find((l) => l.id === newId).name, 'Tamizh');

    assert.equal((await ops.deleteInput(store, owner, 'L1')).error, 'Input is in use: L1');
    assert.equal((await ops.deleteInput(store, owner, newId)).success, true);

    assert.equal((await ops.reorderInputs(store, owner, ['L2'])).error, 'Input list mismatch');
    assert.equal(
        (await ops.reorderInputs(store, owner, ['L2', 'L2'])).error,
        'Input list mismatch',
    );
    const reordered = await ops.reorderInputs(store, owner, ['L2', 'L1']);
    assert.deepEqual(
        reordered.data.map((l) => [l.id, l.order]),
        [
            ['L2', '1'],
            ['L1', '2'],
        ],
    );
    assert.equal((await ops.reorderInputs(store, admin, ['L2', 'L1'])).success, false);
});

test('getStatus covers only the keys the user may see', async () => {
    const store = seed();
    const hash = await hashUrl('secret', keyUrl('yt', 'abcd-K2'));
    store.state.status = {
        rows: [
            {
                instance: 'prod',
                hash,
                pipeline: 'Hindi',
                output: 'YouTube',
                status: 'error',
                message: 'refused',
                failures: 3,
                stoppedAfterFailures: true,
                sinceMs: 1,
            },
        ],
        pipelines: [
            { instance: 'prod', pipeline: 'hindi', status: 'error', message: '', sinceMs: 1 },
        ],
        instances: [{ instance: 'prod', lastSeenAt: new Date(NOW - 1000).toISOString() }],
    };

    const asViewer = (await ops.getStatus(store, viewer)).data;
    assert.deepEqual(Object.keys(asViewer.keys), ['K2']);
    assert.equal(asViewer.keys.K2.main.status, 'error');
    assert.equal(asViewer.keys.K2.main.inputMismatch, false);
    // Only the inputs of keys the user may see, matched to the pipeline by name.
    assert.deepEqual(Object.keys(asViewer.inputs), ['L2']);
    assert.equal(asViewer.inputs.L2.status, 'error');
    assert.equal(asViewer.online, true);

    const asEditor = (await ops.getStatus(store, editor)).data;
    assert.deepEqual(Object.keys(asEditor.keys), ['K1']);
    assert.equal(asEditor.keys.K1.main, null);
    assert.deepEqual(Object.keys(asEditor.inputs), ['L1']);
    assert.equal(asEditor.inputs.L1, null);
});

test('only owners can read the settings bunryu needs', async () => {
    const store = seed();
    const configured = {
        secret: 'secret-123',
        ingestUrl: 'https://x.supabase.co/functions/v1/ingest',
    };

    const asOwner = await ops.getBunryuSettings(store, { ...owner, ...configured });
    assert.deepEqual(asOwner, {
        success: true,
        data: {
            url: 'https://x.supabase.co/functions/v1/ingest',
            secret: 'secret-123',
        },
    });

    for (const user of [admin, editor, viewer, stranger]) {
        const answer = await ops.getBunryuSettings(store, { ...user, ...configured });
        assert.equal(answer.success, false);
        assert.ok(!JSON.stringify(answer).includes('secret-123'));
    }

    const unconfigured = await ops.getBunryuSettings(store, owner);
    assert.equal(unconfigured.success, false);
});

test('only the listed operations are callable', () => {
    assert.deepEqual(Object.keys(ops.OPERATIONS).sort(), [
        'addEvent',
        'addInput',
        'addKey',
        'addRole',
        'deleteEvent',
        'deleteInput',
        'deleteKey',
        'deleteRole',
        'editEvent',
        'editInput',
        'editKey',
        'editRole',
        'getAllData',
        'getBunryuSettings',
        'getStatus',
        'reorderInputs',
    ]);
});
