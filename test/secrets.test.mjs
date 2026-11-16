import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveSecrets, MIN_SECRET_LENGTH } from '../supabase/functions/_shared/secrets.ts';

const SECRET = 'a'.repeat(MIN_SECRET_LENGTH);

test('one secret yields a token and a hash secret that differ', async () => {
    const derived = await deriveSecrets(SECRET);
    assert.match(derived.ingestToken, /^[0-9a-f]{64}$/);
    assert.match(derived.hashSecret, /^[0-9a-f]{64}$/);
    assert.notEqual(derived.ingestToken, derived.hashSecret);
    assert.ok(!derived.ingestToken.includes(SECRET) && !derived.hashSecret.includes(SECRET));
});

test('the derivation is stable and depends on the secret', async () => {
    assert.deepEqual(await deriveSecrets(SECRET), await deriveSecrets(SECRET));
    const other = await deriveSecrets('b'.repeat(MIN_SECRET_LENGTH));
    const derived = await deriveSecrets(SECRET);
    assert.notEqual(other.ingestToken, derived.ingestToken);
    assert.notEqual(other.hashSecret, derived.hashSecret);
});

test('pinned values, so bunryu and the server cannot drift apart', async () => {
    const derived = await deriveSecrets('0123456789abcdef0123456789abcdef');
    assert.deepEqual(derived, PINNED);
});

test('a missing or short secret is refused', async () => {
    assert.equal(await deriveSecrets(''), null);
    assert.equal(await deriveSecrets('a'.repeat(MIN_SECRET_LENGTH - 1)), null);
});

// Computed independently: HMAC-SHA256(secret, label), hex.
const PINNED = {
    ingestToken: '5899fc7ac70ac6e23c92cc4df577eea12fb89387be1b5a259359eb63d01ed506',
    hashSecret: '93a67513fc94b90004f8f0e49a786044707e0ad3a3a5d6545c88c5d4f981fb59',
};
