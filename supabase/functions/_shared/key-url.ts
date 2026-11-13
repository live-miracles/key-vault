// How Key Vault turns a key into the destination URL bunryu uses, and the hash both sides
// use to recognise it. keyUrl mirrors getRtmpValue in frontend/src/keys.ts;
// normalizeUrl and hashUrl mirror bunryu's src/utils/keyVaultPayload.ts. The agreed
// vectors are in test/fixtures/key-vault-hash-vectors.json (copied from bunryu).

const SERVER_URLS: Record<string, string> = {
    yt: 'rtmp://a.rtmp.youtube.com/live2/',
    fb: 'rtmps://live-api-s.facebook.com:443/rtmp/',
    ig: 'rtmps://edgetee-upload-${s_prp}.xx.fbcdn.net:443/rtmp/',
    vc: 'rtmp://live-ingest-01.vd0.co:1935/livestream/',
};

// The two "custom" servers keep the whole URL in the key field.
function isFullUrlServer(server: string): boolean {
    return server === 'rtmp' || server === 'srt';
}

export function keyUrl(server: string, key: string): string {
    if (!server || !key) return '';
    if (isFullUrlServer(server)) return key;

    let serverUrl = Object.hasOwn(SERVER_URLS, server) ? SERVER_URLS[server] : server;
    if (serverUrl.includes('${s_prp}')) {
        const params = new URLSearchParams(key.split('?')[1]);
        serverUrl = serverUrl.replaceAll('${s_prp}', String(params.get('s_prp')));
    }
    return serverUrl + key;
}

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
