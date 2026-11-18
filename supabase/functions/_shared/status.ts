// The heartbeat bunryu sends (see docs/refactor-plan.md, "Heartbeat contract"), and how
// Key Vault turns the stored heartbeat into a status for each key.

import { hashUrl } from './link-hash.ts';
import { backupUrl, mainUrl } from './platforms.ts';
import type { Destination } from './platforms.ts';

export const HEARTBEAT_VERSION = 1;
export const MAX_OUTPUTS = 1000;
export const MAX_MESSAGE_LENGTH = 300;
// bunryu's own limit on a server name, so any name it accepts is accepted here.
export const MAX_INSTANCE_LENGTH = 80;
// deno-lint-ignore no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
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

// The state of one input: the signal arriving in one of bunryu's pipelines. It is matched
// to a Key Vault input by the pipeline's name.
export interface HeartbeatInput {
    pipeline: string;
    status: Status;
    message: string;
    sinceMs: number;
}

export interface Heartbeat {
    instance: string;
    sentAt: string;
    outputs: HeartbeatOutput[];
    // Optional: an older bunryu sends none.
    inputs: HeartbeatInput[];
    // Entries that were left out because they could not be used, each with the reason
    // (for example "outputs[3].hash is invalid"). The rest of the report is still kept.
    skipped: string[];
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
    const beat = body as Record<string, unknown>;
    if (beat.version !== HEARTBEAT_VERSION) {
        throw new Error(`Unsupported heartbeat version: ${String(beat.version)}.`);
    }
    // bunryu's Server Name, a display label (its default is "Bunryu"), so it is taken as
    // typed. It tells servers apart and is listed for app owners; it is never used in a query.
    const instance = String(beat.instance ?? '').trim();
    if (!instance || instance.length > MAX_INSTANCE_LENGTH || CONTROL_CHARACTERS.test(instance)) {
        throw new Error(
            `instance must be 1-${MAX_INSTANCE_LENGTH} characters with no control characters.`,
        );
    }
    const sentAt = new Date(String(beat.sentAt ?? ''));
    if (Number.isNaN(sentAt.getTime())) throw new Error('sentAt must be an ISO date.');
    if (!Array.isArray(beat.outputs)) throw new Error('outputs must be an array.');
    if (beat.outputs.length > MAX_OUTPUTS) {
        throw new Error(`outputs has more than ${MAX_OUTPUTS} entries.`);
    }

    // One entry that cannot be used is left out and reported in `skipped`; it must not
    // cost the destinations that are fine their status, since a report replaces the last.
    const skipped: string[] = [];

    const outputs: HeartbeatOutput[] = [];
    beat.outputs.forEach((raw, index) => {
        if (!raw || typeof raw !== 'object') {
            skipped.push(`outputs[${index}] is not an object`);
            return;
        }
        const o = raw as Record<string, unknown>;
        const hash = String(o.hash ?? '');
        if (!/^[0-9a-f]{32}$/.test(hash)) {
            skipped.push(`outputs[${index}].hash is invalid`);
            return;
        }
        if (!STATUSES.includes(o.status as Status)) {
            skipped.push(`outputs[${index}].status is invalid`);
            return;
        }
        outputs.push({
            hash,
            pipeline: text(o.pipeline, 200),
            output: text(o.output, 200),
            status: o.status as Status,
            message: safeMessage(o.message),
            failures: count(o.failures),
            stoppedAfterFailures: o.stoppedAfterFailures === true,
            sinceMs: count(o.sinceMs),
        });
    });

    const rawInputs = beat.inputs ?? [];
    if (!Array.isArray(rawInputs)) throw new Error('inputs must be an array.');
    if (rawInputs.length > MAX_OUTPUTS) {
        throw new Error(`inputs has more than ${MAX_OUTPUTS} entries.`);
    }
    const inputs: HeartbeatInput[] = [];
    rawInputs.forEach((raw, index) => {
        if (!raw || typeof raw !== 'object') {
            skipped.push(`inputs[${index}] is not an object`);
            return;
        }
        const i = raw as Record<string, unknown>;
        const pipeline = text(i.pipeline, 200);
        if (!pipeline) {
            skipped.push(`inputs[${index}].pipeline is blank`);
            return;
        }
        if (!STATUSES.includes(i.status as Status)) {
            skipped.push(`inputs[${index}].status is invalid`);
            return;
        }
        inputs.push({
            pipeline,
            status: i.status as Status,
            message: safeMessage(i.message),
            sinceMs: count(i.sinceMs),
        });
    });

    return { instance, sentAt: sentAt.toISOString(), outputs, inputs, skipped };
}

// ---- Status of a destination ----

export interface StatusRow extends HeartbeatOutput {
    instance: string;
}

export interface PipelineRow extends HeartbeatInput {
    instance: string;
}

// What bunryu reports for a destination, the worse of its main and backup stream. The
// browser words it; it works nothing out.
// One stream of a destination. null: the destination has no link on that side (no backup).
// "not_configured": Key Vault has the link and bunryu has no output with it (yet).
export type SideState = Status | 'not_configured' | null;

export interface KeyStatus {
    // "not_configured": Key Vault has the link and bunryu has no output with it (yet).
    state: Status | 'not_configured';
    // Which of the two streams the status is about.
    side: 'main' | 'backup';
    // Each stream on its own, so a card can show whether main and backup are on or off. The
    // fields above are the worse of the two.
    sides: { main: SideState; backup: SideState };
    message: string;
    failures: number;
    stoppedAfterFailures: boolean;
    sinceMs: number;
    pipeline: string;
    output: string;
    // bunryu runs this output in a pipeline whose name differs from the destination's
    // input: the link was probably put in the wrong place.
    inputMismatch: boolean;
}

// Shown when one URL is used by several outputs, and when a destination has a main and a
// backup: a problem outranks a healthy output, which outranks one that was stopped on purpose.
const RANK: Record<Status | 'not_configured', number> = {
    not_configured: -1,
    stopped: 0,
    running: 1,
    warning: 2,
    error: 3,
};

function worstOf<T extends { status: Status }>(rows: T[]): T | null {
    let worst: T | null = null;
    for (const row of rows) {
        if (!worst || RANK[row.status] > RANK[worst.status]) worst = row;
    }
    return worst;
}

export interface InputStatus {
    status: Status;
    message: string;
    sinceMs: number;
    // The pipeline's own spelling, which can differ from the input's in case or spacing.
    pipeline: string;
}

// Names are matched ignoring case and extra spaces: "Hindi", "hindi" and " Hindi  " are one.
export function normalizeInputName(name: string): string {
    return String(name ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

export interface InstanceInfo {
    instance: string;
    lastSeenAt: string;
}

export interface StatusReport {
    // At least one bunryu has reported within FRESH_MS. When false nothing can be said
    // about any destination: bunryu only runs during events, so silence is normal.
    online: boolean;
    instances: { instance: string; lastSeenAt: string; online: boolean }[];
    // By destination id. null: the destination has no link to look for.
    keys: Record<string, KeyStatus | null>;
    // By input id. null: bunryu has no pipeline of that name.
    inputs: Record<string, InputStatus | null>;
}

export async function buildStatusReport(
    keys: (Destination & { id: string; input?: string })[],
    rows: StatusRow[],
    instances: InstanceInfo[],
    hashSecret: string,
    nowMs: number,
    pipelines: PipelineRow[] = [],
    inputs: { id: string; name: string }[] = [],
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

    const byPipeline = new Map<string, PipelineRow[]>();
    for (const row of pipelines) {
        if (!fresh.has(row.instance)) continue;
        const name = normalizeInputName(row.pipeline);
        const list = byPipeline.get(name);
        if (list) list.push(row);
        else byPipeline.set(name, [row]);
    }
    const inputName = new Map(inputs.map((i) => [i.id, normalizeInputName(i.name)]));

    // The worst output bunryu runs for one address, or null when it runs none.
    const statusOf = async (url: string, input?: string): Promise<KeyStatus | null> => {
        if (!url) return null;
        const worst = worstOf(byHash.get(await hashUrl(hashSecret, url)) ?? []);
        if (!worst) return null;
        const expected = input === undefined ? undefined : inputName.get(input);
        return {
            state: worst.status,
            side: 'main',
            sides: { main: null, backup: null },
            message: worst.message,
            failures: worst.failures,
            stoppedAfterFailures: worst.stoppedAfterFailures,
            sinceMs: worst.sinceMs,
            pipeline: worst.pipeline,
            output: worst.output,
            inputMismatch:
                Boolean(expected && worst.pipeline) &&
                normalizeInputName(worst.pipeline) !== expected,
        };
    };

    const result: StatusReport['keys'] = {};
    for (const k of keys) {
        const main = mainUrl(k);
        if (!main) {
            result[k.id] = null;
            continue;
        }
        const mainStatus = await statusOf(main, k.input);
        const backup = backupUrl(k);
        const backupStatus = await statusOf(backup, k.input);
        const sides: KeyStatus['sides'] = {
            main: mainStatus ? (mainStatus.state as Status) : 'not_configured',
            backup: backup
                ? backupStatus
                    ? (backupStatus.state as Status)
                    : 'not_configured'
                : null,
        };
        const candidates = [
            mainStatus,
            backupStatus ? { ...backupStatus, side: 'backup' as const } : null,
        ]
            .filter((s): s is KeyStatus => s !== null)
            .map((s) => ({ ...s, status: s.state as Status }));
        const worst = worstOf(candidates);
        if (!worst) {
            result[k.id] = {
                state: 'not_configured',
                side: 'main',
                sides,
                message: '',
                failures: 0,
                stoppedAfterFailures: false,
                sinceMs: 0,
                pipeline: '',
                output: '',
                inputMismatch: false,
            };
            continue;
        }
        const { status: _status, ...status } = worst;
        result[k.id] = { ...status, sides };
    }

    const inputStatus: StatusReport['inputs'] = {};
    for (const input of inputs) {
        const worst = worstOf(byPipeline.get(normalizeInputName(input.name)) ?? []);
        inputStatus[input.id] = worst
            ? {
                  status: worst.status,
                  message: worst.message,
                  sinceMs: worst.sinceMs,
                  pipeline: worst.pipeline,
              }
            : null;
    }

    return {
        online: fresh.size > 0,
        instances: instances.map((i) => ({ ...i, online: fresh.has(i.instance) })),
        keys: result,
        inputs: inputStatus,
    };
}
