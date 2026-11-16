// Key Vault is configured with one secret, KEY_VAULT_SECRET. The two values bunryu needs
// are derived from it, each by HMAC-SHA256 under its own label, so they are independent:
// the ingest token travels in a header on every heartbeat, and learning it reveals nothing
// about the hash secret (which never leaves bunryu and this server).

// The shortest accepted secret. `openssl rand -hex 32` gives 64 characters.
export const MIN_SECRET_LENGTH = 32;

export interface DerivedSecrets {
    ingestToken: string;
    hashSecret: string;
}

async function derive(secret: string, label: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(label));
    return [...new Uint8Array(signature)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

// Returns null when the secret is missing or too short to be safe, so a caller treats
// that as "the server is not configured".
export async function deriveSecrets(secret: string): Promise<DerivedSecrets | null> {
    if (secret.length < MIN_SECRET_LENGTH) return null;
    const [ingestToken, hashSecret] = await Promise.all([
        derive(secret, 'key-vault/ingest-token'),
        derive(secret, 'key-vault/hash-secret'),
    ]);
    return { ingestToken, hashSecret };
}
