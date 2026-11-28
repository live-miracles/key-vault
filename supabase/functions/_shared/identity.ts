// Who is calling, from the Supabase user an access token belongs to. Roles are matched by email,
// so the email must be one Google verified. It is taken from the Google sign-in itself, not from
// the account's `email`: a signed-in person can ask Supabase to change that one, and depending on
// the project's settings the change may not need the new address to be confirmed. Any other
// sign-in method that was left switched on in Supabase gives no access either.
//
// Only erasable TypeScript syntax is used so Node, Deno and the bundler all read this as it is.

export interface AuthUser {
    identities?: { provider?: string; identity_data?: Record<string, unknown> | null }[] | null;
}

// The lowercase email Google verified for this person, or '' when there is none.
export function verifiedEmail(user: AuthUser | null | undefined): string {
    const google = (user?.identities ?? []).find(
        (identity) =>
            identity.provider === 'google' && identity.identity_data?.email_verified === true,
    );
    const email = google?.identity_data?.email;
    return typeof email === 'string' ? email.trim().toLowerCase() : '';
}
