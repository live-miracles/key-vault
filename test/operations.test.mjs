import assert from 'node:assert/strict';
import test from 'node:test';

import { hashUrl } from '../supabase/functions/_shared/link-hash.ts';
import { createMemoryStore } from '../supabase/functions/_shared/memory-store.ts';
import * as ops from '../supabase/functions/_shared/operations.ts';
import { streamUrl } from '../supabase/functions/_shared/platforms.ts';
import { ApiError } from '../supabase/functions/_shared/types.ts';

const NOW = Date.parse('2026-11-13T10:00:00Z');
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Two events. The first has English and Hindi, the second its own English.
const E1 = uuid(1);
const E2 = uuid(2);
const ENGLISH = uuid(11);
const HINDI = uuid(12);
const ENGLISH2 = uuid(13);
const K1 = uuid(21);
const K2 = uuid(22);
const K3 = uuid(23);

const key = (id, event, input, extra = {}) => ({
    id,
    event,
    name: `Key ${id.slice(-2)}`,
    input,
    platform: 'yt',
    streamKey: `abcd-${id.slice(-2)}`,
    backupPlatform: '',
    backupStreamKey: '',
    link: '',
    remarks: '',
    updatedBy: '',
    updatedAction: '',
    updatedAt: '',
    ...extra,
});

function seed() {
    return createMemoryStore({
        events: [
            { id: E1, name: 'Event one' },
            { id: E2, name: 'Event two' },
        ],
        inputs: [
            { id: ENGLISH, event: E1, name: 'English', position: 1 },
            { id: HINDI, event: E1, name: 'Hindi', position: 2 },
            { id: ENGLISH2, event: E2, name: 'English', position: 1 },
        ],
        roles: [
            { id: uuid(31), event: E1, email: 'admin@example.test', type: 'admin', input: null },
            {
                id: uuid(32),
                event: E1,
                email: 'editor@example.test',
                type: 'editor',
                input: ENGLISH,
            },
            { id: uuid(33), event: E1, email: 'viewer@example.test', type: 'viewer', input: HINDI },
        ],
        keys: [key(K1, E1, ENGLISH), key(K2, E1, HINDI), key(K3, E2, ENGLISH2)],
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

// The code of the error an operation fails with, or null when it succeeds.
async function failure(promise) {
    try {
        await promise;
        return null;
    } catch (error) {
        assert.ok(error instanceof ApiError, `expected an ApiError, got ${error}`);
        return error;
    }
}
const refused = async (promise) => (await failure(promise))?.code;

test('a user only receives the events, roles and destinations they may view', async () => {
    const store = seed();

    const asViewer = await ops.getAllData(store, viewer);
    assert.deepEqual(
        asViewer.events.map((e) => e.id),
        [E1],
    );
    assert.deepEqual(
        asViewer.keys.map((k) => k.id),
        [K2],
    );
    assert.deepEqual(asViewer.roles, []);
    assert.equal(asViewer.userEmail, 'viewer@example.test');
    // Only the inputs whose destinations the user may see.
    assert.deepEqual(
        asViewer.inputs.map((i) => i.id),
        [HINDI],
    );

    const asOwner = await ops.getAllData(store, owner);
    assert.equal(asOwner.keys.length, 3);
    assert.equal(asOwner.isAppOwner, true);

    const nothing = await ops.getAllData(store, stranger);
    assert.deepEqual([nothing.events, nothing.keys, nothing.roles], [[], [], []]);
    assert.equal(nothing.canCreateEvents, false);
});

test('what the user may do is sent with each item, so the browser works nothing out', async () => {
    const store = seed();

    const asEditor = await ops.getAllData(store, editor);
    assert.deepEqual(
        asEditor.keys.map((k) => [k.id, k.canChange]),
        [[K1, true]],
    );
    assert.deepEqual(
        asEditor.inputs.map((i) => [i.id, i.canAddKeys]),
        [[ENGLISH, true]],
    );
    assert.equal(asEditor.events[0].can.addKeys, true);
    assert.equal(asEditor.events[0].can.manageInputs, false);
    assert.equal(asEditor.events[0].can.rename, false);
    assert.equal(asEditor.events[0].can.viewRoles, true);
    assert.deepEqual(asEditor.events[0].can.addRoleTypes, []);
    assert.equal(asEditor.events[0].can.seeTechnicalStatus, false);

    const asViewer = await ops.getAllData(store, viewer);
    assert.equal(asViewer.keys[0].canChange, false);
    assert.equal(asViewer.events[0].can.addKeys, false);
    assert.equal(asViewer.events[0].can.viewRoles, false);

    const asAdmin = await ops.getAllData(store, admin);
    assert.equal(asAdmin.canCreateEvents, true);
    assert.equal(asAdmin.events[0].can.manageInputs, true);
    assert.equal(asAdmin.events[0].can.seeTechnicalStatus, true);
    assert.deepEqual(asAdmin.events[0].can.addRoleTypes, ['viewer', 'editor', 'admin']);
    assert.equal(asAdmin.events[0].can.delete, false);
    assert.equal(asAdmin.roles.find((r) => r.type === 'admin').canChange, false);
    assert.equal(asAdmin.roles.find((r) => r.type === 'editor').canChange, true);

    const asOwner = await ops.getAllData(store, owner);
    assert.deepEqual(asOwner.events[0].can.addRoleTypes, ['viewer', 'editor', 'admin', 'owner']);
    assert.equal(asOwner.events[0].can.delete, true);
});

test('events: admins create, only owners edit and delete', async () => {
    const store = seed();

    assert.equal(await refused(ops.addEvent(store, stranger, { name: 'X' })), 'denied');
    assert.equal(await refused(ops.addEvent(store, admin, {})), 'invalid');

    const created = await ops.addEvent(store, admin, { name: '  New event  ' });
    assert.equal(created.name, 'New event');
    assert.equal(created.adminRole.email, 'admin@example.test');
    assert.equal(created.adminRole.type, 'admin');
    assert.equal(created.can.manageInputs, true);

    const byOwner = await ops.addEvent(store, owner, { name: 'Owner event' });
    assert.equal(byOwner.adminRole, undefined);

    assert.equal(await refused(ops.editEvent(store, admin, { id: E1, name: 'x' })), 'denied');
    assert.deepEqual(await ops.editEvent(store, owner, { id: E1, name: 'ok' }), {
        id: E1,
        name: 'ok',
    });
    assert.equal(await refused(ops.deleteEvent(store, admin, { id: E1 })), 'denied');
    assert.equal(await refused(ops.deleteEvent(store, stranger, { id: E1 })), 'not_found');

    await ops.deleteEvent(store, owner, { id: E1 });
    assert.equal(
        store.state.keys.some((k) => k.event === E1),
        false,
    );
    assert.equal(
        store.state.roles.some((r) => r.event === E1),
        false,
    );
    assert.equal(
        store.state.inputs.some((i) => i.event === E1),
        false,
    );
});

test('destinations: editors write only their input, viewers nothing', async () => {
    const store = seed();
    const fields = (input) => ({
        event: E1,
        name: 'New',
        input,
        platform: 'yt',
        streamKey: 'abcd-9999',
    });

    assert.equal(await refused(ops.addKey(store, viewer, fields(HINDI))), 'denied');
    assert.equal(await refused(ops.addKey(store, editor, fields(HINDI))), 'denied');
    const added = await ops.addKey(store, editor, fields(ENGLISH));
    assert.ok(added.id);
    assert.equal(added.canChange, true);

    assert.equal(await refused(ops.addKey(store, editor, fields(uuid(99)))), 'not_found');
    assert.equal(
        await refused(ops.addKey(store, editor, { ...fields(ENGLISH), streamKey: '' })),
        'invalid',
    );

    assert.equal(
        await refused(ops.editKey(store, editor, { ...key(K2, E1, HINDI), name: 'x' })),
        'denied',
    );
    const renamed = await ops.editKey(store, editor, { ...key(K1, E1, ENGLISH), name: 'Renamed' });
    assert.equal(renamed.name, 'Renamed');
    assert.equal(await refused(ops.deleteKey(store, viewer, { id: K2 })), 'denied');
    await ops.deleteKey(store, editor, { id: K1 });
    assert.equal(
        store.state.keys.some((k) => k.id === K1),
        false,
    );
});

test('a destination cannot move between events', async () => {
    const store = seed();
    const error = await failure(ops.editKey(store, owner, key(K1, E2, ENGLISH)));
    assert.equal(error.code, 'invalid');
    assert.match(error.message, /another event/);
});

test('the server refuses a destination the form would have refused', async () => {
    const store = seed();
    const base = { event: E1, name: 'New', input: ENGLISH, platform: 'yt', streamKey: 'abcd-9999' };
    const add = (extra) => ops.addKey(store, admin, { ...base, ...extra });

    assert.equal(await refused(add({ platform: 'nope' })), 'invalid');
    // A full address where a key belongs, spaces in a key, a bad Instagram key.
    assert.equal(
        await refused(add({ streamKey: 'rtmp://a.rtmp.youtube.com/live2/abcd' })),
        'invalid',
    );
    assert.equal(await refused(add({ streamKey: 'ab cd' })), 'invalid');
    assert.equal(await refused(add({ platform: 'ig', streamKey: 'no-prp' })), 'invalid');
    assert.equal(await refused(add({ name: 'Bad/name' })), 'invalid');
    assert.equal(await refused(add({ platform: 'rtmp', streamKey: 'abcd' })), 'invalid');
    assert.equal(
        await refused(
            add({ platform: 'srt', streamKey: 'srt://host:99999?mode=caller&latency=240000' }),
        ),
        'invalid',
    );

    const ok = await add({ platform: 'rtmp', streamKey: 'rtmp://example.test/live/abcd' });
    assert.equal(ok.platform, 'rtmp');
});

test('a platform that sets its own backup up (or has none) stores no backup', async () => {
    const store = seed();
    const base = { event: E1, name: 'New', input: ENGLISH, streamKey: 'abcd-9999' };

    const yt = await ops.addKey(store, admin, {
        ...base,
        platform: 'yt',
        backupPlatform: 'rtmp',
        backupStreamKey: 'rtmp://x.test/live/key',
    });
    assert.equal(yt.backupPlatform, '');
    assert.equal(yt.backupStreamKey, '');

    // Facebook's backup is always Facebook, with its own key.
    const fb = await ops.addKey(store, admin, {
        ...base,
        name: 'FB',
        platform: 'fb',
        streamKey: 'FB-1-0-aaa',
        backupPlatform: 'rtmp',
        backupStreamKey: 'FB-2-0-bbb',
    });
    assert.equal(fb.backupPlatform, 'fb');
});

test('one address cannot be used by two destinations of an event', async () => {
    const store = seed();
    const base = { event: E1, name: 'Copy', input: ENGLISH, platform: 'yt', streamKey: 'abcd-21' };

    // K1 already uses abcd-21 on YouTube.
    const clash = await failure(ops.addKey(store, admin, base));
    assert.equal(clash.code, 'conflict');
    assert.match(clash.message, /already added/);

    // The same key in another event is a different destination.
    assert.ok(await ops.addKey(store, owner, { ...base, event: E2, input: ENGLISH2 }));

    // A backup may not repeat another destination's address, nor its own main.
    const backup = { ...base, streamKey: 'new-key', platform: 'vc', backupPlatform: 'vc' };
    assert.equal(
        (await failure(ops.addKey(store, admin, { ...backup, backupStreamKey: 'new-key' }))).code,
        'conflict',
    );
    // YouTube's derived backup counts too: a second YouTube destination can reuse neither.
    assert.equal(
        (await failure(ops.addKey(store, admin, { ...base, platform: 'yt', streamKey: 'abcd-21' })))
            .code,
        'conflict',
    );

    // Editing a destination does not clash with itself.
    await ops.editKey(store, admin, { ...key(K1, E1, ENGLISH), remarks: 'note' });
});

test('roles: admins manage non-owner roles, emails are validated and lowercased', async () => {
    const store = seed();
    const add = (ctx, extra) =>
        ops.addRole(store, ctx, {
            event: E1,
            email: 'New@Example.test',
            type: 'editor',
            input: ENGLISH,
            ...extra,
        });

    assert.equal(await refused(add(editor)), 'denied');
    const added = await add(admin);
    assert.equal(added.email, 'new@example.test');

    assert.equal(await refused(add(admin, { type: 'owner' })), 'denied');
    assert.ok(await add(owner, { type: 'owner' }));

    // An admin sees every input, whatever was sent.
    assert.equal((await add(admin, { type: 'admin', input: ENGLISH })).input, null);
    // A viewer or editor with no input sees them all.
    assert.equal((await add(admin, { type: 'viewer', input: null })).input, null);

    assert.equal(await refused(add(admin, { email: 'a@b.test, c@d.test' })), 'invalid');
    assert.equal(await refused(add(admin, { type: 'boss' })), 'invalid');
    assert.equal(await refused(add(admin, { input: uuid(98) })), 'not_found');

    const edited = await ops.editRole(store, admin, {
        id: added.id,
        email: 'new@example.test',
        type: 'viewer',
        input: HINDI,
    });
    assert.equal(edited.type, 'viewer');
    assert.equal(store.state.roles.find((r) => r.id === added.id).type, 'viewer');

    assert.equal(await refused(ops.deleteRole(store, editor, { id: uuid(32) })), 'denied');
    await ops.deleteRole(store, admin, { id: added.id });
    assert.equal(await refused(ops.deleteRole(store, admin, { id: uuid(404) })), 'not_found');
});

test("inputs: an event's admins and owners manage its list, and one in use stays", async () => {
    const store = seed();
    const addInput = (who, event, name) => ops.addInput(store, who, { event, name });

    // Editors and viewers cannot; neither can an admin of another event's list.
    assert.equal(await refused(addInput(editor, E1, 'Tamil')), 'denied');
    assert.equal(await refused(addInput(viewer, E1, 'Tamil')), 'denied');
    assert.equal(await refused(addInput(admin, E2, 'Tamil')), 'not_found');
    assert.equal(await refused(addInput(stranger, E1, 'Tamil')), 'not_found');

    const added = await addInput(admin, E1, '  Tamil  ');
    assert.equal(added.name, 'Tamil');
    assert.equal(added.event, E1);
    assert.equal(added.position, 3);
    // The first input of another event starts its own order.
    const other = await addInput(owner, E2, 'Tamil');
    assert.equal(other.position, 2);
    // The id is made by the store, never taken from the caller, and is never reused.
    const again = await ops.addInput(store, admin, { event: E1, id: added.id, name: 'Again' });
    assert.notEqual(again.id, added.id);
    await ops.deleteInput(store, admin, { id: again.id });
    assert.equal(await refused(addInput(admin, E1, '   ')), 'invalid');
    assert.equal(await refused(ops.addInput(store, admin, { name: 'No event' })), 'invalid');
    assert.equal(await refused(addInput(admin, uuid(404), 'Lost')), 'not_found');

    // A name is unique within the event, whatever its case, and may repeat in another one.
    assert.equal(await refused(addInput(admin, E1, 'english')), 'conflict');

    assert.deepEqual(await ops.editInput(store, admin, { id: added.id, name: 'Tamizh' }), {
        id: added.id,
        name: 'Tamizh',
    });
    assert.equal(store.state.inputs.find((i) => i.id === added.id).name, 'Tamizh');
    assert.equal(
        await refused(ops.editInput(store, admin, { id: added.id, name: 'Hindi' })),
        'conflict',
    );
    assert.equal(
        await refused(ops.editInput(store, editor, { id: added.id, name: 'Nope' })),
        'denied',
    );
    assert.equal(
        await refused(ops.editInput(store, admin, { id: ENGLISH2, name: 'Nope' })),
        'not_found',
    );

    const inUse = await failure(ops.deleteInput(store, admin, { id: ENGLISH }));
    assert.equal(inUse.code, 'conflict');
    assert.match(inUse.message, /still has destinations or shared people/);
    assert.equal(await refused(ops.deleteInput(store, editor, { id: added.id })), 'denied');
    assert.equal(await refused(ops.deleteInput(store, admin, { id: ENGLISH2 })), 'not_found');
    await ops.deleteInput(store, admin, { id: added.id });

    // Reordering covers exactly the inputs of that event.
    const reorder = (who, event, ids) => ops.reorderInputs(store, who, { event, ids });
    assert.equal(await refused(reorder(admin, E1, [HINDI])), 'conflict');
    assert.equal(await refused(reorder(admin, E1, [HINDI, HINDI])), 'conflict');
    assert.equal(await refused(reorder(admin, E1, [HINDI, ENGLISH2])), 'conflict');
    await reorder(admin, E1, [HINDI, ENGLISH]);
    assert.deepEqual(
        store.state.inputs.filter((i) => i.event === E1).map((i) => [i.id, i.position]),
        [
            [HINDI, 1],
            [ENGLISH, 2],
        ],
    );
    assert.equal(store.state.inputs.find((i) => i.id === ENGLISH2).position, 1);
    assert.equal(await refused(reorder(editor, E1, [HINDI, ENGLISH])), 'denied');
    assert.equal(await refused(reorder(admin, E2, [ENGLISH2])), 'not_found');
    await reorder(owner, E2, [ENGLISH2, other.id]);
});

test("an input of one event cannot be used by another event's destinations or roles", async () => {
    const store = seed();
    const asKey = (input) => ({
        event: E1,
        name: 'New',
        input,
        platform: 'yt',
        streamKey: 'abcd-7777',
    });
    assert.equal(await refused(ops.addKey(store, admin, asKey(ENGLISH2))), 'not_found');
    assert.ok(await ops.addKey(store, admin, asKey(ENGLISH)));
    const role = { event: E1, email: 'new@example.test', type: 'editor' };
    assert.equal(
        await refused(ops.addRole(store, admin, { ...role, input: ENGLISH2 })),
        'not_found',
    );
    assert.ok(await ops.addRole(store, admin, { ...role, input: HINDI }));
});

test('getStatus covers only the destinations the user may see', async () => {
    const store = seed();
    const hash = await hashUrl('secret', streamUrl('yt', 'abcd-22'));
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

    const asViewer = await ops.getStatus(store, viewer);
    assert.deepEqual(Object.keys(asViewer.keys), [K2]);
    assert.equal(asViewer.keys[K2].state, 'error');
    assert.equal(asViewer.keys[K2].side, 'main');
    assert.equal(asViewer.keys[K2].inputMismatch, false);
    // Only the inputs of destinations the user may see, matched to the pipeline by name.
    assert.deepEqual(Object.keys(asViewer.inputs), [HINDI]);
    assert.equal(asViewer.inputs[HINDI].status, 'error');
    assert.equal(asViewer.online, true);

    const asEditor = await ops.getStatus(store, editor);
    assert.deepEqual(Object.keys(asEditor.keys), [K1]);
    assert.equal(asEditor.keys[K1].state, 'not_configured');
    assert.deepEqual(Object.keys(asEditor.inputs), [ENGLISH]);
    assert.equal(asEditor.inputs[ENGLISH], null);
});

test("YouTube's backup is looked for in bunryu too", async () => {
    const store = seed();
    const hash = await hashUrl('secret', 'rtmp://b.rtmp.youtube.com/live2?backup=1/abcd-21');
    store.state.status = {
        rows: [
            {
                instance: 'prod',
                hash,
                pipeline: 'English',
                output: 'YouTube backup',
                status: 'warning',
                message: 'falling behind',
                failures: 0,
                stoppedAfterFailures: false,
                sinceMs: 1,
            },
        ],
        pipelines: [],
        instances: [{ instance: 'prod', lastSeenAt: new Date(NOW - 1000).toISOString() }],
    };

    const report = await ops.getStatus(store, editor);
    assert.equal(report.keys[K1].state, 'warning');
    assert.equal(report.keys[K1].side, 'backup');
});

test('only owners can read the settings bunryu needs', async () => {
    const store = seed();
    const configured = {
        secret: 'secret-123',
        ingestUrl: 'https://x.supabase.co/functions/v1/ingest',
    };

    assert.deepEqual(await ops.getBunryuSettings(store, { ...owner, ...configured }), {
        url: 'https://x.supabase.co/functions/v1/ingest',
        secret: 'secret-123',
    });

    for (const user of [admin, editor, viewer, stranger]) {
        const error = await failure(ops.getBunryuSettings(store, { ...user, ...configured }));
        assert.equal(error.code, 'denied');
        assert.ok(!error.message.includes('secret-123'));
    }

    assert.equal(await refused(ops.getBunryuSettings(store, owner)), 'unavailable');
});

test('only the listed operations are callable', async () => {
    assert.deepEqual(Object.keys(ops.operations).sort(), [
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
    assert.equal(
        await refused(ops.callOperation(seed(), owner, 'toString', undefined)),
        'not_found',
    );
    assert.equal(
        await refused(ops.callOperation(seed(), owner, '__proto__', undefined)),
        'not_found',
    );
});

test('a destination records who last added or edited it, and when', async () => {
    const store = seed();
    const input = {
        event: E1,
        name: 'New',
        input: ENGLISH,
        platform: 'yt',
        streamKey: 'abcd-9999',
    };
    const at = new Date(NOW).toISOString();

    // Added: the signed-in email, never one the browser sends.
    const added = await ops.addKey(store, editor, {
        ...input,
        updatedBy: 'someone-else@example.test',
        updatedAt: '2000-01-01T00:00:00.000Z',
    });
    assert.equal(added.updatedBy, 'editor@example.test');
    assert.equal(added.updatedAction, 'added');
    assert.equal(added.updatedAt, at);
    assert.equal(store.state.keys.find((k) => k.id === added.id).updatedBy, 'editor@example.test');

    // Edited later by an admin: the last edit replaces the add.
    const later = { ...admin, nowMs: NOW + 3600000 };
    const edited = await ops.editKey(store, later, { ...added, name: 'Renamed' });
    assert.equal(edited.updatedBy, 'admin@example.test');
    assert.equal(edited.updatedAction, 'edited');
    assert.equal(edited.updatedAt, new Date(NOW + 3600000).toISOString());
    const after = store.state.keys.find((k) => k.id === added.id);
    assert.equal(after.updatedBy, 'admin@example.test');
    assert.equal(after.name, 'Renamed');

    // A refused edit changes nothing.
    assert.equal(await refused(ops.editKey(store, viewer, { ...added, name: 'Nope' })), 'denied');
    assert.equal(store.state.keys.find((k) => k.id === added.id).updatedBy, 'admin@example.test');

    // Anyone who may see the destination is told who last changed it.
    const seen = await ops.getAllData(store, admin);
    assert.equal(seen.keys.find((k) => k.id === added.id).updatedBy, 'admin@example.test');
});
