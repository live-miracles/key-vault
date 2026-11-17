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

test('an input is always chosen: the wanted one, else the preferred, else the first', () => {
    const ids = ['L1', 'L2'];
    assert.equal(resolveInputFilter(ids, 'L2'), 'L2');
    assert.equal(resolveInputFilter(ids, 'L3'), 'L1');
    assert.equal(resolveInputFilter(ids, null), 'L1');
    assert.equal(resolveInputFilter(ids, null, 'L2'), 'L2');
    assert.equal(resolveInputFilter(ids, 'L1', 'L2'), 'L1');
    assert.equal(resolveInputFilter(ids, null, 'L9'), 'L1');
    // An event with no inputs has nothing to choose.
    assert.equal(resolveInputFilter([], 'L1'), '');
});

test('the first input with a problem is preferred, errors before warnings', () => {
    const firstInputWithProblem = runtime.get('firstInputWithProblem');
    const keys = [
        { id: 'K1', input: 'L1' },
        { id: 'K2', input: 'L2' },
        { id: 'K3', input: 'L3' },
    ];
    const ids = ['L1', 'L2', 'L3'];
    const running = { main: state('running'), backup: null };
    // Nothing wrong: no preference.
    assert.equal(firstInputWithProblem(ids, keys, report({ K1: running, K2: running })), '');
    // A warning is a problem, but an error anywhere comes first.
    assert.equal(
        firstInputWithProblem(
            ids,
            keys,
            report({ K1: running, K2: { main: state('warning'), backup: null } }),
        ),
        'L2',
    );
    assert.equal(
        firstInputWithProblem(
            ids,
            keys,
            report({
                K1: { main: state('warning'), backup: null },
                K3: { main: state('error'), backup: null },
            }),
        ),
        'L3',
    );
});

test('the event strip counts inputs and destinations by state', () => {
    const els = { classes: new Set(), html: '' };
    runtime.set('document', {
        querySelector: () => ({
            classList: {
                toggle: (name, on) => (on ? els.classes.add(name) : els.classes.delete(name)),
            },
            set innerHTML(value) {
                els.html = value;
            },
        }),
    });
    runtime.set('keyStatus', {
        online: true,
        instances: [],
        inputs: { L1: state('running'), L2: state('error'), L3: state('stopped') },
        keys: { K1: { main: state('running'), backup: null } },
    });
    runtime.get('renderEventSummary')(['L1', 'L2', 'L3'], [{ id: 'K1' }, { id: 'K2' }]);
    assert.equal(els.classes.has('hidden'), false);
    assert.match(els.html, />Inputs<\/span><span class="summary-total">3</);
    assert.match(els.html, /status-error">1 Not arriving</);
    assert.match(els.html, /status-running">1 Receiving</);
    assert.match(els.html, /status-stopped">1 Idle</);
    assert.match(els.html, /status-running">1 Live</);
    // An event with no inputs shows no strip.
    runtime.get('renderEventSummary')([], []);
    assert.equal(els.classes.has('hidden'), true);
});
