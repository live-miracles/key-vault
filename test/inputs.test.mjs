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
            { id: 'L2', name: 'German', order: '2' },
            { id: 'L1', name: 'English', order: '1' },
            { id: '', name: 'No id', order: '3' },
            { id: 'L3', name: '', order: '4' },
        ],
    });
    return runtime;
}

test('returns clean, ordered inputs and resolves labels', () => {
    const runtime = loadInputs();

    assert.deepEqual(plain(runtime.get('getInputs')()), [
        { id: 'L1', name: 'English', order: '1' },
        { id: 'L2', name: 'German', order: '2' },
    ]);
    assert.equal(runtime.get('getInputName')('L2'), 'German');
    assert.equal(runtime.get('getInputName')('*'), '* (All)');
    assert.equal(runtime.get('hasMissingInput')('L9'), true);
});
