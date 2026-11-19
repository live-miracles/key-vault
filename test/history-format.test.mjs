import assert from 'node:assert/strict';
import test from 'node:test';

import {
    describeChange,
    describeLine,
    describeOperation,
    describeRestoreEffect,
    foldOperations,
    groupByDay,
    groupOperations,
    summarizeDiff,
    who,
} from '../frontend/src/history-format.ts';
import { formatDay } from '../frontend/src/format.ts';
import { app } from '../frontend/src/app.ts';
import { changesHtml, deletedEventHtml } from '../frontend/src/history.ts';

const EVENT = '00000000-0000-4000-8000-000000000001';
const NOW = Date.parse('2026-11-19T12:00:00.000Z');
const at = (minutesAgo) => new Date(NOW - minutesAgo * 60_000).toISOString();

let id = 0;
const change = (minutesAgo, kind, action, before, after, extra = {}) => ({
    id: ++id,
    at: at(minutesAgo),
    by: 'ravi@example.org',
    event: EVENT,
    kind,
    rowId: (after ?? before).id ?? 'row',
    action,
    before,
    after,
    batch: null,
    restoredTo: null,
    eventName: 'Winter Retreat',
    rowName: String((after ?? before).name ?? (after ?? before).email ?? ''),
    restoredToAt: null,
    ...extra,
});
// The server sends the newest first.
const newestFirst = (...changes) => [...changes].sort((a, b) => b.id - a.id);

const key = (name, extra = {}) => ({
    id: name,
    name,
    streamKey: 'abcd-1111',
    link: '',
    remarks: '',
    ...extra,
});

test('the rows of one request are one operation, and its version is its last change', () => {
    id = 0;
    const list = newestFirst(
        change(30, 'key', 'added', null, key('A')),
        // A reorder moves two inputs in one request: same person, moment and event.
        change(
            20,
            'input',
            'edited',
            { id: 'i1', name: 'English', position: 1 },
            { id: 'i1', name: 'English', position: 2 },
        ),
        change(
            20,
            'input',
            'edited',
            { id: 'i2', name: 'Hindi', position: 2 },
            { id: 'i2', name: 'Hindi', position: 1 },
        ),
    );
    const operations = groupOperations(list);
    assert.deepEqual(
        operations.map((o) => [o.version, o.changes.length]),
        [
            [3, 2],
            [1, 1],
        ],
    );
    assert.deepEqual(
        operations[0].changes.map((c) => c.id),
        [2, 3],
        'oldest first, as they were made',
    );
    assert.equal(describeOperation(operations[0], false, NOW), 'reordered the inputs');
});

test('a restore is one operation by its batch, and says what it went back to', () => {
    id = 0;
    const batch = '00000000-0000-4000-8000-0000000000aa';
    const base = { batch, restoredTo: 4, restoredToAt: at(600) };
    const list = newestFirst(
        change(5, 'key', 'added', null, key('A'), base),
        change(5, 'input', 'deleted', { id: 'i1', name: 'English' }, null, base),
        change(
            5,
            'event',
            'edited',
            { id: EVENT, name: 'New' },
            { id: EVENT, name: 'Winter Retreat' },
            base,
        ),
    );
    const [operation, ...rest] = groupOperations(list);
    assert.equal(rest.length, 0);
    assert.equal(operation.restore, true);
    assert.equal(operation.version, 3);
    assert.match(describeOperation(operation, true, NOW), /^restored Winter Retreat to .+/);
    assert.notEqual(
        describeOperation(operation, true, NOW),
        'restored Winter Retreat to an earlier version',
    );

    const start = {
        ...operation,
        changes: operation.changes.map((c) => ({ ...c, restoredTo: 0, restoredToAt: null })),
    };
    assert.equal(
        describeOperation(start, true, NOW),
        'restored Winter Retreat to the start of history',
    );
    const gone = {
        ...operation,
        changes: operation.changes.map((c) => ({ ...c, restoredTo: 9, restoredToAt: null })),
    };
    assert.equal(
        describeOperation(gone, true, NOW),
        'restored Winter Retreat to an earlier version',
    );
});

test('changes by one person in one event within ten minutes fold into one line', () => {
    id = 0;
    const list = newestFirst(
        change(50, 'key', 'edited', key('A'), key('A', { remarks: 'x' })),
        change(30, 'key', 'edited', key('B'), key('B', { remarks: 'x' })),
        change(28, 'key', 'edited', key('C'), key('C', { remarks: 'x' })),
        change(24, 'key', 'edited', key('D'), key('D', { remarks: 'x' })),
        change(22, 'key', 'added', null, key('E'), { by: 'maya@example.org' }),
        change(21, 'key', 'edited', key('F'), key('F', { remarks: 'x' })),
        change(
            1,
            'event',
            'edited',
            { id: EVENT, name: 'Old' },
            { id: EVENT, name: 'New' },
            { event: null },
        ),
    );
    const lines = foldOperations(groupOperations(list));
    assert.deepEqual(
        lines.map((line) => line.operations.map((o) => o.version)),
        [
            [7], // not in an event: never folded
            [6], // ravi, after maya
            [5], // maya
            [4, 3, 2], // ravi: 24, 28 and 30 minutes ago, each within ten of the newest
            [1], // 50 minutes ago: too far from the others
        ],
    );
    const [, , , folded] = lines;
    assert.equal(describeLine(folded, true, NOW), 'changed 3 destinations in Winter Retreat');
    assert.equal(describeLine(folded, false, NOW), 'changed 3 destinations');
});

test('a restore is never folded into the changes beside it', () => {
    id = 0;
    const batch = '00000000-0000-4000-8000-0000000000bb';
    const list = newestFirst(
        change(10, 'key', 'edited', key('A'), key('A', { remarks: 'x' })),
        change(9, 'key', 'deleted', key('B'), null, { batch, restoredTo: 0 }),
        change(8, 'key', 'edited', key('C'), key('C', { remarks: 'x' })),
    );
    assert.equal(foldOperations(groupOperations(list)).length, 3);
});

test('each change is described in plain words, never with a stream key', () => {
    const text = (kind, action, before, after, extra) => {
        id = 100;
        return describeChange(change(1, kind, action, before, after, extra));
    };
    assert.equal(
        text('key', 'deleted', key('Instagram English'), null),
        'deleted “Instagram English”',
    );
    assert.equal(text('key', 'added', null, key('YouTube Hindi')), 'added “YouTube Hindi”');
    assert.equal(
        text(
            'key',
            'edited',
            key('YouTube Hindi'),
            key('YouTube Hindi', { streamKey: 'zzzz-9999' }),
        ),
        'changed the stream key of “YouTube Hindi”',
    );
    assert.equal(
        text(
            'key',
            'edited',
            key('YouTube Hindi'),
            key('YouTube Hindi', { streamKey: 'x', link: 'y', remarks: 'z' }),
        ),
        'changed the stream key, watch link and notes of “YouTube Hindi”',
    );
    assert.equal(
        text('key', 'edited', key('Old', { id: 'k' }), key('New', { id: 'k' })),
        'renamed “Old” to “New”',
    );
    assert.equal(
        text(
            'input',
            'edited',
            { id: 'i', name: 'Hindi', position: 2 },
            { id: 'i', name: 'Hindi 2', position: 2 },
        ),
        'renamed the input “Hindi” to “Hindi 2”',
    );
    assert.equal(
        text(
            'input',
            'edited',
            { id: 'i', name: 'Hindi', position: 2 },
            { id: 'i', name: 'Hindi', position: 1 },
        ),
        'moved the input “Hindi”',
    );
    assert.equal(
        text('input', 'added', null, { id: 'i', name: 'Tamil' }),
        'added the input “Tamil”',
    );
    assert.equal(
        text('event', 'edited', { id: EVENT, name: 'Old' }, { id: EVENT, name: 'New' }),
        'renamed the event “Old” to “New”',
    );
    assert.equal(
        text('event', 'deleted', { id: EVENT, name: 'Winter' }, null),
        'deleted the event “Winter”',
    );
    assert.equal(
        text('event', 'restored', null, { id: EVENT, name: 'Winter' }),
        'brought back the event “Winter”',
    );
    assert.equal(
        text('role', 'added', null, { id: 'r', email: 'a@example.org', type: 'editor' }),
        'gave a@example.org editor access',
    );
    assert.equal(
        text('role', 'deleted', { id: 'r', email: 'a@example.org', type: 'editor' }, null),
        "removed a@example.org's access",
    );
    assert.equal(
        text(
            'role',
            'edited',
            { id: 'r', email: 'a@example.org', type: 'viewer', input: null },
            { id: 'r', email: 'a@example.org', type: 'editor', input: null },
        ),
        "changed the role of a@example.org's access",
    );
    assert.equal(
        text('admin', 'added', null, { id: 'a', email: 'boss@example.org' }, { event: null }),
        'added boss@example.org as an admin',
    );
    // Even a change of nothing but the key never prints it.
    const secret = describeChange(
        change(
            1,
            'key',
            'edited',
            key('K', { streamKey: 'sekret-1' }),
            key('K', { streamKey: 'sekret-2' }),
        ),
    );
    assert.doesNotMatch(secret, /sekret/);
});

test('an operation names its event only where the list needs it', () => {
    id = 0;
    const [operation] = groupOperations([
        change(1, 'key', 'deleted', key('Instagram English'), null),
    ]);
    assert.equal(
        describeOperation(operation, true, NOW),
        'deleted “Instagram English” in Winter Retreat',
    );
    assert.equal(describeOperation(operation, false, NOW), 'deleted “Instagram English”');
    const [forgotten] = groupOperations([
        change(1, 'key', 'deleted', key('K'), null, { eventName: '' }),
    ]);
    assert.equal(describeOperation(forgotten, true, NOW), 'deleted “K” in a deleted event');
    assert.equal(who('ravi@example.org'), 'ravi');
    assert.equal(who('nobody'), 'nobody');
});

test('lines are grouped under a heading for each day', () => {
    const items = [at(10), at(60), at(60 * 26), at(60 * 27), at(60 * 24 * 5)].map((iso) => ({
        iso,
    }));
    const days = groupByDay(
        items,
        (item) => item.iso,
        (iso) => formatDay(iso, NOW),
    );
    assert.deepEqual(
        days.map((d) => [
            d.day === 'Today' || d.day === 'Yesterday' ? d.day : 'a date',
            d.items.length,
        ]),
        [
            ['Today', 2],
            ['Yesterday', 2],
            ['a date', 1],
        ],
    );
    assert.equal(formatDay('not a time', NOW), '');
});

test('what changed since, and what a restore would do, in words', () => {
    const row = (kind, status, fields = []) => ({
        kind,
        rowId: 'r',
        status,
        then: null,
        now: null,
        fields,
    });
    assert.equal(summarizeDiff([]), 'Same as it is now');
    assert.equal(
        summarizeDiff([
            row('key', 'added'),
            row('key', 'added'),
            row('key', 'deleted'),
            row('role', 'changed'),
            row('event', 'changed'),
        ]),
        '2 added, 1 deleted, 2 changed since',
    );
    assert.equal(describeRestoreEffect([]), 'Nothing will change.');
    assert.equal(
        describeRestoreEffect([
            row('key', 'added'),
            row('key', 'added'),
            row('key', 'deleted'),
            row('key', 'changed'),
            row('key', 'changed'),
            row('key', 'changed'),
        ]),
        'Destinations: 2 removed, 1 brought back and 3 changed.',
    );
    assert.equal(
        describeRestoreEffect([
            row('key', 'changed'),
            row('input', 'changed'),
            row('role', 'deleted'),
            row('event', 'changed'),
        ]),
        "Destinations: 1 changed; 1 input will change; 1 person's access will change; the event will be renamed.",
    );
    // Nothing but the name: the sentence still starts with a capital.
    assert.equal(describeRestoreEffect([row('event', 'changed')]), 'The event will be renamed.');
});

test('names in the lists are escaped, and a change in an event that is gone is not a link', () => {
    id = 0;
    const evil = '<img src=x onerror=alert(1)>';
    const list = [
        change(5, 'key', 'deleted', key(evil), null, { rowName: evil, eventName: evil }),
        change(4, 'key', 'deleted', key('B'), null, { event: 'gone', eventName: 'Gone' }),
    ];
    app.data.events = [{ id: EVENT, name: evil, can: {} }];
    const html = changesHtml([list[1], list[0]], true, NOW);
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /&lt;img/);
    // Only the change in the event that exists can be opened.
    assert.equal((html.match(/data-action="open-compare"/g) ?? []).length, 1);
    app.data.events = [];

    const deleted = deletedEventHtml(
        {
            id: EVENT,
            name: evil,
            deletedAt: at(60),
            deletedBy: 'a@example.org',
            destinations: 2,
            inputs: 1,
            expiresAt: new Date(NOW + 5 * 86_400_000).toISOString(),
        },
        NOW,
    );
    assert.doesNotMatch(deleted, /<img/);
    assert.match(deleted, /Bring back event/);
    assert.match(deleted, /2 destinations, 1 input/);
    assert.match(deleted, /5 days left/);
});
