import { createClient } from 'npm:@supabase/supabase-js@2';
import { deriveSecrets } from '../_shared/secrets.ts';
import { parseHeartbeat } from '../_shared/status.ts';

// Where bunryu reports. It is called with a shared bearer token, not a Supabase user
// token, so this function is deployed without JWT verification (supabase/config.toml)
// and checks the token itself. It stores hashes and statuses, never destinations.

const ingestToken = (await deriveSecrets(Deno.env.get('KEY_VAULT_SECRET') || ''))?.ingestToken;
const MAX_BODY_BYTES = 1024 * 1024;

function respond(body: unknown, status = 200): Response {
    return Response.json(body, { status });
}

// Compares digests, so neither the length nor the content of the token decides how long
// the comparison takes.
async function sameToken(given: string, expected: string): Promise<boolean> {
    const digest = async (value: string) =>
        new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
    const [a, b] = await Promise.all([digest(given), digest(expected)]);
    let difference = 0;
    for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
    return difference === 0;
}

Deno.serve(async (request) => {
    if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405);

    const url = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!ingestToken || !url || !serviceKey) {
        console.error('The ingest function is missing configuration.');
        return respond({ error: 'The server is not configured.' }, 500);
    }

    const given = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!given || !(await sameToken(given, ingestToken))) {
        return respond({ error: 'Authentication is required.' }, 401);
    }

    const text = await request.text();
    if (text.length > MAX_BODY_BYTES)
        return respond({ error: 'The request body is too large.' }, 413);

    let heartbeat;
    try {
        heartbeat = parseHeartbeat(JSON.parse(text));
    } catch (error) {
        return respond(
            { error: error instanceof Error ? error.message : 'Invalid heartbeat.' },
            400,
        );
    }

    // bunryu does not read the answer, so this log is where a bad entry is noticed.
    if (heartbeat.skipped.length) {
        console.warn(
            `Skipped ${heartbeat.skipped.length} unusable entries from "${heartbeat.instance}": ${heartbeat.skipped.slice(0, 10).join('; ')}`,
        );
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data, error } = await admin.rpc('ingest_heartbeat', {
        p_instance: heartbeat.instance,
        p_sent_at: heartbeat.sentAt,
        p_outputs: heartbeat.outputs,
        p_inputs: heartbeat.inputs,
    });
    if (error) {
        console.error('ingest_heartbeat failed:', error.message);
        return respond({ error: 'The heartbeat could not be stored.' }, 500);
    }
    return respond({ ok: true, stored: data, skipped: heartbeat.skipped.length });
});
