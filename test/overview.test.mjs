import assert from 'node:assert/strict';
import test from 'node:test';

import { loadFrontendScripts } from './frontend-harness.mjs';

const runtime = loadFrontendScripts([
    'frontend/src/utils.ts',
    'frontend/src/keys.ts',
    'frontend/src/languages.ts',
    'frontend/src/overview.ts',
]);
const summarizeKeyStatuses = runtime.get('summarizeKeyStatuses');
const groupKeysByLanguage = runtime.get('groupKeysByLanguage');
const resolveLanguageFilter = runtime.get('resolveLanguageFilter');

runtime.set('config', {
    languages: [
        { id: 'L1', name: 'English', order: 1 },
        { id: 'L2', name: 'Hindi', order: 2 },
        { id: 'L3', name: 'Tamil', order: 3 },
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

test("groups an event's keys by language in the order of the Languages list", () => {
    const keys = [
        { id: 'K1', language: 'L3' },
        { id: 'K2', language: 'L1' },
        { id: 'K3', language: 'L3' },
    ];
    const groups = groupKeysByLanguage(keys);
    assert.deepEqual(
        JSON.parse(JSON.stringify(groups.map((g) => [g.language, g.keys.map((k) => k.id)]))),
        [
            ['L1', ['K2']],
            ['L3', ['K1', 'K3']],
        ],
    );
});

test('a language filter only holds when the event has keys in that language', () => {
    const keys = [{ id: 'K1', language: 'L1' }];
    assert.equal(resolveLanguageFilter(keys, 'L1'), 'L1');
    assert.equal(resolveLanguageFilter(keys, 'L2'), '');
    assert.equal(resolveLanguageFilter(keys, null), '');
});
