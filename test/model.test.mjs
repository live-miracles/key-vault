import assert from 'node:assert/strict';
import test from 'node:test';

import { compareRoles } from '../frontend/src/roles.ts';
import { eventKeysOf, hasMissingInput, inputName, inputsOf } from '../frontend/src/model.ts';
import {
    listEventInputs,
    resolveInputFilter,
    summarizeKeyStatuses,
} from '../frontend/src/overview.ts';

const data = {
    inputs: [
        { id: 'L2', event: 'E1', name: 'German', position: 2 },
        { id: 'L1', event: 'E1', name: 'English', position: 1 },
        { id: '', event: 'E1', name: 'No id', position: 3 },
        { id: 'L3', event: 'E1', name: '', position: 4 },
        { id: 'L4', event: 'E2', name: 'Tamil', position: 1 },
        { id: 'L5', event: 'E2', name: 'English', position: 2 },
    ],
    keys: [
        { id: 'K1', event: 'E1', input: 'L2', name: 'b' },
        { id: 'K2', event: 'E1', input: 'L1', name: 'a' },
        { id: 'K3', event: 'E2', input: 'L5', name: 'c' },
    ],
};

test('returns clean, ordered inputs and resolves labels', () => {
    assert.deepEqual(
        inputsOf(data, 'E1').map((i) => i.id),
        ['L1', 'L2'],
    );
    // Another event has its own list.
    assert.deepEqual(
        inputsOf(data, 'E2').map((i) => i.id),
        ['L4', 'L5'],
    );
    assert.deepEqual(inputsOf(data, 'E3'), []);
    assert.equal(inputName(data, 'L2'), 'German');
    assert.equal(inputName(data, 'L9'), 'L9');
    assert.equal(hasMissingInput(data, 'L9'), true);
    assert.equal(hasMissingInput(data, 'L1'), false);
});

test('the destinations of an event come grouped by its input order', () => {
    assert.deepEqual(
        eventKeysOf(data, 'E1').map((k) => k.id),
        ['K2', 'K1'],
    );
    assert.deepEqual(eventKeysOf(data, 'E3'), []);
});

const state = (state) => ({ state, side: 'main', message: '', failures: 0 });
const report = (keys) => ({ online: true, instances: [], keys, inputs: {} });

test('counts destinations by the status the server decided', () => {
    const keys = [
        { id: 'K1' },
        { id: 'K2' },
        { id: 'K3' },
        { id: 'K4' },
        { id: 'K5' },
        { id: 'K6' },
    ];
    const summary = summarizeKeyStatuses(
        keys,
        report({
            K1: state('error'),
            K2: state('warning'),
            K3: state('stopped'),
            K4: state('running'),
            K5: state('not_configured'),
        }),
    );
    assert.deepEqual(summary, {
        total: 6,
        running: 1,
        warning: 1,
        error: 1,
        stopped: 1,
        unreported: 2,
    });
});

test('without a status report every destination is unreported', () => {
    const summary = summarizeKeyStatuses([{ id: 'K1' }, { id: 'K2' }], undefined);
    assert.equal(summary.total, 2);
    assert.equal(summary.unreported, 2);
});

test("the list holds the event's own inputs in its order, even those with no destination yet", () => {
    assert.deepEqual(listEventInputs(data, 'E1', []), ['L1', 'L2']);
    // Each event has its own order: here Tamil comes first.
    assert.deepEqual(listEventInputs(data, 'E2', []), ['L4', 'L5']);
});

test('a destination pointing at an input the event does not have is still listed, last', () => {
    const keys = [{ input: 'L9' }, { input: 'L2' }];
    assert.deepEqual(listEventInputs(data, 'E1', keys), ['L1', 'L2', 'L9']);
});

test('the list opens on All unless the wanted input is in it', () => {
    const ids = ['L1', 'L2'];
    assert.equal(resolveInputFilter(ids, 'L2'), 'L2');
    assert.equal(resolveInputFilter(ids, null), 'all');
    assert.equal(resolveInputFilter(ids, 'all'), 'all');
    // An input that was deleted, or belongs to another event, falls back to All.
    assert.equal(resolveInputFilter(ids, 'L3'), 'all');
    // An event with no inputs has nothing to choose.
    assert.equal(resolveInputFilter([], 'L1'), '');
    assert.equal(resolveInputFilter([], null), '');
});

test('roles read editors first, and those who see every input before those limited to one', () => {
    const position = (id) => ({ L1: 1, L2: 2 })[id];
    const role = (email, type, input) => ({ email, type, input });
    const roles = [
        role('viewer-l1@example.test', 'viewer', 'L1'),
        role('editor-l2@example.test', 'editor', 'L2'),
        role('editor-l1@example.test', 'editor', 'L1'),
        role('viewer-all@example.test', 'viewer', null),
        role('editor-all@example.test', 'editor', null),
    ];
    const sorted = roles.sort((a, b) => compareRoles(a, b, position)).map((r) => r.email);
    assert.deepEqual(sorted, [
        'editor-all@example.test',
        'editor-l1@example.test',
        'editor-l2@example.test',
        'viewer-all@example.test',
        'viewer-l1@example.test',
    ]);
});
