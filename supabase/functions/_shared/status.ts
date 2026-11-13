// The heartbeat bunryu sends (see docs/refactor-plan.md, "Heartbeat contract"), and how
// Key Vault turns the stored heartbeat into a status for each key.

import { hashUrl, keyUrl } from './key-url.ts';

export const HEARTBEAT_VERSION = 1;
export const MAX_OUTPUTS = 1000;
export const MAX_MESSAGE_LENGTH = 300;
// bunryu sends every 60 s; after three missed beats it counts as offline.
export const FRESH_MS = 3 * 60 * 1000;

export const STATUSES = ['running', 'warning', 'error', 'stopped'] as const;
export type Status = (typeof STATUSES)[number];

export interface HeartbeatOutput {
    hash: string;
    pipeline: string;
    output: string;
    status: Status;
    message: string;
    failures: number;
    stoppedAfterFailures: boolean;
    sinceMs: number;
}

export interface Heartbeat {
    instance: string;
    sentAt: string;
    outputs: HeartbeatOutput[];
}

function text(value: unknown, max: number): string {
    // Control characters (log escapes, newlines) become spaces; the length is bounded.
    return (
        String(value ?? '')
            // deno-lint-ignore no-control-regex
            .replace(/[\u0000-\u001f\u007f]+/g, ' ')
            .trim()
            .slice(0, max)
    );
}

// bunryu already strips destinations and secrets from a message. This is a second line
// of defence on this side: a URL that still got through is replaced before it is stored.
function safeMessage(value: unknown): string {
    return text(value, 2000)
        .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '<url>')
        .slice(0, MAX_MESSAGE_LENGTH);
}

function count(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), 1_000_000) : 0;
}

export function parseHeartbeat(body: unknown): Heartbeat {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new Error('The request body must be a JSON object.');
    }
    const input = body as Record<string, unknown>;
    if (input.version !== HEARTBEAT_VERSION) {
        throw new Error(`Unsupported heartbeat version: ${String(input.version)}.`);
    }
    const instance = String(input.instance ?? '');
    if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(instance)) {
        throw new Error('instance must be 1-32 characters: a-z, 0-9 and "-".');
    }
    const sentAt = new Date(String(input.sentAt ?? ''));
    if (Number.isNaN(sentAt.getTime())) throw new Error('sentAt must be an ISO date.');
    if (!Array.isArray(input.outputs)) throw new Error('outputs must be an array.');
    if (input.outputs.length > MAX_OUTPUTS) {
        throw new Error(`outputs has more than ${MAX_OUTPUTS} entries.`);
    }

    const outputs = input.outputs.map((raw, index): HeartbeatOutput => {
        if (!raw || typeof raw !== 'object') throw new Error(`outputs[${index}] is invalid.`);
        const o = raw as Record<string, unknown>;
        const hash = String(o.hash ?? '');
        if (!/^[0-9a-f]{32}$/.test(hash)) throw new Error(`outputs[${index}].hash is invalid.`);
        if (!STATUSES.includes(o.status as Status)) {
            throw new Error(`outputs[${index}].status is invalid.`);
        }
        return {
            hash,
            pipeline: text(o.pipeline, 200),
            output: text(o.output, 200),
            status: o.status as Status,
            message: safeMessage(o.message),
            failures: count(o.failures),
            stoppedAfterFailures: o.stoppedAfterFailures === true,
            sinceMs: count(o.sinceMs),
        };
    });

    return { instance, sentAt: sentAt.toISOString(), outputs };
}

// ---- Status of a key ----

export interface StatusRow extends HeartbeatOutput {
    instance: string;
}

export interface KeyStatus {
    status: Status;
    message: string;
    failures: number;
    stoppedAfterFailures: boolean;
    sinceMs: number;
    pipeline: string;
    output: string;
}

// Shown when one URL is used by several outputs: a problem outranks a healthy output,
// which outranks one that was stopped on purpose.
const RANK: Record<Status, number> = { stopped: 0, running: 1, warning: 2, error: 3 };

export function worstStatus(rows: StatusRow[]): KeyStatus | null {
    let worst: StatusRow | null = null;
    for (const row of rows) {
        if (!worst || RANK[row.status] > RANK[worst.status]) worst = row;
    }
    if (!worst) return null;
    return {
        status: worst.status,
        message: worst.message,
        failures: worst.failures,
        stoppedAfterFailures: worst.stoppedAfterFailures,
        sinceMs: worst.sinceMs,
        pipeline: worst.pipeline,
        output: worst.output,
    };
}

export interface InstanceInfo {
    instance: string;
    lastSeenAt: string;
}

export interface StatusReport {
    // At least one bunryu has reported within FRESH_MS. When false nothing can be said
    // about any key, so a key without a status is "unknown", not "not configured".
    online: boolean;
    instances: { instance: string; lastSeenAt: string; online: boolean }[];
    keys: Record<string, { main: KeyStatus | null; backup: KeyStatus | null }>;
}

export async function buildStatusReport(
    keys: { id: string; server: string; key: string; server2: string; key2: string }[],
    rows: StatusRow[],
    instances: InstanceInfo[],
    hashSecret: string,
    nowMs: number,
): Promise<StatusReport> {
    const fresh = new Set(
        instances
            .filter((i) => nowMs - new Date(i.lastSeenAt).getTime() <= FRESH_MS)
            .map((i) => i.instance),
    );
    const byHash = new Map<string, StatusRow[]>();
    for (const row of rows) {
        if (!fresh.has(row.instance)) continue;
        const list = byHash.get(row.hash);
        if (list) list.push(row);
        else byHash.set(row.hash, [row]);
    }

    const statusOf = async (server: string, key: string): Promise<KeyStatus | null> => {
        const url = keyUrl(server, key);
        if (!url) return null;
        return worstStatus(byHash.get(await hashUrl(hashSecret, url)) ?? []);
    };

    const result: StatusReport['keys'] = {};
    for (const k of keys) {
        result[k.id] = {
            main: await statusOf(k.server, k.key),
            backup: await statusOf(k.server2, k.key2),
        };
    }

    return {
        online: fresh.size > 0,
        instances: instances.map((i) => ({ ...i, online: fresh.has(i.instance) })),
        keys: result,
    };
}
