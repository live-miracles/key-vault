import assert from 'node:assert/strict';
import test from 'node:test';

import { loadFrontendScripts } from './frontend-harness.mjs';

const plain = (value) => JSON.parse(JSON.stringify(value));

const runtime = loadFrontendScripts([
    'frontend/src/utils.ts',
    'frontend/src/keys.ts',
    'frontend/src/inputs.ts',
    'frontend/src/overview.ts',
]);
const summarizeKeyStatuses = runtime.get('summarizeKeyStatuses');
const resolveInputFilter = runtime.get('resolveInputFilter');
const listEventInputs = runtime.get('listEventInputs');

runtime.set('config', {
    inputs: [
        { id: 'L1', event: 'E1', name: 'English', order: 1 },
        { id: 'L2', event: 'E1', name: 'Hindi', order: 2 },
        { id: 'L3', event: 'E1', name: 'Tamil', order: 3 },
        { id: 'L4', event: 'E2', name: 'Tamil', order: 1 },
        { id: 'L5', event: 'E2', name: 'English', order: 2 },
    ],
});

const state = (status) => ({ status, message: '', failures: 0, stoppedAfterFailures: false });
const report = (keys) => ({ online: true, instances: [], keys });

test('counts keys by the worst of their main and backup status', () => {
    const keys = [{ id: 'K1' }, { id: 'K2' }, { id: 'K3' }, { id: 'K4' }, { id: 'K5' }];
    const summary = summarizeKeyStatuses(
        keys,
        report({
            K1: { main: state('running'), backup: state('error') },
            K2: { main: state('warning'), backup: null },
            K3: { main: state('stopped'), backup: null },
            K4: { main: state('running'), backup: null },
        }),
    );
    assert.deepEqual(JSON.parse(JSON.stringify(summary)), {
        total: 5,
        running: 1,
        warning: 1,
        error: 1,
        stopped: 1,
        unreported: 1,
    });
});

test('without a status report every key is unreported', () => {
    const summary = summarizeKeyStatuses([{ id: 'K1' }, { id: 'K2' }], undefined);
    assert.equal(summary.total, 2);
    assert.equal(summary.unreported, 2);
});

test("the list holds the event's own inputs in its order, even those with no stream yet", () => {
    assert.deepEqual(plain(listEventInputs('E1', [])), ['L1', 'L2', 'L3']);
    // Each event has its own order: here Tamil comes first.
    assert.deepEqual(plain(listEventInputs('E2', [])), ['L4', 'L5']);
});

test('a stream pointing at an input the event does not have is still listed, last', () => {
    const keys = [
        { id: 'K1', input: 'L9' },
        { id: 'K2', input: 'L2' },
    ];
    assert.deepEqual(plain(listEventInputs('E1', keys)), ['L1', 'L2', 'L3', 'L9']);
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
