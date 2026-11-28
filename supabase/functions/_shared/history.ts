// Working out an earlier version of an event from the log of changes, and what it takes to go
// back to it. Pure: it takes the event and its changes as parameters and touches no store, so
// each function can be checked by calling it. Only erasable TypeScript syntax is used.
//
// A version is "the event as it was right after change N", like a commit. It is found by
// starting from the event as it is now and undoing every newer change, newest first.

import type { ChangeRow, EventState, InputRow, KeyRow, RowDiff, VersionSteps } from './types.ts';

// What a key's "last edited" stamp says is not part of what the key is, so it never counts as
// a difference.
const STAMP_FIELDS = ['updatedBy', 'updatedAction', 'updatedAt'];

// The changes that built or undid an event's rows. An event deleted or brought back from the
// trash changed none of them (its rows stayed where they were), a change to the admins is not in
// any event, and people's access is recorded but is not part of a version.
function undoable(change: ChangeRow, event: string): boolean {
    if (change.event !== event || change.kind === 'admin' || change.kind === 'role') return false;
    return !(change.kind === 'event' && ['deleted', 'restored'].includes(change.action));
}

// Puts one row back as it was before `change`: removed if the change added it, the old row
// otherwise (it was edited or deleted).
function undoRow<T extends { id: string }>(rows: T[], change: ChangeRow): T[] {
    const others = rows.filter((row) => row.id !== change.rowId);
    if (change.action === 'added' || !change.before) return others;
    return [...others, structuredClone(change.before) as T];
}

const byPosition = (a: InputRow, b: InputRow) =>
    a.position - b.position || a.id.localeCompare(b.id);

// Whether the event existed right after change `atChange`: false when it was added later.
export function existedAt(changes: ChangeRow[], event: string, atChange: number): boolean {
    return !changes.some(
        (c) => c.event === event && c.kind === 'event' && c.action === 'added' && c.id > atChange,
    );
}

// The event as it was right after change `atChange`. `now` is the event as it is; `changes` are
// its changes (any others are ignored). `atChange: 0` is the start of history: before the
// oldest change there is. When the event was added after `atChange`, its rows come out empty.
export function stateAt(now: EventState, changes: ChangeRow[], atChange: number): EventState {
    const state: EventState = structuredClone(now);
    const newer = changes
        .filter((c) => c.id > atChange && undoable(c, now.event.id))
        .sort((a, b) => b.id - a.id);
    for (const change of newer) {
        if (change.kind === 'event') {
            if (change.before) state.event = structuredClone(change.before) as typeof state.event;
        } else if (change.kind === 'input') state.inputs = undoRow(state.inputs, change);
        else if (change.kind === 'key') state.keys = undoRow(state.keys, change);
    }
    state.inputs.sort(byPosition);
    return state;
}

// ===== Differences =====

function sameValue(a: unknown, b: unknown): boolean {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// The fields of two rows that differ, leaving out the ones named in `ignore` and the id.
function changedFields(a: Record<string, any>, b: Record<string, any>, ignore: string[] = []) {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])]
        .filter((field) => field !== 'id' && !ignore.includes(field))
        .filter((field) => !sameValue(a[field], b[field]));
}

function diffRows<T extends { id: string }>(
    kind: RowDiff['kind'],
    then: T[],
    now: T[],
    ignore: string[] = [],
): RowDiff[] {
    const diffs: RowDiff[] = [];
    for (const before of then) {
        const after = now.find((row) => row.id === before.id);
        if (!after) {
            diffs.push({
                kind,
                rowId: before.id,
                status: 'deleted',
                then: before,
                now: null,
                fields: [],
            });
            continue;
        }
        const fields = changedFields(before, after, ignore);
        if (fields.length) {
            diffs.push({
                kind,
                rowId: before.id,
                status: 'changed',
                then: before,
                now: after,
                fields,
            });
        }
    }
    for (const after of now) {
        if (!then.some((row) => row.id === after.id)) {
            diffs.push({
                kind,
                rowId: after.id,
                status: 'added',
                then: null,
                now: after,
                fields: [],
            });
        }
    }
    return diffs;
}

// How the event now differs from `then`: its name, and its inputs and destinations matched by
// id. Nothing is listed for a row that is the same.
export function diffStates(then: EventState, now: EventState): RowDiff[] {
    const event: RowDiff[] =
        then.event.name === now.event.name
            ? []
            : [
                  {
                      kind: 'event',
                      rowId: now.event.id,
                      status: 'changed',
                      then: then.event,
                      now: now.event,
                      fields: ['name'],
                  },
              ];
    return [
        ...event,
        ...diffRows('input', then.inputs, now.inputs),
        ...diffRows('key', then.keys, now.keys, STAMP_FIELDS),
    ];
}

// ===== Going back =====

// What turns `now` into `then`: the rows to write (added or changed since) and the ones to
// remove (added since). Rows keep their ids.
export function restoreSteps(then: EventState, now: EventState): VersionSteps {
    const steps: VersionSteps = {
        eventName: then.event.name === now.event.name ? null : then.event.name,
        upsertInputs: [],
        deleteInputs: [],
        upsertKeys: [],
        deleteKeys: [],
    };
    for (const diff of diffStates(then, now)) {
        const remove = diff.status === 'added';
        if (diff.kind === 'input') {
            if (remove) steps.deleteInputs.push(diff.rowId);
            else steps.upsertInputs.push(diff.then as InputRow);
        } else if (diff.kind === 'key') {
            if (remove) steps.deleteKeys.push(diff.rowId);
            else steps.upsertKeys.push(diff.then as KeyRow);
        }
    }
    return steps;
}

// Whether the steps do anything.
export function stepCount(steps: VersionSteps): number {
    return (
        (steps.eventName === null ? 0 : 1) +
        steps.upsertInputs.length +
        steps.deleteInputs.length +
        steps.upsertKeys.length +
        steps.deleteKeys.length
    );
}
