// What bunryu's report means, in words for the media team. The server decides each
// destination's status (see supabase/functions/_shared/status.ts); this file only words it:
// labels, advice on what to try, and the colour of a card. No DOM, no ranking.
//
// The advice is written here for the media team, not taken from bunryu: bunryu's own hints are
// for the streaming team (hosts, ports, FFmpeg). It is a lookup on bunryu's redacted message, so
// an unknown message gets the generic line and the raw text is never shown.

import type {
    InputStatus,
    KeyStatus,
    StatusReport,
} from '../../supabase/functions/_shared/status.ts';
import { formatAgo } from './format.ts';

type State = KeyStatus['state'];

export const STATUS_LABELS: Record<string, string> = {
    running: 'Running',
    warning: 'Warning',
    error: 'Error',
    stopped: 'Configured, not running',
};

// The tint of a card, by the status bunryu reports. Only bunryu's report colors a card.
const STATUS_TINT: Record<string, string> = {
    running: 'tint-running',
    warning: 'tint-warning',
    error: 'tint-error',
    stopped: 'tint-configured',
};

// The status bunryu has for a destination: null unless it runs there (a destination bunryu
// does not know is "not set up", which is not a status of a stream).
export function reportedStatus(
    report: StatusReport | null | undefined,
    keyId: string,
): KeyStatus | null {
    const entry = report?.keys?.[keyId];
    return entry && entry.state !== 'not_configured' ? entry : null;
}

// bunryu's own words for the streaming team, for the hover on a card.
export function describeKeyStatus(status: KeyStatus): string {
    const parts = [STATUS_LABELS[status.state] || status.state];
    if (status.pipeline || status.output) {
        parts.push([status.pipeline, status.output].filter(Boolean).join(' → '));
    }
    if (status.stoppedAfterFailures) {
        parts.push(`stopped after ${status.failures} failed attempts`);
    }
    if (status.message) parts.push(status.message);
    return parts.join(' • ');
}

// The tint of a destination's card and bunryu's technical hover text. Nothing for a destination
// bunryu does not report on.
export function getKeyDisplay(
    key: { id: string; input?: string },
    report: StatusReport | null | undefined,
    nowMs = Date.now(),
): { tint: string; title: string } {
    const status = reportedStatus(report, key.id);
    if (!status) return { tint: '', title: '' };
    // A destination that has not started because its input is off is not a problem, so it is
    // not painted as one. Owners and admins still get bunryu's report on hover.
    const tint = isNotStarted(status, getInputStatus(key.input ?? '', report, nowMs))
        ? ''
        : STATUS_TINT[status.state] || '';
    return { tint, title: describeKeyStatus(status) };
}

// ===== The status note under a destination's name =====

export const NOTE_LABELS: Record<string, string> = {
    running: 'Live',
    warning: 'Unstable',
    error: 'Problem',
    stopped: 'Not sending',
};

const GENERIC_ADVICE: Record<string, string> = {
    error: 'Nothing is being sent. Check the stream key and that the stream is started on the platform, then tell the streaming team.',
    warning: 'It is sending, but not smoothly. Tell the streaming team if it keeps happening.',
};

// First match wins, so the more specific patterns come first.
export const ADVICE_PATTERNS: [RegExp, string][] = [
    [
        /error closing file/i,
        'The platform stopped accepting the stream. This often fixes itself. If it does not, check the platform’s live page.',
    ],
    [
        /server returned 40[13]|unauthorized|forbidden/i,
        'The platform did not accept the stream key. It may be wrong or have expired. Get a fresh key from the platform and update it here.',
    ],
    [
        /connection setup failure|connection rejected|econnreject|passphrase/i,
        'The SRT link was rejected. Check the link, with its passphrase and stream id, with whoever gave it to you.',
    ],
    [
        /connection refused|timed out|etimedout|name or service not known|could not resolve|failed to resolve|getaddrinfo/i,
        'Could not reach the platform. Check the address and stream key you entered, and that the stream is started on the platform.',
    ],
    [
        /input\/output error|broken pipe|connection reset by peer|end of file/i,
        'The platform closed the connection. The stream key is often wrong, expired, or already in use by another stream. Check it on the platform.',
    ],
    [
        /not (?:currently )?supported in container|incompatible with (?:output )?codec|not compatible with flv/i,
        'The platform cannot accept this video format. Tell the streaming team.',
    ],
    [
        /falling behind/i,
        'The stream is reaching the platform slowly, usually because of the network. Tell the streaming team if it keeps happening.',
    ],
];

export function getStatusAdvice(status: { state: State; message?: string }): string {
    const message = status.message || '';
    for (const [pattern, advice] of ADVICE_PATTERNS) {
        if (pattern.test(message)) return advice;
    }
    return GENERIC_ADVICE[status.state] || '';
}

// A short phrase for how long a stream has been live (shown only on hover of its label), from
// its start time in ms.
export function describeLiveFor(sinceMs: number, nowMs: number): string {
    if (!sinceMs) return '';
    const ago = formatAgo(nowMs - sinceMs);
    return ago === 'just now' ? '' : `for ${ago.replace(/ ago$/, '')}`;
}

export interface KeyNote {
    state: 'none' | 'running' | 'warning' | 'error' | 'stopped';
    label: string;
    text: string;
    detail?: string;
}

// What to say under a destination's name, or null when nothing can be said. Without a fresh
// report from bunryu nothing is claimed: bunryu only runs during events, so silence is normal.
export function describeKeyNote(
    key: { id: string; input: string; name?: string },
    report: StatusReport | null | undefined,
    nowMs = Date.now(),
    inputName = '',
): KeyNote | null {
    if (!report?.online) return null;
    const status = report.keys?.[key.id];
    if (!status) return null;
    if (status.state === 'not_configured') {
        return {
            state: 'none',
            label: 'Not set up yet',
            text: 'The streaming team has not set up this link yet, or still has the old one.',
        };
    }

    const input = getInputStatus(key.input, report, nowMs);
    if (isNotStarted(status, input)) {
        return {
            state: 'none',
            label: 'Not started yet',
            text: 'This destination starts sending once its input is live.',
        };
    }
    const inputLabel = inputName ? `“${inputName}”` : 'this input';
    const label = NOTE_LABELS[status.state] || status.state;
    // The link runs in a pipeline of another name than this destination's input, so it was
    // probably put in the wrong place. Said first: a healthy stream in the wrong place is
    // still wrong.
    const wrongInput = status.inputMismatch
        ? `The streaming team has this link under “${status.pipeline}”, but this destination is for ${inputLabel}. One of them is wrong.`
        : '';
    if (status.state === 'running' || status.state === 'stopped') {
        if (wrongInput) {
            return { state: 'warning', label: 'Check input', text: wrongInput };
        }
        return status.state === 'running'
            ? {
                  state: 'running',
                  label,
                  text: '',
                  detail: describeLiveFor(status.sinceMs, nowMs),
              }
            : { state: 'stopped', label, text: 'Set up, but not sending right now.' };
    }

    const parts: string[] = [];
    if (status.side === 'backup') parts.push('Backup stream:');
    if (status.stoppedAfterFailures) {
        parts.push(`Gave up after ${status.failures} failed attempts.`);
    }
    if (wrongInput) parts.push(wrongInput);
    // When the input itself is not arriving, the destination is not the problem.
    parts.push(
        input?.status === 'error'
            ? `The input ${inputLabel} is not arriving, so this is probably not a problem with the platform. Tell the streaming team.`
            : getStatusAdvice(status),
    );
    return {
        state: status.state === 'error' ? 'error' : 'warning',
        label,
        text: parts.join(' ').trim(),
    };
}

// ===== Main and backup =====

export interface SideDot {
    // The dot's colour: green, amber, red, or grey for off.
    state: 'running' | 'warning' | 'error' | 'stopped';
    // Plain words for its hover text: "Backup: Not sending".
    label: string;
}

// Whether one stream of a destination, the main or the backup, is on: a dot and its words.
// Null says nothing: there is no fresh report, the destination has no such link, or an older
// server did not send the sides. A stream bunryu has not been given, or one waiting for its
// input to go live, is grey, because it is not running, but it is not a fault either.
export function describeSide(
    key: { id: string; input: string },
    side: 'main' | 'backup',
    report: StatusReport | null | undefined,
    nowMs = Date.now(),
): SideDot | null {
    if (!report?.online) return null;
    const status = report.keys?.[key.id];
    const state = status?.sides?.[side];
    if (!status || !state) return null;
    const name = side === 'main' ? 'Main' : 'Backup';
    if (state === 'not_configured') {
        return { state: 'stopped', label: `${name}: Not set up yet` };
    }
    const waiting =
        state !== 'running' &&
        !status.inputMismatch &&
        getInputStatus(key.input, report, nowMs)?.status === 'stopped';
    if (waiting) return { state: 'stopped', label: `${name}: Not started yet` };
    return { state, label: `${name}: ${NOTE_LABELS[state] || state}` };
}

// ===== Inputs =====

export const INPUT_LABELS: Record<string, string> = {
    running: 'Receiving',
    warning: 'Unstable',
    error: 'Not arriving',
    stopped: 'Idle',
};

// How long an input may have had no signal before it counts as off rather than as just lost.
// bunryu says "error" for any pipeline that is meant to be live and gets nothing, and keeps
// saying it after the team has stopped everything, so a long silence is read as "off".
export const INPUT_OFF_AFTER_MS = 10 * 60 * 1000;

// What bunryu reports about an input, found by the input's name, or null: nothing is claimed
// without a fresh report, or for an input bunryu has no pipeline of that name for. An input
// with no signal for INPUT_OFF_AFTER_MS is returned as "stopped" (Idle): it is off, not failing.
// A report that does not say since when is never taken as a long silence.
export function getInputStatus(
    inputId: string,
    report: StatusReport | null | undefined,
    nowMs = Date.now(),
): InputStatus | null {
    if (!report?.online) return null;
    const input = report.inputs?.[inputId];
    if (!input) return null;
    if (
        input.status === 'error' &&
        input.sinceMs > 0 &&
        nowMs - input.sinceMs >= INPUT_OFF_AFTER_MS
    ) {
        return { ...input, status: 'stopped' };
    }
    return input;
}

// A destination that is not live while its input is off has simply not started: there is
// nothing to fix, so it is not shown as an error. A link under the wrong input is still said.
export function isNotStarted(status: KeyStatus, input: InputStatus | null): boolean {
    return input?.status === 'stopped' && status.state !== 'running' && !status.inputMismatch;
}

export interface InputBanner {
    state: 'warning' | 'error';
    label: string;
    text: string;
}

// The words above a list of destinations when their input is in trouble, or null.
export function describeInputBanner(
    inputId: string,
    name: string,
    report: StatusReport | null | undefined,
    nowMs = Date.now(),
): InputBanner | null {
    const input = getInputStatus(inputId, report, nowMs);
    if (!input || (input.status !== 'error' && input.status !== 'warning')) return null;
    const text =
        input.status === 'error'
            ? `Nothing is arriving on input “${name}”. Its destinations cannot be live until the signal is back, so there is no need to contact the platforms. Tell the streaming team.`
            : `The signal on input “${name}” is unstable, so its destinations may stutter. Tell the streaming team if it keeps happening.`;
    return { state: input.status, label: INPUT_LABELS[input.status], text };
}

// Only trouble needs words on the card. For anything calm (Live, Not set up yet, Not sending)
// the explanation waits in the label's hover text, so the card stays short.
export function isTroubleNote(note: Pick<KeyNote, 'state'>): boolean {
    return note.state === 'error' || note.state === 'warning';
}
