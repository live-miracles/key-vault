import assert from 'node:assert/strict';
import test from 'node:test';

import { loadFrontendScripts } from './frontend-harness.mjs';

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function loadLanguages() {
    const runtime = loadFrontendScripts([
        'frontend/utils.js',
        'frontend/access.js',
        'frontend/languages.js',
    ]);
    runtime.set('eventRoles', {});
    runtime.set('config', {
        languages: [
            { id: '2', name: 'German', order: '2' },
            { id: 'L1', name: 'English', order: '1' },
            { id: 'bad', name: 'Broken', order: '3' },
            { id: 'L3', name: '', order: '4' },
        ],
    });
    return runtime;
}

test('normalizes and validates language identifiers', () => {
    const runtime = loadLanguages();
    const normalizeLanguageId = runtime.get('normalizeLanguageId');
    const isValidLanguageId = runtime.get('isValidLanguageId');

    assert.equal(normalizeLanguageId('1'), 'L1');
    assert.equal(normalizeLanguageId('lang9'), 'L9');
    assert.equal(normalizeLanguageId('L12'), 'L12');
    assert.equal(normalizeLanguageId('*'), '*');
    assert.equal(isValidLanguageId('L00'), false);
    assert.equal(isValidLanguageId('L100'), true);
});

test('returns clean, ordered languages and resolves labels', () => {
    const runtime = loadLanguages();

    assert.deepEqual(plain(runtime.get('getLanguages')()), [
        { id: 'L1', name: 'English', order: '1' },
        { id: 'L2', name: 'German', order: '2' },
    ]);
    assert.equal(runtime.get('getLanguageName')('2'), 'German');
    assert.equal(runtime.get('getLanguageName')('*'), '* (All)');
    assert.equal(runtime.get('hasMissingLanguage')('L9'), true);
});

test('finds the next available language id', () => {
    const runtime = loadLanguages();

    assert.equal(runtime.get('getNextLanguageId')(), 'L3');

    runtime.set('config', {
        languages: Array.from({ length: 100 }, (_, index) => ({
            id: `L${index + 1}`,
            name: `Language ${index + 1}`,
            order: String(index + 1),
        })),
    });

    assert.equal(runtime.get('getNextLanguageId')(), 'L101');
});
