import assert from 'node:assert/strict';
import test from 'node:test';

import { loadFrontendScripts } from './frontend-harness.mjs';

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function loadInputs() {
    const runtime = loadFrontendScripts([
        'frontend/src/utils.ts',
        'frontend/src/access.ts',
        'frontend/src/inputs.ts',
    ]);
    runtime.set('eventRoles', {});
    runtime.set('config', {
        inputs: [
            { id: 'L2', event: 'E1', name: 'German', order: '2' },
            { id: 'L1', event: 'E1', name: 'English', order: '1' },
            { id: '', event: 'E1', name: 'No id', order: '3' },
            { id: 'L3', event: 'E1', name: '', order: '4' },
            { id: 'L4', event: 'E2', name: 'Tamil', order: '1' },
        ],
    });
    return runtime;
}

test('returns clean, ordered inputs and resolves labels', () => {
    const runtime = loadInputs();

    assert.deepEqual(plain(runtime.get('getInputs')('E1')), [
        { id: 'L1', event: 'E1', name: 'English', order: '1' },
        { id: 'L2', event: 'E1', name: 'German', order: '2' },
    ]);
    // Another event has its own list.
    assert.deepEqual(
        plain(runtime.get('getInputs')('E2')).map((i) => i.id),
        ['L4'],
    );
    assert.deepEqual(plain(runtime.get('getInputs')('E3')), []);
    assert.equal(runtime.get('getInputName')('L2'), 'German');
    assert.equal(runtime.get('getInputName')('*'), '* (All)');
    assert.equal(runtime.get('hasMissingInput')('L9'), true);
});
