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
            { id: 'L01', name: 'English', order: '1' },
            { id: 'bad', name: 'Broken', order: '3' },
            { id: 'L03', name: '', order: '4' },
        ],
    });
    return runtime;
}

test('normalizes and validates language identifiers', () => {
    const runtime = loadLanguages();
    const normalizeLanguageId = runtime.get('normalizeLanguageId');
    const isValidLanguageId = runtime.get('isValidLanguageId');

    assert.equal(normalizeLanguageId('1'), 'L01');
    assert.equal(normalizeLanguageId('lang9'), 'L09');
    assert.equal(normalizeLanguageId('L12'), 'L12');
    assert.equal(normalizeLanguageId('*'), '*');
    assert.equal(isValidLanguageId('L00'), false);
    assert.equal(isValidLanguageId('L99'), true);
});

test('returns clean, ordered languages and resolves labels', () => {
    const runtime = loadLanguages();

    assert.deepEqual(plain(runtime.get('getLanguages')()), [
        { id: 'L01', name: 'English', order: '1' },
        { id: 'L02', name: 'German', order: '2' },
    ]);
    assert.equal(runtime.get('getLanguageName')('2'), 'German');
    assert.equal(runtime.get('getLanguageName')('*'), '* (All)');
    assert.equal(runtime.get('hasMissingLanguage')('L09'), true);
});

test('finds the next available language id', () => {
    const runtime = loadLanguages();

    assert.equal(runtime.get('getNextLanguageId')(), 'L03');

    runtime.set('config', {
        languages: Array.from({ length: 99 }, (_, index) => ({
            id: `L${String(index + 1).padStart(2, '0')}`,
            name: `Language ${index + 1}`,
            order: String(index + 1),
        })),
    });

    assert.equal(runtime.get('getNextLanguageId')(), '');
});
