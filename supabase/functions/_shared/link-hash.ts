// The hash both Key Vault and bunryu use to recognise a destination without ever sending it.
// normalizeUrl and hashUrl mirror bunryu's src/utils/keyVaultPayload.ts. The agreed vectors
// are in test/fixtures/key-vault-hash-vectors.json (copied from bunryu). The address itself
// comes from platforms.ts.

// The URL trimmed, with a lowercase scheme and host (the rest, including the stream
// key, keeps its case) and no trailing "/".
export function normalizeUrl(url: string): string {
    const trimmed = url.trim();
    const match = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)([\s\S]*)$/.exec(trimmed);
    let normalized = trimmed;
    if (match) {
        const [, scheme, authority, rest] = match;
        const hostStart = authority.lastIndexOf('@') + 1;
        normalized = `${scheme.toLowerCase()}://${authority.slice(0, hostStart)}${authority
            .slice(hostStart)
            .toLowerCase()}${rest}`;
    }
    return normalized.replace(/\/+$/, '');
}

// HMAC-SHA256 of the normalised URL, hex, first 32 characters.
export async function hashUrl(secret: string, url: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(normalizeUrl(url)));
    return [...new Uint8Array(signature)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 32);
}
