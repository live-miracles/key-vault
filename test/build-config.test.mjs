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

test('the url must be a hosted Supabase project', () => {
    assert.throws(
        () => backendConfigFromEnv({ ...env, KEY_VAULT_SUPABASE_URL: 'http://evil.example' }),
        /must look like/,
    );
});
