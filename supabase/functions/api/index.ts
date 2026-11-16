import { createClient } from 'npm:@supabase/supabase-js@2';
import { OPERATIONS } from '../_shared/operations.ts';
import { deriveSecrets } from '../_shared/secrets.ts';
import { createSupabaseStore } from '../_shared/supabase-store.ts';

// The browser's only way to Key Vault's data. Every call is
// POST { operation, args: [...] } with the user's Supabase access token; the answer is
// always { success, data } or { success, error }, as the Apps Script RPCs returned.

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
    };
}

function respond(body: unknown, status = 200): Response {
    return Response.json(body, { status, headers: corsHeaders() });
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS')
        return new Response(null, { status: 204, headers: corsHeaders() });
    if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405);

    const url = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!appOrigin || !secrets || !url || !serviceKey) {
        console.error('The api function is missing configuration.');
        return respond({ error: 'The server is not configured.' }, 500);
    }

    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return respond({ error: 'Authentication is required.' }, 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: auth } = await admin.auth.getUser(token);
    const email = (auth.user?.email || '').toLowerCase();
    if (!email) return respond({ error: 'Authentication is required.' }, 401);

    let body: { operation?: unknown; args?: unknown };
    try {
        body = await request.json();
    } catch {
        return respond({ error: 'The request body is invalid.' }, 400);
    }
    const operation = typeof body.operation === 'string' ? body.operation : '';
    const args = Array.isArray(body.args) ? body.args : [];
    if (!Object.hasOwn(OPERATIONS, operation)) {
        return respond({ error: `Unknown operation: ${operation}.` }, 404);
    }

    try {
        const result = await OPERATIONS[operation](
            createSupabaseStore(admin),
            {
                email,
                isAppOwner: ownerEmails.has(email),
                hashSecret: secrets.hashSecret,
                secret,
                ingestUrl: `${url}/functions/v1/ingest`,
                nowMs: Date.now(),
            },
            ...args,
        );
        return respond(result);
    } catch (error) {
        console.error(`Error in ${operation}:`, error);
        return respond({ success: false, error: 'The request could not be completed.' });
    }
});
