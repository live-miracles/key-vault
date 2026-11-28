import assert from 'node:assert/strict';
import test from 'node:test';

import { verifiedEmail } from '../supabase/functions/_shared/identity.ts';

const google = (identity_data) => ({ provider: 'google', identity_data });

test('verifiedEmail is the email Google verified, lowercase', () => {
    const user = { identities: [google({ email: ' Ann@Example.org ', email_verified: true })] };
    assert.equal(verifiedEmail(user), 'ann@example.org');
});

test('verifiedEmail ignores the account email, which the person can change', () => {
    // The account's email was changed to someone else's; the Google sign-in still says who it is.
    const user = {
        email: 'owner@example.org',
        email_confirmed_at: '2026-11-28T00:00:00Z',
        identities: [google({ email: 'ann@example.org', email_verified: true })],
    };
    assert.equal(verifiedEmail(user), 'ann@example.org');
});

test('verifiedEmail refuses anything but a verified Google sign-in', () => {
    assert.equal(verifiedEmail(null), '');
    assert.equal(verifiedEmail({}), '');
    assert.equal(verifiedEmail({ identities: null }), '');
    // Email and password, confirmed or not.
    assert.equal(
        verifiedEmail({
            email: 'owner@example.org',
            email_confirmed_at: '2026-11-28T00:00:00Z',
            identities: [
                {
                    provider: 'email',
                    identity_data: { email: 'owner@example.org', email_verified: true },
                },
            ],
        }),
        '',
    );
    assert.equal(verifiedEmail({ identities: [google({ email: 'ann@example.org' })] }), '');
    assert.equal(
        verifiedEmail({
            identities: [google({ email: 'ann@example.org', email_verified: 'true' })],
        }),
        '',
    );
    assert.equal(verifiedEmail({ identities: [google({ email_verified: true })] }), '');
    assert.equal(verifiedEmail({ identities: [{ provider: 'google', identity_data: null }] }), '');
});
