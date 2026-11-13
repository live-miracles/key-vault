import assert from 'node:assert/strict';
import test from 'node:test';

import * as shared from '../supabase/functions/_shared/access.ts';
import { loadFrontendScripts } from './frontend-harness.mjs';

// The browser decides what to show with frontend/src/access.ts and the Edge Function
// enforces with supabase/functions/_shared/access.ts. They must answer every question the
// same way, so run both over every combination of roles a user can hold in one event.

const frontend = loadFrontendScripts(['frontend/src/access.ts']);
const fe = {
    ACTIONS: frontend.get('ACTIONS'),
    ROLES: frontend.get('ROLES'),
    getEventRoles: frontend.get('getEventRoles'),
    hasEventAccess: frontend.get('hasEventAccess'),
    hasKeyAccess: frontend.get('hasKeyAccess'),
    hasKeyColorAccess: frontend.get('hasKeyColorAccess'),
    hasLanguageAccess: frontend.get('hasLanguageAccess'),
    hasRoleAccess: frontend.get('hasRoleAccess'),
};

const plain = (value) => JSON.parse(JSON.stringify(value));

test('role and action codes match the frontend', () => {
    assert.deepEqual(plain(shared.ROLES), plain(fe.ROLES));
    assert.deepEqual(plain(shared.ACTIONS), plain(fe.ACTIONS));
});

// Every non-empty combination of (type, language) a user could hold in event E1.
const holdings = [];
for (const type of ['0', '1', '2', '3']) {
    for (const language of ['*', 'L1', 'L2']) holdings.push({ type, language });
}
const combos = [];
for (let mask = 0; mask < 1 << 4; mask += 1) {
    // Pick up to four holdings spread over the list; enough to mix every pair of types.
    const picked = holdings.filter((_, i) => (mask >> (i % 4)) & 1 && i % 3 === mask % 3);
    combos.push(picked);
}
for (const h of holdings) combos.push([h]);
for (let i = 0; i < holdings.length; i += 1) {
    for (let j = i + 1; j < holdings.length; j += 1) combos.push([holdings[i], holdings[j]]);
}

test('every access decision matches the frontend for all role combinations', () => {
    const events = [{ id: 'E1' }, { id: 'E2' }];
    let compared = 0;
    for (const held of combos) {
        for (const isAppOwner of [false, true]) {
            const roles = held.map((h) => ({ event: 'E1', email: 'a@example.test', ...h }));
            const a = shared.getEventRoles('a@example.test', events, roles, isAppOwner);
            const b = fe.getEventRoles('a@example.test', events, roles, isAppOwner);
            assert.deepEqual(plain(a), plain(b));

            for (const action of ['view', 'create', 'update', 'delete']) {
                for (const eventId of ['E1', 'E2', null]) {
                    assert.equal(
                        shared.hasEventAccess(a, action, eventId),
                        fe.hasEventAccess(b, action, eventId),
                        `event ${action} ${eventId}`,
                    );
                }
                for (const language of ['L1', 'L2', 'L3', null]) {
                    assert.equal(
                        shared.hasKeyAccess(a, action, 'E1', language),
                        fe.hasKeyAccess(b, action, 'E1', language),
                        `key ${action} ${language}`,
                    );
                }
                for (const type of ['0', '1', '2', '3', null]) {
                    assert.equal(
                        shared.hasRoleAccess(a, action, 'E1', type),
                        fe.hasRoleAccess(b, action, 'E1', type),
                        `role ${action} ${type}`,
                    );
                }
                compared += 1;
            }
            assert.equal(shared.hasLanguageAccess(a), fe.hasLanguageAccess(b));
            assert.equal(shared.hasKeyColorAccess(a, 'E1'), fe.hasKeyColorAccess(b, 'E1'));
        }
    }
    assert.ok(compared > 400);
});
