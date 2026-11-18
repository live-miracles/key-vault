// The input list beside an event's destinations: which inputs it shows, which one is chosen,
// and how many destinations are in each state. Pure: it reads what bunryu reports, nothing else.

import type { StatusReport } from '../../supabase/functions/_shared/status.ts';
import { inputsOf } from './model.ts';
import type { LoadedData } from './model.ts';

export const STATUS_ORDER = ['error', 'warning', 'running', 'stopped'] as const;

// The first item of the input list: every destination of the event, whatever its input.
export const ALL_INPUTS = 'all';

export interface StatusSummary {
    total: number;
    running: number;
    warning: number;
    error: number;
    stopped: number;
    unreported: number;
}

// How many of `keys` are in each state. A destination bunryu does not report on is "unreported".
export function summarizeKeyStatuses(
    keys: { id: string }[],
    report: StatusReport | null | undefined,
): StatusSummary {
    const summary: StatusSummary = {
        total: 0,
        running: 0,
        warning: 0,
        error: 0,
        stopped: 0,
        unreported: 0,
    };
    for (const key of keys) {
        summary.total++;
        const state = report?.keys?.[key.id]?.state;
        if (state && state !== 'not_configured') summary[state]++;
        else summary.unreported++;
    }
    return summary;
}

// The inputs listed for an event: its own, in the order its admins gave them, then any input
// a destination still points at that the event does not have, so such a destination is never
// hidden.
export function listEventInputs(
    data: Pick<LoadedData, 'inputs'>,
    eventId: string,
    keys: { input: string }[],
): string[] {
    const own = inputsOf(data, eventId).map((input) => input.id);
    const strays = [...new Set(keys.map((key) => key.input))].filter((id) => !own.includes(id));
    return own.concat(strays);
}

// What to show: the wanted input when it is in the list, otherwise All. An event with no
// inputs has nothing to choose ('').
export function resolveInputFilter(inputIds: string[], wanted: string | null): string {
    if (inputIds.length === 0) return '';
    return wanted && inputIds.includes(wanted) ? wanted : ALL_INPUTS;
}
