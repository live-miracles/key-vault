import assert from 'node:assert/strict';
import test from 'node:test';

import {
    diffStates,
    existedAt,
    restoreSteps,
    stateAt,
    stepCount,
} from '../supabase/functions/_shared/history.ts';

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const EVENT = uuid(1);
const OTHER = uuid(2);
const A = uuid(11);
const B = uuid(12);
const K = uuid(21);
const R = uuid(31);

const input = (id, name, position) => ({ id, event: EVENT, name, position });
const key = (id, extra = {}) => ({
    id,
    event: EVENT,
    name: 'YouTube',
    input: A,
    platform: 'yt',
    streamKey: 'abcd-1111',
    backupPlatform: '',
    backupStreamKey: '',
    link: '',
    remarks: '',
    updatedBy: 'ann@example.test',
    updatedAction: 'added',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...extra,
});
const role = (id, email) => ({ id, event: EVENT, email, type: 'viewer', input: null });
const state = (extra = {}) => ({
    event: { id: EVENT, name: 'Event' },
    inputs: [],
    keys: [],
    ...extra,
});

let lastId = 0;
const change = (kind, action, before, after, extra = {}) => ({
    id: ++lastId,
    at: '2026-11-19T10:00:00.000Z',
    by: 'ann@example.test',
    event: EVENT,
    kind,
    rowId: (after ?? before).id,
    action,
    before,
    after,
    batch: null,
    restoredTo: null,
    ...extra,
});
const log = (...changes) => {
    lastId = 0;
    return changes.map((make) => make());
};

test('an added row is removed again, an edited one comes back as it was, a deleted one is put back', () => {
    for (const [kind, make, field, edited] of [
        ['input', (id) => input(id, 'Hindi', 1), 'name', 'Hindi 2'],
        ['key', (id) => key(id), 'name', 'Renamed'],
    ]) {
        const list = `${kind}s`;
        const row = make(K);
        const edit = { ...row, [field]: edited };

        // Added: it is there now, and was not then.
        const added = log(() => change(kind, 'added', null, row));
        assert.deepEqual(stateAt(state({ [list]: [row] }), added, 0)[list], []);
        assert.deepEqual(stateAt(state({ [list]: [row] }), added, 1)[list], [row]);

        // Edited: now it is the edit, then it was the row.
        const edits = log(() => change(kind, 'edited', row, edit));
        assert.deepEqual(stateAt(state({ [list]: [edit] }), edits, 0)[list], [row]);
        assert.deepEqual(stateAt(state({ [list]: [edit] }), edits, 1)[list], [edit]);

        // Deleted: it is gone now, and was there then.
        const deleted = log(() => change(kind, 'deleted', row, null));
        assert.deepEqual(stateAt(state(), deleted, 0)[list], [row]);
        assert.deepEqual(stateAt(state(), deleted, 1)[list], []);
    }
});

test('several changes to one row are undone newest first', () => {
    const v1 = key(K, { name: 'One' });
    const v2 = key(K, { name: 'Two' });
    const v3 = key(K, { name: 'Three' });
    const changes = log(
        () => change('key', 'added', null, v1),
        () => change('key', 'edited', v1, v2),
        () => change('key', 'edited', v2, v3),
        () => change('key', 'deleted', v3, null),
    );
    const names = (at) => stateAt(state(), changes, at).keys.map((k) => k.name);
    assert.deepEqual(names(4), []);
    assert.deepEqual(names(3), ['Three']);
    assert.deepEqual(names(2), ['Two']);
    assert.deepEqual(names(1), ['One']);
    assert.deepEqual(names(0), []);
});

test('an event is renamed back, and the order of its inputs comes back with it', () => {
    const changes = log(
        () => change('event', 'edited', { id: EVENT, name: 'Old' }, { id: EVENT, name: 'Event' }),
        // Reordering: A and B swap places.
        () => change('input', 'edited', input(A, 'English', 1), input(A, 'English', 2)),
        () => change('input', 'edited', input(B, 'Hindi', 2), input(B, 'Hindi', 1)),
    );
    const now = state({ inputs: [input(B, 'Hindi', 1), input(A, 'English', 2)] });

    const before = stateAt(now, changes, 0);
    assert.equal(before.event.name, 'Old');
    assert.deepEqual(
        before.inputs.map((i) => [i.name, i.position]),
        [
            ['English', 1],
            ['Hindi', 2],
        ],
    );
    assert.equal(stateAt(now, changes, 1).event.name, 'Event');
    // After all of them it is the order now: Hindi first.
    assert.deepEqual(
        stateAt(now, changes, 3).inputs.map((i) => i.name),
        ['Hindi', 'English'],
    );
});

test('only the changes of this event count: not other events, the admins, people, or the trash', () => {
    const changes = log(
        () => change('key', 'added', null, key(K)),
        // People's access is recorded, but is not part of a version.
        () => change('role', 'added', null, role(R, 'a@example.test')),
        () => change('key', 'added', null, key(uuid(22), { event: OTHER }), { event: OTHER }),
        () =>
            change(
                'admin',
                'added',
                null,
                { id: uuid(40), email: 'a@example.test' },
                { event: null },
            ),
        // Its rows stayed where they were, so these do not change them.
        () =>
            change(
                'event',
                'deleted',
                { id: EVENT, name: 'Event', destinations: 1, inputs: 0 },
                null,
            ),
        () =>
            change('event', 'restored', null, {
                id: EVENT,
                name: 'Event',
                destinations: 1,
                inputs: 0,
            }),
    );
    const now = state({ keys: [key(K)] });
    const then = stateAt(now, changes, 0);
    assert.deepEqual(then.keys, []);
    assert.equal(then.event.name, 'Event');
    assert.equal('roles' in then, false);
    // The trash entries are no version of their own that differs from the one before.
    assert.deepEqual(stateAt(now, changes, 1), now);
});

test('`now` is not changed, and `atChange: 0` is before the oldest change', () => {
    const now = state({ keys: [key(K)] });
    const copy = structuredClone(now);
    const changes = log(() => change('key', 'added', null, key(K)));
    stateAt(now, changes, 0);
    assert.deepEqual(now, copy);
    // Nothing recorded: the start of history is now.
    assert.deepEqual(stateAt(now, [], 0), now);
});

test('an event added after a point did not exist then', () => {
    const changes = log(
        () => change('event', 'added', null, { id: EVENT, name: 'Event' }),
        () => change('input', 'added', null, input(A, 'English', 1)),
    );
    assert.equal(existedAt(changes, EVENT, 0), false);
    assert.equal(existedAt(changes, EVENT, 1), true);
    assert.equal(existedAt(changes, OTHER, 0), true);
    // Its rows come out empty.
    assert.deepEqual(stateAt(state({ inputs: [input(A, 'English', 1)] }), changes, 0).inputs, []);
});

test('differences are matched by id, and say what changed', () => {
    const then = state({
        event: { id: EVENT, name: 'Old' },
        inputs: [input(A, 'English', 1), input(B, 'Hindi', 2)],
        keys: [key(K), key(uuid(22), { name: 'Gone' })],
    });
    const now = state({
        inputs: [input(A, 'English', 1), input(B, 'Hindi 2', 2), input(uuid(13), 'Tamil', 3)],
        keys: [key(K, { streamKey: 'zzzz-9999', remarks: 'note' }), key(uuid(23), { name: 'New' })],
    });
    assert.deepEqual(
        diffStates(then, now).map((d) => [d.kind, d.status, d.fields]),
        // The event, then inputs and destinations; in each, rows of the earlier version in its
        // order, then the ones added since.
        [
            ['event', 'changed', ['name']],
            ['input', 'changed', ['name']],
            ['input', 'added', []],
            ['key', 'changed', ['streamKey', 'remarks']],
            ['key', 'deleted', []],
            ['key', 'added', []],
        ],
    );
    const changed = diffStates(then, now).find((d) => d.kind === 'key' && d.status === 'changed');
    assert.equal(changed.then.streamKey, 'abcd-1111');
    assert.equal(changed.now.streamKey, 'zzzz-9999');
    assert.deepEqual(diffStates(then, then), []);
});

test('who last edited a destination, and when, is not a difference', () => {
    const then = state({ keys: [key(K)] });
    const now = state({
        keys: [
            key(K, {
                updatedBy: 'bob@example.test',
                updatedAction: 'edited',
                updatedAt: '2026-11-19T09:00:00.000Z',
            }),
        ],
    });
    assert.deepEqual(diffStates(then, now), []);
    assert.equal(stepCount(restoreSteps(then, now)), 0);
});

test('the steps back list only what differs, with the earlier rows to write and the later to delete', () => {
    const then = state({
        event: { id: EVENT, name: 'Old' },
        inputs: [input(A, 'English', 1)],
        keys: [key(K), key(uuid(22), { name: 'Gone' })],
    });
    const now = state({
        inputs: [input(A, 'English', 1), input(B, 'Hindi', 2)],
        keys: [key(K, { name: 'Renamed' }), key(uuid(23), { name: 'New', input: B })],
    });
    const steps = restoreSteps(then, now);
    assert.equal(steps.eventName, 'Old');
    assert.deepEqual(steps.upsertInputs, []);
    assert.deepEqual(steps.deleteInputs, [B]);
    assert.deepEqual(
        steps.upsertKeys.map((k) => [k.id, k.name]),
        [
            [K, 'YouTube'],
            [uuid(22), 'Gone'],
        ],
    );
    assert.deepEqual(steps.deleteKeys, [uuid(23)]);
    assert.equal('upsertRoles' in steps, false);
    assert.equal(stepCount(steps), 5);

    // An unchanged name is not rewritten.
    assert.equal(restoreSteps(now, now).eventName, null);
});

test('two inputs that swapped names are both written back', () => {
    const then = state({ inputs: [input(A, 'English', 1), input(B, 'Hindi', 2)] });
    const now = state({ inputs: [input(A, 'Hindi', 1), input(B, 'English', 2)] });
    const steps = restoreSteps(then, now);
    assert.deepEqual(
        steps.upsertInputs.map((i) => [i.id, i.name]),
        [
            [A, 'English'],
            [B, 'Hindi'],
        ],
    );
});
