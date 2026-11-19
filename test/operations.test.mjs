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
        admins: [{ id: uuid(31), email: 'admin@example.test', addedBy: 'owner@example.test' }],
    });
}

const as = (email, isAppOwner = false) => ({
    email,
    isAppOwner,
    ownerEmails: isAppOwner ? [email] : [],
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
    assert.equal(asAdmin.events[0].can.seeTechnicalStatus, false);
    assert.deepEqual(asAdmin.events[0].can.addRoleTypes, ['viewer', 'editor']);
    assert.equal(asAdmin.events[0].can.rename, true);
    assert.equal(asAdmin.events[0].can.delete, true);
    assert.equal(asAdmin.roles.find((r) => r.type === 'editor').canChange, true);
    assert.equal(asAdmin.canManageAdmins, true);
    assert.equal(asAdmin.canRestoreEvents, true);
    // An admin has every event, not only the ones they have a role in.
    assert.deepEqual(asAdmin.events.map((e) => e.id).sort(), [E1, E2].sort());
    assert.equal(asAdmin.keys.length, 3);
    assert.equal(asAdmin.isAppOwner, false);

    const asOwner = await ops.getAllData(store, owner);
    assert.deepEqual(asOwner.events[0].can.addRoleTypes, ['viewer', 'editor']);
    assert.equal(asOwner.events[0].can.delete, true);
    assert.equal(asOwner.events[0].can.seeTechnicalStatus, true);
});

test('who has access to every event is sent to the people who see a Share list', async () => {
    const store = seed();
    const everyone = { ...owner, ownerEmails: ['owner@example.test'] };
    const named = (ctx) => ({ ...ctx, ownerEmails: ['owner@example.test'] });

    const expected = [
        { email: 'owner@example.test', owner: true },
        { email: 'admin@example.test', owner: false },
    ];
    assert.deepEqual((await ops.getAllData(store, everyone)).everyEvent, expected);
    assert.deepEqual((await ops.getAllData(store, named(admin))).everyEvent, expected);
    // An editor sees the list of their event, so they see who else has it.
    assert.deepEqual((await ops.getAllData(store, named(editor))).everyEvent, expected);
    // A viewer sees no list, and a stranger no event.
    assert.deepEqual((await ops.getAllData(store, named(viewer))).everyEvent, []);
    assert.deepEqual((await ops.getAllData(store, named(stranger))).everyEvent, []);

    // Someone added as an admin who is also named on the server is listed once, as an owner.
    store.state.admins.push({ id: uuid(62), email: 'owner@example.test', addedBy: '' });
    assert.deepEqual((await ops.getAllData(store, everyone)).everyEvent, expected);
});

test('events: admins create, edit and delete any; editors and strangers cannot', async () => {
    const store = seed();

    assert.equal(await refused(ops.addEvent(store, stranger, { name: 'X' })), 'denied');
    assert.equal(await refused(ops.addEvent(store, editor, { name: 'X' })), 'denied');
    assert.equal(await refused(ops.addEvent(store, admin, {})), 'invalid');

    // Admins have every event, so nobody is given a role in the event they create.
    const created = await ops.addEvent(store, admin, { name: '  New event  ' });
    assert.equal(created.name, 'New event');
    assert.equal(created.can.manageInputs, true);
    assert.equal(created.adminRole, undefined);
    assert.equal(store.state.roles.length, 2);

    const byOwner = await ops.addEvent(store, owner, { name: 'Owner event' });
    assert.equal(byOwner.can.manageInputs, true);
    assert.equal(store.state.roles.length, 2);

    // An editor can see the event but not change it, a stranger cannot see it.
    assert.equal(await refused(ops.editEvent(store, editor, { id: E1, name: 'x' })), 'denied');
    assert.equal(await refused(ops.deleteEvent(store, editor, { id: E1 })), 'denied');
    assert.equal(await refused(ops.deleteEvent(store, stranger, { id: E1 })), 'not_found');

    // An admin has a say over every event.
    assert.deepEqual(await ops.editEvent(store, admin, { id: E2, name: 'by admin' }), {
        id: E2,
        name: 'by admin',
    });
    assert.deepEqual(await ops.editEvent(store, owner, { id: E2, name: 'by owner' }), {
        id: E2,
        name: 'by owner',
    });
    assert.deepEqual(await ops.editEvent(store, admin, { id: E1, name: 'ok' }), {
        id: E1,
        name: 'ok',
    });

    await ops.deleteEvent(store, admin, { id: E1 });
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

const DAY = 24 * 60 * 60 * 1000;
const inDays = (ctx, days) => ({ ...ctx, nowMs: NOW + days * DAY });

test('a deleted event goes to the trash with everything it holds, out of sight', async () => {
    const store = seed();

    await ops.deleteEvent(store, admin, { id: E1 });

    // Nobody loads it any more, not even an owner, and its destinations are no longer in status.
    for (const who of [owner, admin, editor, viewer]) {
        const data = await ops.getAllData(store, who);
        assert.equal(
            data.events.some((e) => e.id === E1),
            false,
        );
        assert.equal(
            data.keys.some((k) => k.event === E1),
            false,
        );
    }
    assert.deepEqual(Object.keys((await ops.getStatus(store, owner)).keys), [K3]);
    assert.equal(await refused(ops.editEvent(store, owner, { id: E1, name: 'x' })), 'not_found');
    assert.equal(await refused(ops.deleteEvent(store, owner, { id: E1 })), 'not_found');
    assert.equal(
        await refused(
            ops.addKey(store, owner, {
                event: E1,
                name: 'New',
                input: ENGLISH,
                platform: 'yt',
                streamKey: 'abcd-9999',
            }),
        ),
        'not_found',
    );

    // It is in the trash: who deleted it, when, and how much it holds.
    assert.deepEqual(await ops.getTrash(store, owner), [
        {
            id: E1,
            name: 'Event one',
            deletedAt: new Date(NOW).toISOString(),
            deletedBy: 'admin@example.test',
            destinations: 2,
            inputs: 2,
            expiresAt: new Date(NOW + 30 * DAY).toISOString(),
        },
    ]);
});

test('only admins see the trash and restore from it', async () => {
    const store = seed();
    const another = as('boss@example.test');
    await ops.addAdmin(store, owner, { email: 'boss@example.test' });
    await ops.deleteEvent(store, admin, { id: E1 });

    for (const who of [owner, admin, another]) {
        assert.equal((await ops.getAllData(store, who)).canRestoreEvents, true);
        assert.equal((await ops.getTrash(store, who)).length, 1);
    }
    for (const who of [editor, viewer, stranger]) {
        assert.equal((await ops.getAllData(store, who)).canRestoreEvents, false);
        assert.equal(await refused(ops.getTrash(store, who)), 'denied');
        assert.equal(await refused(ops.restoreEvent(store, who, { id: E1 })), 'denied');
    }
});

test('restoring an event brings back its inputs, destinations and people as they were', async () => {
    const store = seed();
    const before = structuredClone(store.state);
    await ops.deleteEvent(store, admin, { id: E1 });

    assert.equal(await refused(ops.restoreEvent(store, owner, { id: uuid(404) })), 'not_found');
    assert.equal(await refused(ops.restoreEvent(store, owner, {})), 'invalid');
    // An event that is not in the trash cannot be "restored".
    assert.equal(await refused(ops.restoreEvent(store, owner, { id: E2 })), 'not_found');

    assert.deepEqual(await ops.restoreEvent(store, owner, { id: E1 }), {
        id: E1,
        name: 'Event one',
    });
    assert.deepEqual(await ops.getTrash(store, owner), []);
    assert.equal(await refused(ops.restoreEvent(store, owner, { id: E1 })), 'not_found');

    const byId = (a, b) => a.id.localeCompare(b.id);
    for (const table of ['events', 'roles', 'inputs', 'keys']) {
        assert.deepEqual([...store.state[table]].sort(byId), [...before[table]].sort(byId));
    }
    // The people who had access have it again, with the same limits.
    const asEditor = await ops.getAllData(store, editor);
    assert.deepEqual(
        asEditor.keys.map((k) => k.id),
        [K1],
    );
    // The order the store keeps them in is its own business.
    assert.deepEqual((await ops.getAllData(store, admin)).events.map((e) => e.id).sort(), [E1, E2]);
});

test('the trash keeps an event for 30 days, then it is gone for good', async () => {
    const store = seed();
    await ops.deleteEvent(store, admin, { id: E1 });

    // The last day still counts.
    const day29 = inDays(owner, 29.5);
    assert.equal((await ops.getTrash(store, day29)).length, 1);

    // After 30 days it cannot be seen or restored, whether or not it has been removed yet.
    const day31 = inDays(owner, 31);
    assert.deepEqual(await ops.getTrash(store, day31), []);
    assert.equal(await refused(ops.restoreEvent(store, day31, { id: E1 })), 'not_found');
    assert.equal(store.state.trash.length, 1);

    // The next time anyone loads the data, it is removed, and a newer deletion is kept.
    await ops.deleteEvent(store, inDays(owner, 30.5), { id: E2 });
    await ops.getAllData(store, day31);
    assert.deepEqual(
        store.state.trash.map((t) => t.event.id),
        [E2],
    );
    assert.equal((await ops.getTrash(store, day31)).map((t) => t.id).join(), E2);
});

test('roles: admins remove people from any event', async () => {
    const store = seed();
    store.state.roles.push({
        id: uuid(35),
        event: E2,
        email: 'someone@example.test',
        type: 'viewer',
        input: null,
    });

    // An editor can see the list of their event, but not change it.
    assert.equal(await refused(ops.deleteRole(store, editor, { id: uuid(33) })), 'denied');

    await ops.deleteRole(store, admin, { id: uuid(32) });
    await ops.deleteRole(store, admin, { id: uuid(35) });
    assert.deepEqual(
        store.state.roles.map((r) => r.id),
        [uuid(33)],
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

test('roles: admins manage roles, emails are validated and lowercased', async () => {
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

    // Admin and owner are not roles: admins are listed for the whole app, under Admins.
    assert.equal(await refused(add(admin, { type: 'admin' })), 'invalid');
    assert.equal(await refused(add(owner, { type: 'owner' })), 'invalid');

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

test("inputs: admins manage an event's list, and one in use stays", async () => {
    const store = seed();
    const addInput = (who, event, name) => ops.addInput(store, who, { event, name });

    // Editors and viewers cannot.
    assert.equal(await refused(addInput(editor, E1, 'Tamil')), 'denied');
    assert.equal(await refused(addInput(viewer, E1, 'Tamil')), 'denied');
    assert.equal(await refused(addInput(stranger, E1, 'Tamil')), 'not_found');

    const added = await addInput(admin, E1, '  Tamil  ');
    assert.equal(added.name, 'Tamil');
    assert.equal(added.event, E1);
    assert.equal(added.position, 3);
    // The first input of another event starts its own order.
    const other = await addInput(admin, E2, 'Tamil');
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

    const inUse = await failure(ops.deleteInput(store, admin, { id: ENGLISH }));
    assert.equal(inUse.code, 'conflict');
    assert.match(inUse.message, /still has destinations or shared people/);
    assert.equal(await refused(ops.deleteInput(store, editor, { id: added.id })), 'denied');
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
    assert.equal(await refused(reorder(admin, E2, [ENGLISH2])), 'conflict');
    await reorder(admin, E2, [other.id, ENGLISH2]);
    assert.equal(store.state.inputs.find((i) => i.id === other.id).position, 1);
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
        'addAdmin',
        'addEvent',
        'addInput',
        'addKey',
        'addRole',
        'compareEvent',
        'deleteEvent',
        'deleteInput',
        'deleteKey',
        'deleteRole',
        'editEvent',
        'editInput',
        'editKey',
        'editRole',
        'getAdmins',
        'getAllData',
        'getBunryuSettings',
        'getHistory',
        'getStatus',
        'getTrash',
        'removeAdmin',
        'reorderInputs',
        'restoreEvent',
        'restoreEventVersion',
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

test('admins: the owners are fixed, the rest are managed by any admin', async () => {
    const store = seed();
    const named = ['owner@example.test', 'Second@Example.test'];
    const asOwner = { ...owner, ownerEmails: named };
    const asAdmin = { ...admin, ownerEmails: named };
    const boss = { ...as('boss@example.test'), ownerEmails: named };

    // Only admins and owners see the list or change it.
    for (const who of [editor, viewer, stranger]) {
        assert.equal(await refused(ops.getAdmins(store, who)), 'denied');
        assert.equal(
            await refused(ops.addAdmin(store, who, { email: 'x@example.test' })),
            'denied',
        );
        assert.equal(await refused(ops.removeAdmin(store, who, { id: uuid(31) })), 'denied');
        assert.equal((await ops.getAllData(store, who)).canManageAdmins, false);
    }
    assert.equal((await ops.getAllData(store, admin)).canManageAdmins, true);
    assert.equal((await ops.getAllData(store, owner)).canManageAdmins, true);

    // The owners are listed (lowercase, once each) apart from the admins added in the app.
    assert.deepEqual(await ops.getAdmins(store, asAdmin), {
        owners: ['owner@example.test', 'second@example.test'],
        admins: [{ id: uuid(31), email: 'admin@example.test', addedBy: 'owner@example.test' }],
    });

    // An admin adds someone, who then has every event, with no role in any of them.
    assert.equal(await refused(ops.addAdmin(store, asAdmin, { email: 'nope' })), 'invalid');
    assert.equal(await refused(ops.addAdmin(store, asAdmin, {})), 'invalid');
    const added = await ops.addAdmin(store, asAdmin, { email: '  Boss@Example.test ' });
    assert.equal(added.email, 'boss@example.test');
    assert.equal(added.addedBy, 'admin@example.test');
    assert.ok(added.id);
    const asBoss = await ops.getAllData(store, boss);
    assert.equal(asBoss.canManageAdmins, true);
    assert.equal(asBoss.canCreateEvents, true);
    assert.deepEqual(asBoss.events.map((e) => e.id).sort(), [E1, E2].sort());
    // Not an owner: no technical status, no bunryu settings.
    assert.equal(asBoss.events[0].can.seeTechnicalStatus, false);
    assert.equal(
        await refused(ops.getBunryuSettings(store, { ...boss, secret: 's', ingestUrl: 'u' })),
        'denied',
    );

    // Not twice, and not someone who is already an owner.
    assert.equal(
        await refused(ops.addAdmin(store, asOwner, { email: 'BOSS@example.test' })),
        'conflict',
    );
    assert.equal(
        await refused(ops.addAdmin(store, asOwner, { email: 'admin@example.test' })),
        'conflict',
    );
    assert.equal(
        await refused(ops.addAdmin(store, asOwner, { email: 'second@example.test' })),
        'conflict',
    );

    // Admins add and remove each other, but not themselves.
    const third = await ops.addAdmin(store, boss, { email: 'third@example.test' });
    assert.equal(third.addedBy, 'boss@example.test');
    assert.equal(await refused(ops.removeAdmin(store, boss, { id: added.id })), 'invalid');
    await ops.removeAdmin(store, boss, { id: third.id });
    assert.equal(await refused(ops.removeAdmin(store, boss, { id: third.id })), 'not_found');
    assert.equal(await refused(ops.removeAdmin(store, boss, {})), 'invalid');
    // Including the one who added them.
    await ops.removeAdmin(store, boss, { id: uuid(31) });
    assert.deepEqual(
        (await ops.getAdmins(store, asOwner)).admins.map((a) => a.email),
        ['boss@example.test'],
    );

    // Nothing removes an owner: even a row that was added before the server listed them.
    store.state.admins.push({ id: uuid(60), email: 'second@example.test', addedBy: '' });
    assert.equal(await refused(ops.removeAdmin(store, asOwner, { id: uuid(60) })), 'denied');
    assert.deepEqual(
        (await ops.getAdmins(store, asOwner)).admins.map((a) => a.email),
        ['boss@example.test'],
    );

    await ops.removeAdmin(store, asOwner, { id: added.id });
    assert.equal(
        (await ops.getAllData(store, boss)).events.length,
        0,
        'no longer an admin, so no longer sees every event',
    );
});

// ===== History =====

const iso = (ms) => new Date(ms).toISOString();
const minutesLater = (minutes, ctx = admin) => ({ ...ctx, nowMs: NOW + minutes * 60_000 });
const NEW_KEY = { event: E1, name: 'New', input: HINDI, platform: 'yt', streamKey: 'abcd-9999' };

// A recorded change without its id and time, to compare in a few lines.
const brief = ({ id, at, ...change }) => change;
const recorded = (store) => store.state.changes.map(brief);

test('events, admins and the trash are recorded, with who did it and when', async () => {
    const store = seed();
    const created = await ops.addEvent(store, admin, { name: 'Event three' });
    await ops.editEvent(store, admin, { id: E1, name: 'Event one' }); // the same name: no change
    await ops.editEvent(store, minutesLater(1), { id: E1, name: 'First' });
    await ops.deleteEvent(store, minutesLater(2), { id: E2 });
    await ops.restoreEvent(store, minutesLater(3, owner), { id: E2 });
    const boss = await ops.addAdmin(store, admin, { email: 'boss@example.test' });
    await ops.removeAdmin(store, admin, { id: boss.id });

    const by = 'admin@example.test';
    const none = { batch: null, restoredTo: null };
    const holds = { id: E2, name: 'Event two', destinations: 1, inputs: 1 };
    const bossRow = { id: boss.id, email: 'boss@example.test', addedBy: by };
    assert.deepEqual(recorded(store), [
        {
            by,
            event: created.id,
            kind: 'event',
            rowId: created.id,
            action: 'added',
            before: null,
            after: { id: created.id, name: 'Event three' },
            ...none,
        },
        {
            by,
            event: E1,
            kind: 'event',
            rowId: E1,
            action: 'edited',
            before: { id: E1, name: 'Event one' },
            after: { id: E1, name: 'First' },
            ...none,
        },
        // A deleted event keeps its rows, so only how much it held is recorded.
        {
            by,
            event: E2,
            kind: 'event',
            rowId: E2,
            action: 'deleted',
            before: holds,
            after: null,
            ...none,
        },
        {
            by: 'owner@example.test',
            event: E2,
            kind: 'event',
            rowId: E2,
            action: 'restored',
            before: null,
            after: holds,
            ...none,
        },
        {
            by,
            event: null,
            kind: 'admin',
            rowId: boss.id,
            action: 'added',
            before: null,
            after: bossRow,
            ...none,
        },
        {
            by,
            event: null,
            kind: 'admin',
            rowId: boss.id,
            action: 'deleted',
            before: bossRow,
            after: null,
            ...none,
        },
    ]);
    assert.deepEqual(
        store.state.changes.map((c) => c.at),
        [0, 1, 2, 3, 0, 0].map((m) => iso(NOW + m * 60_000)),
    );
    assert.deepEqual(
        store.state.changes.map((c) => c.id),
        [1, 2, 3, 4, 5, 6],
    );
});

test('inputs are recorded, and reordering records only the inputs that moved', async () => {
    const store = seed();
    const tamil = await ops.addInput(store, admin, { event: E1, name: 'Tamil' });
    await ops.editInput(store, admin, { id: ENGLISH, name: 'English' }); // unchanged
    await ops.editInput(store, admin, { id: HINDI, name: 'Hindi 2' });
    // Hindi and Tamil swap places; English stays first.
    await ops.reorderInputs(store, admin, { event: E1, ids: [ENGLISH, tamil.id, HINDI] });
    await ops.reorderInputs(store, admin, { event: E1, ids: [ENGLISH, tamil.id, HINDI] }); // again
    await ops.deleteInput(store, admin, { id: tamil.id });

    const rows = recorded(store).map((c) => [
        c.action,
        c.before?.name,
        c.after?.name,
        c.before?.position,
        c.after?.position,
    ]);
    assert.deepEqual(rows, [
        ['added', undefined, 'Tamil', undefined, 3],
        ['edited', 'Hindi', 'Hindi 2', 2, 2],
        ['edited', 'Tamil', 'Tamil', 3, 2],
        ['edited', 'Hindi 2', 'Hindi 2', 2, 3],
        ['deleted', 'Tamil', undefined, 2, undefined],
    ]);
    assert.ok(recorded(store).every((c) => c.kind === 'input' && c.event === E1));
});

test('destinations are recorded, and an edit that changes nothing is not', async () => {
    const store = seed();
    const added = await ops.addKey(store, editor, { ...NEW_KEY, input: ENGLISH });
    const edited = await ops.editKey(store, minutesLater(1, editor), { ...added, name: 'Renamed' });
    // Saved again as it is: the "last edited" stamp moves, but there is nothing to restore.
    await ops.editKey(store, minutesLater(2, editor), { ...edited });
    await ops.deleteKey(store, admin, { id: added.id });

    const keyOf = ({ canChange, ...key }) => key;
    const log = (by, action, before, after) => ({
        by,
        event: E1,
        kind: 'key',
        rowId: added.id,
        action,
        before,
        after,
        batch: null,
        restoredTo: null,
    });
    const editor_ = 'editor@example.test';
    assert.deepEqual(recorded(store), [
        log(editor_, 'added', null, keyOf(added)),
        log(editor_, 'edited', keyOf(added), keyOf(edited)),
        // The row as it was just before it was deleted: the second save stamped it.
        log('admin@example.test', 'deleted', store.state.changes[2].before, null),
    ]);
    assert.equal(store.state.changes[2].before.name, 'Renamed');
    // The stream key is recorded as it was: this is what a version is made from.
    assert.equal(store.state.changes[0].after.streamKey, 'abcd-9999');
});

test('people are recorded', async () => {
    const store = seed();
    const role = await ops.addRole(store, admin, {
        event: E1,
        email: 'new@example.test',
        type: 'viewer',
        input: null,
    });
    const same = { id: role.id, email: 'new@example.test', type: 'viewer', input: null };
    await ops.editRole(store, admin, same); // unchanged
    await ops.editRole(store, admin, { ...same, type: 'editor', input: HINDI });
    await ops.deleteRole(store, admin, { id: role.id });

    const stored = { id: role.id, event: E1, email: 'new@example.test' };
    const viewerRow = { ...stored, type: 'viewer', input: null };
    const editorRow = { ...stored, type: 'editor', input: HINDI };
    assert.deepEqual(
        recorded(store).map((c) => [c.kind, c.event, c.action, c.before, c.after]),
        [
            ['role', E1, 'added', null, viewerRow],
            ['role', E1, 'edited', viewerRow, editorRow],
            ['role', E1, 'deleted', editorRow, null],
        ],
    );
});

test('a change that fails records nothing, and a failed record does not fail the change', async () => {
    const store = seed();
    assert.equal(await refused(ops.deleteKey(store, editor, { id: K2 })), 'denied');
    assert.equal(
        await refused(ops.editEvent(store, admin, { id: uuid(404), name: 'x' })),
        'not_found',
    );
    assert.deepEqual(store.state.changes, []);

    store.recordChanges = async () => {
        throw new Error('disk full');
    };
    const logged = [];
    const log = console.error;
    console.error = (...args) => logged.push(args);
    try {
        assert.deepEqual(await ops.editEvent(store, admin, { id: E1, name: 'Renamed' }), {
            id: E1,
            name: 'Renamed',
        });
    } finally {
        console.error = log;
    }
    assert.equal(store.state.events.find((e) => e.id === E1).name, 'Renamed');
    assert.equal(logged.length, 1);
});

test('only admins read the history, compare an event or restore a version', async () => {
    const store = seed();
    await ops.editEvent(store, admin, { id: E1, name: 'First' });

    for (const who of [owner, admin]) {
        assert.equal((await ops.getAllData(store, who)).canSeeHistory, true);
        assert.equal((await ops.getHistory(store, who, {})).length, 1);
        const compared = await ops.compareEvent(store, who, { event: E1, atChange: 0 });
        assert.equal(compared.then.event.name, 'Event one');
    }
    for (const who of [editor, viewer, stranger]) {
        const here = { event: E1, atChange: 0 };
        assert.equal((await ops.getAllData(store, who)).canSeeHistory, false);
        assert.equal(await refused(ops.getHistory(store, who, {})), 'denied');
        assert.equal(await refused(ops.compareEvent(store, who, here)), 'denied');
        assert.equal(await refused(ops.restoreEventVersion(store, who, here)), 'denied');
    }
    assert.equal(store.state.events.find((e) => e.id === E1).name, 'First');
});

test('the history lists changes newest first, with names, in pages, and only those still kept', async () => {
    const store = seed();
    await ops.editEvent(store, admin, { id: E1, name: 'First' });
    await ops.editKey(store, minutesLater(1), { ...key(K1, E1, ENGLISH), name: 'Renamed' });
    await ops.addAdmin(store, minutesLater(2), { email: 'boss@example.test' });
    await ops.editEvent(store, minutesLater(3), { id: E2, name: 'Second' });
    const ids = async (input) => (await ops.getHistory(store, admin, input)).map((c) => c.id);

    const all = await ops.getHistory(store, admin, {});
    assert.deepEqual(
        all.map((c) => c.id),
        [4, 3, 2, 1],
    );
    assert.deepEqual(
        all.map((c) => [c.eventName, c.rowName]),
        [
            ['Second', 'Second'],
            ['', 'boss@example.test'],
            ['First', 'Renamed'],
            ['First', 'First'],
        ],
    );

    // Pages: `before` is the smallest id already shown.
    assert.deepEqual(await ids({ limit: 2 }), [4, 3]);
    assert.deepEqual(await ids({ before: 3, limit: 2 }), [2, 1]);
    // One event, or only the admins.
    assert.deepEqual(await ids({ event: E1 }), [2, 1]);
    assert.deepEqual(await ids({ kind: 'admin' }), [3]);
    assert.equal(await refused(ops.getHistory(store, admin, { kind: 'nope' })), 'invalid');
    assert.equal(await refused(ops.getHistory(store, admin, { before: 0 })), 'invalid');
    assert.equal(await refused(ops.getHistory(store, admin, { limit: 'many' })), 'invalid');

    // A deleted event is still named, from the trash.
    await ops.deleteEvent(store, minutesLater(4), { id: E1 });
    assert.equal((await ops.getHistory(store, admin, { event: E1 }))[0].eventName, 'First');

    // Nothing older than 30 days is shown, even before it is removed.
    store.state.changes[0].at = iso(NOW - 31 * DAY);
    assert.ok(!(await ids({})).includes(1));
});

test('changes are kept 30 days, then removed with the trash', async () => {
    const store = seed();
    await ops.editEvent(store, admin, { id: E1, name: 'First' });
    await ops.editEvent(store, inDays(admin, 20), { id: E1, name: 'Second' });

    await ops.getAllData(store, inDays(admin, 29));
    assert.equal(store.state.changes.length, 2);
    await ops.getAllData(store, inDays(admin, 31));
    assert.deepEqual(
        store.state.changes.map((c) => c.after.name),
        ['Second'],
    );
});

test('compare shows an event as it was right after a change, and how it differs from now', async () => {
    const store = seed();
    await ops.editEvent(store, admin, { id: E1, name: 'First' }); // 1
    await ops.deleteKey(store, admin, { id: K1 }); // 2
    const added = await ops.addKey(store, admin, NEW_KEY); // 3
    await ops.editEvent(store, admin, { id: E2, name: 'Second' }); // 4: another event
    // An event deleted and brought back is the same event, and its versions still work.
    await ops.deleteEvent(store, admin, { id: E1 }); // 5
    await ops.restoreEvent(store, admin, { id: E1 }); // 6

    const compare = (atChange, event = E1) => ops.compareEvent(store, admin, { event, atChange });
    const summary = (diff) => diff.map((d) => `${d.kind} ${d.status} ${d.fields}`).sort();

    const start = await compare(0);
    assert.equal(start.then.event.name, 'Event one');
    assert.deepEqual(start.then.keys.map((k) => k.id).sort(), [K1, K2]);
    assert.deepEqual(summary(start.diff), ['event changed name', 'key added ', 'key deleted ']);
    assert.deepEqual(start.diff.map((d) => d.rowId).sort(), [E1, K1, added.id].sort());

    const afterDelete = await compare(2);
    assert.equal(afterDelete.then.event.name, 'First');
    assert.deepEqual(
        afterDelete.then.keys.map((k) => k.id),
        [K2],
    );
    assert.deepEqual(summary(afterDelete.diff), ['key added ']);

    // The version after the newest change of this event is the event as it is.
    assert.deepEqual((await compare(6)).diff, []);
    assert.deepEqual((await compare(3)).diff, []);

    // Not another event's change, not one that does not exist, and not nonsense.
    assert.equal(await refused(compare(4)), 'invalid');
    assert.equal(await refused(compare(999)), 'invalid');
    assert.equal(await refused(compare(-1)), 'invalid');
    assert.equal(await refused(compare('x')), 'invalid');
    assert.equal(await refused(ops.compareEvent(store, admin, { event: E1 })), 'invalid');
    assert.equal(await refused(compare(0, uuid(404))), 'not_found');

    // Nothing older than 30 days.
    store.state.changes[0].at = iso(NOW - 31 * DAY);
    assert.equal(await refused(compare(1)), 'invalid');
});

test('an event in the trash is compared and restored only once it is back', async () => {
    const store = seed();
    await ops.editEvent(store, admin, { id: E1, name: 'First' });
    await ops.deleteEvent(store, admin, { id: E1 });

    for (const run of [ops.compareEvent, ops.restoreEventVersion]) {
        const error = await failure(run(store, admin, { event: E1, atChange: 0 }));
        assert.equal(error.code, 'invalid');
        assert.equal(error.message, 'Bring the event back first.');
    }
    await ops.restoreEvent(store, admin, { id: E1 });
    const compared = await ops.compareEvent(store, admin, { event: E1, atChange: 0 });
    assert.equal(compared.then.event.name, 'Event one');
});

// What an event holds, without who last edited a destination.
function held(store, event) {
    const own = (rows) =>
        rows.filter((r) => r.event === event).sort((a, b) => a.id.localeCompare(b.id));
    return structuredClone({
        event: store.state.events.find((e) => e.id === event),
        inputs: own(store.state.inputs),
        keys: own(store.state.keys).map(({ updatedBy, updatedAction, updatedAt, ...rest }) => rest),
        roles: own(store.state.roles),
    });
}

// A lot has happened to Event one since the seed: a rename, an input added and one renamed,
// destinations added, edited and deleted, a person removed and one added.
async function messAbout(store, ctx = admin) {
    await ops.editEvent(store, ctx, { id: E1, name: 'First' }); // 1
    const tamil = await ops.addInput(store, ctx, { event: E1, name: 'Tamil' }); // 2
    await ops.editInput(store, ctx, { id: HINDI, name: 'Hindi 2' }); // 3
    await ops.reorderInputs(store, ctx, { event: E1, ids: [tamil.id, HINDI, ENGLISH] }); // 4-6
    await ops.deleteKey(store, ctx, { id: K1 });
    await ops.editKey(store, ctx, { ...key(K2, E1, tamil.id), name: 'Moved' });
    await ops.addKey(store, ctx, { ...NEW_KEY, input: tamil.id });
    await ops.deleteRole(store, ctx, { id: uuid(33) });
    const person = { event: E1, email: 'new@example.test', type: 'viewer', input: tamil.id };
    await ops.addRole(store, ctx, person);
}

test('restoring a version makes the event equal to it, and no other event is touched', async () => {
    const store = seed();
    const first = held(store, E1);
    const other = held(store, E2);
    await messAbout(store);
    assert.notDeepEqual(held(store, E1), first);

    const ctx = minutesLater(30);
    const result = await ops.restoreEventVersion(store, ctx, { event: E1, atChange: 0 });
    assert.ok(result.changed > 0);

    assert.deepEqual(held(store, E1), first);
    assert.deepEqual(held(store, E2), other);
    // The destination that was deleted is back under its own id, and the one added is gone.
    assert.ok(store.state.keys.some((k) => k.id === K1));
    assert.ok(!store.state.keys.some((k) => k.name === 'New'));
    // Whoever restored it is the one who last edited what came back.
    const back = store.state.keys.find((k) => k.id === K1);
    assert.deepEqual(
        [back.updatedBy, back.updatedAction, back.updatedAt],
        ['admin@example.test', 'added', iso(NOW + 30 * 60_000)],
    );
});

test('restoring to the middle of the timeline keeps what was done before it', async () => {
    const store = seed();
    await messAbout(store);
    // Right after the second change: renamed and with Tamil added, nothing deleted yet.
    const there = { event: E1, atChange: 2 };
    const { then } = await ops.compareEvent(store, admin, there);
    await ops.restoreEventVersion(store, minutesLater(5), there);

    const now = held(store, E1);
    assert.equal(now.event.name, 'First');
    assert.deepEqual(
        now.inputs,
        [...then.inputs].sort((a, b) => a.id.localeCompare(b.id)),
    );
    assert.deepEqual(now.keys.map((k) => k.id).sort(), [K1, K2]);
});

test('a restore is one entry that can be undone by restoring the version before it', async () => {
    const store = seed();
    await messAbout(store);
    const beforeRestore = held(store, E1);
    const lastBefore = store.state.changes.at(-1).id;

    const ctx = minutesLater(30);
    const { changed } = await ops.restoreEventVersion(store, ctx, { event: E1, atChange: 0 });

    const batch = store.state.changes.filter((c) => c.batch);
    assert.equal(batch.length, changed);
    assert.equal(new Set(batch.map((c) => c.batch)).size, 1);
    assert.ok(batch.every((c) => c.restoredTo === 0 && c.by === 'admin@example.test'));
    assert.ok(batch.every((c) => c.event === E1 && c.id > lastBefore));
    const newest = await ops.getHistory(store, admin, { event: E1, limit: changed });
    assert.deepEqual(
        newest.map((c) => c.batch),
        batch.map((c) => c.batch),
    );

    // Nothing is left to restore now.
    const latest = { event: E1, atChange: store.state.changes.at(-1).id };
    assert.deepEqual(await ops.restoreEventVersion(store, admin, latest), { changed: 0 });
    assert.equal(store.state.changes.length, lastBefore + changed);

    // The version before the restore is the event as it was before it, so this undoes it.
    await ops.restoreEventVersion(store, minutesLater(40), { event: E1, atChange: lastBefore });
    assert.deepEqual(held(store, E1), beforeRestore);
});

test('a restore can swap two inputs’ names', async () => {
    const store = seed();
    await ops.editInput(store, admin, { id: ENGLISH, name: 'Temp' });
    await ops.editInput(store, admin, { id: HINDI, name: 'English' });
    await ops.editInput(store, admin, { id: ENGLISH, name: 'Hindi' });

    await ops.restoreEventVersion(store, admin, { event: E1, atChange: 0 });
    assert.deepEqual(
        store.state.inputs.filter((i) => i.event === E1).map((i) => [i.id, i.name]),
        [
            [ENGLISH, 'English'],
            [HINDI, 'Hindi'],
        ],
    );
});

test('a restore that would put in something invalid is refused with the reasons, and changes nothing', async () => {
    const store = seed();
    await ops.deleteKey(store, admin, { id: K1 });
    await ops.editEvent(store, admin, { id: E1, name: 'First' });
    const deleted = store.state.changes.find((c) => c.kind === 'key');
    const here = { event: E1, atChange: 0 };

    // The rules have changed since: this destination's platform is not allowed any more.
    deleted.before.platform = 'tiktok';
    const before = structuredClone(store.state);
    const error = await failure(ops.restoreEventVersion(store, admin, here));
    assert.equal(error.code, 'invalid');
    assert.match(error.message, /cannot be restored/);
    assert.match(error.message, /• The destination "Key 21": /);
    assert.deepEqual(store.state, before);

    // Another rule is the same: nothing is half done.
    deleted.before.platform = 'yt';
    deleted.before.streamKey = 'abcd-22'; // the address of K2, which is still there
    const clash = await failure(ops.restoreEventVersion(store, admin, here));
    assert.match(clash.message, /already added in this event/);
    assert.equal(store.state.events.find((e) => e.id === E1).name, 'First');
    assert.ok(!store.state.keys.some((k) => k.id === K1));
});

test('an event is not restored to before it existed', async () => {
    const store = seed();
    const created = await ops.addEvent(store, admin, { name: 'Event three' }); // 1
    await ops.addInput(store, admin, { event: created.id, name: 'English' }); // 2
    const at = (atChange) => ({ event: created.id, atChange });
    const inputsOfNew = () => store.state.inputs.filter((i) => i.event === created.id);

    const error = await failure(ops.restoreEventVersion(store, admin, at(0)));
    assert.equal(error.code, 'conflict');
    assert.match(error.message, /did not exist yet/);
    assert.equal(inputsOfNew().length, 1);
    // It can still be compared, and restored to any point after it was added.
    assert.equal((await ops.compareEvent(store, admin, at(0))).then.inputs.length, 0);
    assert.deepEqual(await ops.restoreEventVersion(store, admin, at(1)), { changed: 1 });
    assert.equal(inputsOfNew().length, 0);
});

test('a restore that cannot be applied changes nothing', async () => {
    const store = seed();
    await ops.deleteKey(store, admin, { id: K1 });
    const before = structuredClone(store.state);
    store.applyEventVersion = async () => {
        throw new Error('deadlock');
    };
    const log = console.error;
    console.error = () => {};
    try {
        const run = ops.restoreEventVersion(store, admin, { event: E1, atChange: 0 });
        assert.equal(await refused(run), 'conflict');
    } finally {
        console.error = log;
    }
    assert.deepEqual(store.state, before);
});
