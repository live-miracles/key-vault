// Everything Key Vault knows about where a destination can go: the platforms, how a platform
// and a stream key become the address bunryu streams to, what a pasted key must look like,
// and what is a valid destination. The browser form and the server's add/edit operations both
// import this file, so a rule is written once and a bad link cannot be stored by anything that
// skips the form. Only erasable TypeScript syntax is used so Node, Deno and the bundler all
// read it as it is.

export type PlatformId = 'yt' | 'fb' | 'ig' | 'vc' | 'rtmp' | 'srt';

// How a platform treats the backup of a stream:
// - derived: the platform has its own backup address and uses the same key (YouTube);
// - fixed: same platform as the main stream, but its own key (Facebook);
// - none: there is no backup (Instagram);
// - free: any platform, chosen by the person (everything else).
export type BackupRule = 'derived' | 'fixed' | 'none' | 'free';

interface PlatformDefinition {
    name: string;
    // The address every stream key of this platform is appended to. Absent for the two
    // platforms where the "stream key" is the whole address.
    serverUrl?: string;
    backup: BackupRule;
}

const PLATFORMS: Record<PlatformId, PlatformDefinition> = {
    yt: { name: 'YouTube', serverUrl: 'rtmp://a.rtmp.youtube.com/live2/', backup: 'derived' },
    fb: {
        name: 'Facebook',
        serverUrl: 'rtmps://live-api-s.facebook.com:443/rtmp/',
        backup: 'fixed',
    },
    ig: {
        name: 'Instagram',
        serverUrl: 'rtmps://edgetee-upload-${s_prp}.xx.fbcdn.net:443/rtmp/',
        backup: 'none',
    },
    vc: {
        name: 'VdoCipher',
        serverUrl: 'rtmp://live-ingest-01.vd0.co:1935/livestream/',
        backup: 'free',
    },
    rtmp: { name: 'Something else (rtmp://)', backup: 'free' },
    srt: { name: 'SRT link', backup: 'free' },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS) as PlatformId[];

const YOUTUBE_BACKUP_URL = 'rtmp://b.rtmp.youtube.com/live2?backup=1/';
const INSTAGRAM_ADDRESS = /^rtmps:\/\/edgetee-upload-[^./]+\.xx\.fbcdn\.net:443\/rtmp\//;
// Platforms whose full address people paste: it is cut down to the key.
const RECOGNISED_BY_ADDRESS: PlatformId[] = ['yt', 'fb', 'vc'];

export function isPlatform(value: unknown): value is PlatformId {
    return typeof value === 'string' && Object.hasOwn(PLATFORMS, value);
}

export function platformName(platform: string): string {
    return isPlatform(platform) ? PLATFORMS[platform].name : '';
}

export function backupRule(platform: string): BackupRule {
    return isPlatform(platform) ? PLATFORMS[platform].backup : 'free';
}

// For the platforms whose key is the whole address (rtmp and srt).
export function keyIsWholeAddress(platform: string): boolean {
    return platform === 'rtmp' || platform === 'srt';
}

// ===== The destination: a platform and a key, with an optional backup =====

export interface Destination {
    platform: string;
    streamKey: string;
    backupPlatform: string;
    backupStreamKey: string;
}

function text(value: unknown): string {
    return String(value ?? '');
}

// The address bunryu streams to for one platform and key, or '' when either is missing.
export function streamUrl(platform: string, streamKey: string): string {
    if (!isPlatform(platform) || !streamKey) return '';
    if (keyIsWholeAddress(platform)) return streamKey;

    let serverUrl = PLATFORMS[platform].serverUrl as string;
    if (serverUrl.includes('${s_prp}')) {
        const params = new URLSearchParams(streamKey.split('?')[1]);
        serverUrl = serverUrl.replaceAll('${s_prp}', String(params.get('s_prp')));
    }
    return serverUrl + streamKey;
}

export function mainUrl(d: Destination): string {
    return streamUrl(d.platform, d.streamKey);
}

// The backup address. YouTube's is derived from the main key; Instagram has none.
export function backupUrl(d: Destination): string {
    const rule = backupRule(d.platform);
    if (rule === 'none') return '';
    if (rule === 'derived') return d.streamKey ? YOUTUBE_BACKUP_URL + d.streamKey : '';
    return streamUrl(d.backupPlatform, d.backupStreamKey);
}

// The backup as it is stored: a platform that sets its own backup up (or has none) stores
// nothing, and Facebook's is always Facebook.
export function normalizeBackup<T extends Destination>(d: T): T {
    const rule = backupRule(d.platform);
    if (rule === 'none' || rule === 'derived') {
        return { ...d, backupPlatform: '', backupStreamKey: '' };
    }
    if (rule === 'fixed') {
        return d.backupStreamKey
            ? { ...d, backupPlatform: d.platform }
            : { ...d, backupPlatform: '', backupStreamKey: '' };
    }
    return d;
}

// Whether a change touches where the stream goes, as opposed to its name or notes.
export function destinationChanged(before: Destination, after: Destination): boolean {
    return (['platform', 'streamKey', 'backupPlatform', 'backupStreamKey'] as const).some(
        (field) => text(before[field]) !== text(after[field]),
    );
}

// ===== Addresses typed or pasted =====

export function splitRtmpAddress(url: string): { serverUrl: string; streamKey: string } {
    if (!url) return { serverUrl: '', streamKey: '' };
    if (!url.startsWith('rtmp://') && !url.startsWith('rtmps://')) {
        return { serverUrl: '', streamKey: url };
    }
    const lastSlash = url.lastIndexOf('/');
    if (lastSlash < 0) return { serverUrl: url, streamKey: '' };
    return { serverUrl: url.slice(0, lastSlash + 1), streamKey: url.slice(lastSlash + 1) };
}

export function joinRtmpAddress(serverUrl: string, streamKey: string): string {
    if (!serverUrl || !streamKey) return '';
    return (serverUrl.endsWith('/') ? serverUrl : serverUrl + '/') + streamKey;
}

function recogniseAddress(value: string): { platform: PlatformId; streamKey: string } | null {
    for (const id of RECOGNISED_BY_ADDRESS) {
        const serverUrl = PLATFORMS[id].serverUrl as string;
        if (value.startsWith(serverUrl)) {
            return { platform: id, streamKey: value.slice(serverUrl.length) };
        }
    }
    if (value.startsWith(YOUTUBE_BACKUP_URL)) {
        return { platform: 'yt', streamKey: value.slice(YOUTUBE_BACKUP_URL.length) };
    }
    const instagram = INSTAGRAM_ADDRESS.exec(value);
    return instagram ? { platform: 'ig', streamKey: value.slice(instagram[0].length) } : null;
}

// If the address is one of the known platforms', which platform and which key.
export function detectKnownAddress(
    raw: unknown,
): { platform: PlatformId; streamKey: string } | null {
    const value = text(raw).trim();
    if (!value) return null;
    for (const id of RECOGNISED_BY_ADDRESS) {
        const serverUrl = PLATFORMS[id].serverUrl as string;
        if (value.startsWith(serverUrl)) {
            return { platform: id, streamKey: value.slice(serverUrl.length) };
        }
    }
    return null;
}

export interface CleanedStreamKey {
    platform: string;
    streamKey: string;
    // Set for "something else" when a whole address was pasted and split.
    serverUrl: string;
    notice: string;
}

// Takes a pasted stream key and makes it what the form stores. People often copy the whole
// address (rtmp://a.rtmp.youtube.com/live2/abcd-1234) instead of the key: when the platform
// is recognised only the key is kept, and a notice says so. For "something else" the address
// is split from the key at the last "/".
export function cleanStreamKeyInput(platform: string, raw: unknown): CleanedStreamKey {
    const value = text(raw).trim();
    const result = { platform, streamKey: value, serverUrl: '', notice: '' };
    if (!/^rtmps?:\/\//.test(value)) return result;

    const known = recogniseAddress(value);
    if (known?.streamKey) {
        return {
            ...result,
            platform: known.platform,
            streamKey: known.streamKey,
            notice: `That was a full ${platformName(known.platform)} address. We kept just the stream key.`,
        };
    }
    if (platform === 'rtmp') {
        const parts = splitRtmpAddress(value);
        if (parts.serverUrl && parts.streamKey) {
            return {
                ...result,
                streamKey: parts.streamKey,
                serverUrl: parts.serverUrl,
                notice: 'We split the full address into the server address and the stream key.',
            };
        }
    }
    return result;
}

// ===== SRT =====

export interface SrtSettings {
    mode: 'caller' | 'listener';
    host: string;
    port: number | '';
    latencyMs: number | '';
    passphrase: string;
    pbKeyLen: 16 | 24 | 32 | '';
    streamId: string;
}

export const DEFAULT_SRT_SETTINGS: SrtSettings = {
    mode: 'caller',
    host: '',
    port: '',
    latencyMs: 240,
    passphrase: '',
    pbKeyLen: '',
    streamId: '',
};

export function parseSrtUrl(url: unknown): SrtSettings {
    if (!text(url).startsWith('srt://')) return { ...DEFAULT_SRT_SETTINGS };
    try {
        const parsed = new URL(text(url));
        const latency = Number(parsed.searchParams.get('latency') ?? '');
        const port = Number(parsed.port || '');
        const pbKeyLen = Number(parsed.searchParams.get('pbkeylen') ?? '');
        return {
            mode: parsed.searchParams.get('mode') === 'listener' ? 'listener' : 'caller',
            host: parsed.hostname,
            port: Number.isInteger(port) && port > 0 ? port : '',
            latencyMs: Number.isInteger(latency) && latency > 0 ? Math.round(latency / 1000) : '',
            passphrase: parsed.searchParams.get('passphrase') ?? '',
            pbKeyLen: [16, 24, 32].includes(pbKeyLen) ? (pbKeyLen as 16 | 24 | 32) : '',
            streamId: parsed.searchParams.get('streamid') ?? '',
        };
    } catch {
        return { ...DEFAULT_SRT_SETTINGS };
    }
}

export function buildSrtUrl(settings: SrtSettings): string {
    const params = new URLSearchParams();
    params.set('mode', settings.mode);
    params.set('latency', String(Number(settings.latencyMs) * 1000));
    if (settings.passphrase) {
        params.set('passphrase', settings.passphrase);
        params.set('pbkeylen', String(settings.pbKeyLen || 32));
    }
    if (settings.streamId) params.set('streamid', settings.streamId);
    return `srt://${settings.host}:${settings.port}?${params.toString()}`;
}

// ===== What is wrong, in words anyone can act on =====

// `field` says which box of the form the message belongs to.
export interface Problem {
    field:
        | 'platform'
        | 'address'
        | 'streamKey'
        | 'srtHost'
        | 'srtPort'
        | 'srtLatency'
        | 'srtPassphrase'
        | 'srtKeyLen';
    message: string;
}

// What is wrong with a stream key; null when it looks fine.
export function streamKeyProblem(platform: string, key: unknown): string | null {
    const value = text(key);
    const name = platformName(platform) || 'your provider';
    if (!value) {
        return platform === 'rtmp'
            ? 'Paste the stream key your provider gave you.'
            : `Paste your ${name} stream key. It is the secret code from ${name}.`;
    }
    if (/\s/.test(value)) return 'A stream key has no spaces. Please copy it again.';
    if (/^(rtmps?|srt):\/\//.test(value)) {
        return 'That looks like a full address. Paste only the stream key, the part after the last “/”.';
    }
    if (platform === 'ig' && !/[?&]s_prp=[^&]+/.test(value)) {
        return 'An Instagram key contains “?s_prp=”. Please copy the whole key.';
    }
    return null;
}

export function srtProblem(settings: SrtSettings): Problem | null {
    const port = Number(settings.port);
    const latency = Number(settings.latencyMs);
    if (!settings.host) {
        return {
            field: 'srtHost',
            message: 'Enter the server address (hostname) your provider gave you.',
        };
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return { field: 'srtPort', message: 'The port is a number between 1 and 65535.' };
    }
    if (!Number.isInteger(latency) || latency <= 0) {
        return {
            field: 'srtLatency',
            message: 'The delay buffer must be a number above 0 (240 is a safe start).',
        };
    }
    if (
        settings.passphrase &&
        (settings.passphrase.length < 10 || settings.passphrase.length > 79)
    ) {
        return {
            field: 'srtPassphrase',
            message: 'The password must be 10 to 79 characters long.',
        };
    }
    if (settings.passphrase && ![16, 24, 32].includes(Number(settings.pbKeyLen))) {
        return {
            field: 'srtKeyLen',
            message: 'Choose an encryption strength when you set a password.',
        };
    }
    return null;
}

// What is wrong with one platform and key, or null. `required` is true for the main stream:
// an empty backup is fine.
export function endpointProblem(
    platform: string,
    streamKey: string,
    required = false,
): Problem | null {
    if (!platform && !streamKey && !required) return null;
    if (!isPlatform(platform)) {
        return { field: 'platform', message: "Please choose where you're streaming to." };
    }
    if (platform === 'srt') {
        return srtProblem(parseSrtUrl(streamKey)) ?? null;
    }

    let key = streamKey;
    if (platform === 'rtmp') {
        const { serverUrl, streamKey: rest } = splitRtmpAddress(streamKey);
        if (!serverUrl) {
            return {
                field: 'address',
                message:
                    'Enter the server address your provider gave you. It starts with rtmp:// or rtmps://',
            };
        }
        if (!/^rtmps?:\/\//.test(serverUrl) || /\s/.test(serverUrl)) {
            return {
                field: 'address',
                message:
                    'The server address must start with rtmp:// or rtmps:// and have no spaces.',
            };
        }
        key = rest;
    }
    const message = streamKeyProblem(platform, key);
    return message ? { field: 'streamKey', message } : null;
}

const NAME_PATTERN = /^[a-zA-Z0-9_\- ]*$/;

export function destinationNameProblem(name: string): string | null {
    if (!name.trim()) {
        return 'Give this destination a name your team will recognise, for example "YouTube English".';
    }
    if (!NAME_PATTERN.test(name))
        return 'Please use only letters, numbers, spaces, - and _ in the name.';
    return null;
}

export interface DestinationProblem extends Problem {
    part: 'main' | 'backup';
}

// The first thing wrong with where a destination goes, or null. The backup is only checked
// when the platform allows one.
export function destinationProblem(d: Destination): DestinationProblem | null {
    const main = endpointProblem(d.platform, d.streamKey, true);
    if (main) return { ...main, part: 'main' };
    if (backupRule(d.platform) === 'free' || backupRule(d.platform) === 'fixed') {
        const backup = endpointProblem(d.backupPlatform, d.backupStreamKey);
        if (backup) return { ...backup, part: 'backup' };
    }
    return null;
}

// ===== One address, one destination =====

export interface Clash {
    part: 'main' | 'backup';
    message: string;
}

// Whether the destination reuses an address another destination of the event already has, or
// puts the same address on its own main and backup. `others` are the event's other
// destinations (not this one).
export function findClash(d: Destination, others: Destination[]): Clash | null {
    const main = mainUrl(d);
    const backup = backupUrl(d);
    if (others.some((o) => mainUrl(o) === main || backupUrl(o) === main)) {
        return {
            part: 'main',
            message: 'This destination is already added in this event (same address and key).',
        };
    }
    if (backup && others.some((o) => mainUrl(o) === backup || backupUrl(o) === backup)) {
        return {
            part: 'backup',
            message: 'This backup is already used by another destination in this event.',
        };
    }
    if (backup && backupRule(d.platform) !== 'fixed' && main === backup) {
        return { part: 'backup', message: 'The backup must be different from the main stream.' };
    }
    return null;
}
