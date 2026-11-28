import assert from 'node:assert/strict';
import test from 'node:test';

import { backendConfigFromEnv } from '../build-tools/build.mjs';

const env = {
    KEY_VAULT_SUPABASE_URL: 'https://abcdefgh.supabase.co/',
    KEY_VAULT_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc',
};

test('the site is built from the project url and the publishable key', () => {
    assert.deepEqual(backendConfigFromEnv(env), {
        supabaseUrl: 'https://abcdefgh.supabase.co',
        publishableKey: 'sb_publishable_abc',
    });
});

test('the build fails without both values', () => {
    assert.throws(() => backendConfigFromEnv({}), /Set KEY_VAULT_SUPABASE_URL/);
    assert.throws(
        () => backendConfigFromEnv({ ...env, KEY_VAULT_SUPABASE_PUBLISHABLE_KEY: '' }),
        /Set KEY_VAULT_SUPABASE_URL/,
    );
});

test('a secret key must never be shipped to the browser', () => {
    assert.throws(
        () => backendConfigFromEnv({ ...env, KEY_VAULT_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' }),
        /not a secret/,
    );
    assert.throws(
        () =>
            backendConfigFromEnv({
                ...env,
                KEY_VAULT_SUPABASE_PUBLISHABLE_KEY: 'eyJ.service_role.sig',
            }),
        /not a secret/,
    );
});

// A legacy key is a JWT: the role is inside its base64 payload, not readable as text.
const legacyKey = (role) =>
    [
        Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
        Buffer.from(JSON.stringify({ iss: 'supabase', ref: 'abcdefgh', role })).toString(
            'base64url',
        ),
        'signature',
    ].join('.');

test('a legacy service-role key is refused, and the legacy anon key is accepted', () => {
    assert.throws(
        () =>
            backendConfigFromEnv({
                ...env,
                KEY_VAULT_SUPABASE_PUBLISHABLE_KEY: legacyKey('service_role'),
            }),
        /not a secret/,
    );
    assert.equal(
        backendConfigFromEnv({ ...env, KEY_VAULT_SUPABASE_PUBLISHABLE_KEY: legacyKey('anon') })
            .publishableKey,
        legacyKey('anon'),
    );
});

test('the url must be a hosted Supabase project', () => {
    assert.throws(
        () => backendConfigFromEnv({ ...env, KEY_VAULT_SUPABASE_URL: 'http://evil.example' }),
        /must look like/,
    );
});
