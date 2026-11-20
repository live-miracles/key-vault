import { createClient } from 'npm:@supabase/supabase-js@2';
import { errorResponse, operationFrom } from '../_shared/http.ts';
import { callOperation } from '../_shared/operations.ts';
import { deriveSecrets } from '../_shared/secrets.ts';
import { createSupabaseStore } from '../_shared/supabase-store.ts';

// The browser's only way to Key Vault's data. Every call is
// POST .../api/<operation> with the operation's input as the JSON body and the user's
// Supabase access token. A success is the result as JSON; a failure has a real HTTP status
// and { error: { code, message } } (see _shared/http.ts).

const MAX_BODY_BYTES = 256 * 1024;
const appOrigin = Deno.env.get('KEY_VAULT_APP_ORIGIN') || '';
const secret = Deno.env.get('KEY_VAULT_SECRET') || '';
const secrets = await deriveSecrets(secret);
const ownerEmails = new Set(
    (Deno.env.get('KEY_VAULT_OWNER_EMAILS') || '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
);

function corsHeaders(): Record<string, string> {
    return {
        'Access-Control-Allow-Origin': appOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        Vary: 'Origin',
        // Answers carry stream keys: never let a browser or a proxy keep one.
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
    };
}

function respond(body: unknown, status = 200): Response {
    return Response.json(body, { status, headers: corsHeaders() });
}

function fail(code: string, message: string, status: number): Response {
    return respond({ error: { code, message } }, status);
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS')
        return new Response(null, { status: 204, headers: corsHeaders() });
    if (request.method !== 'POST') return fail('invalid', 'Method not allowed.', 405);

    const url = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!appOrigin || !secrets || !url || !serviceKey) {
        console.error('The api function is missing configuration.');
        return fail('unavailable', 'The server is not configured.', 500);
    }

    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return fail('denied', 'Authentication is required.', 401);

    // Refuse an oversized body before reading it. No operation needs more than a few KB.
    if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY_BYTES) {
        return fail('invalid', 'The request is too large.', 413);
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: auth } = await admin.auth.getUser(token);
    const email = (auth.user?.email || '').toLowerCase();
    // Roles are matched by email, so the email must be one the identity provider verified.
    // Google sign-in always is; this refuses any other sign-in method that was left switched
    // on in Supabase and does not prove who owns the address.
    const verified =
        Boolean(auth.user?.email_confirmed_at) ||
        Boolean(auth.user?.identities?.some((i) => i.identity_data?.email_verified === true));
    if (!email || !verified) return fail('denied', 'Authentication is required.', 401);

    const operation = operationFrom(new URL(request.url).pathname);
    let input: unknown;
    try {
        const text = await request.text();
        if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
            return fail('invalid', 'The request is too large.', 413);
        }
        input = text ? JSON.parse(text) : undefined;
    } catch {
        return fail('invalid', 'The request body is invalid.', 400);
    }

    try {
        const result = await callOperation(
            createSupabaseStore(admin),
            {
                email,
                isAppOwner: ownerEmails.has(email),
                ownerEmails: [...ownerEmails],
                hashSecret: secrets.hashSecret,
                secret,
                ingestUrl: `${url}/functions/v1/ingest`,
                nowMs: Date.now(),
            },
            operation,
            input,
        );
        return respond(result ?? null);
    } catch (error) {
        const failure = errorResponse(error);
        if (failure.status >= 500) console.error(`Error in ${operation}:`, error);
        return respond(failure.body, failure.status);
    }
});
