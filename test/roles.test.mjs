import assert from 'node:assert/strict';
import test from 'node:test';

import { loadFrontendScripts } from './frontend-harness.mjs';

function loadRoles() {
    const runtime = loadFrontendScripts([
        'frontend/utils.js',
        'frontend/access.js',
        'frontend/languages.js',
        'frontend/roles.js',
    ]);
    runtime.set('config', {
        languages: [
            { id: 'L1', name: 'English', order: '1' },
            { id: 'L2', name: 'German', order: '2' },
        ],
    });
    return runtime;
}

test('sorts all-language editor and viewer roles before language-specific roles', () => {
    const runtime = loadRoles();
    const { ROLES } = runtime.get('({ ROLES })');
    const roles = [
        { email: 'editor-l1@example.test', event: 'E1', type: ROLES.EDITOR, language: 'L1' },
        { email: 'viewer-l1@example.test', event: 'E1', type: ROLES.VIEWER, language: 'L1' },
        { email: 'editor-all@example.test', event: 'E1', type: ROLES.EDITOR, language: '*' },
        { email: 'viewer-all@example.test', event: 'E1', type: ROLES.VIEWER, language: '*' },
    ];

    const sortedEmails = roles.sort(runtime.get('compareRolesForTable')).map((role) => role.email);

    assert.deepEqual(sortedEmails, [
        'editor-all@example.test',
        'editor-l1@example.test',
        'viewer-all@example.test',
        'viewer-l1@example.test',
    ]);
});
