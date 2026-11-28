// The History screens' words and grouping, as pure functions: a list of changes in, plain lines
// out. Nothing here reads the page, so each can be checked by calling it. These are admin
// screens, so the wording can be technical but must be clear. A stream key is never written
// out: it is only ever in the data, and the compare view shows it hidden until asked.

import type { ChangeView, RowDiff, RowSnapshot } from '../../supabase/functions/_shared/types.ts';
import { formatWhen } from './format.ts';

// Changes by the same person to the same event within this long fold into one line.
export const FOLD_MS = 10 * 60 * 1000;

// ===== Grouping =====

// Everything one request changed: a restore's rows share a `batch`, and the rows of any other
// request (a reorder moves several inputs) share who, when and where. A version of an event is
// "right after" an operation, never in the middle of one, so it is the version of its last row.
export interface Operation {
    key: string;
    // Oldest first, as they were made.
    changes: ChangeView[];
    // The id of the last change: the version of the event right after this operation.
    version: number;
    at: string;
    by: string;
    event: string | null;
    eventName: string;
    restore: boolean;
}

// `changes` are newest first, as the server sends them.
export function groupOperations(changes: ChangeView[]): Operation[] {
    const operations: Operation[] = [];
    for (const change of changes) {
        const key = change.batch ?? `${change.by}|${change.at}|${change.event ?? ''}`;
        const last = operations[operations.length - 1];
        if (last && last.key === key) {
            last.changes.unshift(change);
            continue;
        }
        operations.push({
            key,
            changes: [change],
            version: change.id,
            at: change.at,
            by: change.by,
            event: change.event,
            eventName: change.eventName,
            restore: change.batch !== null,
        });
    }
    return operations;
}

// One line of the list: one operation, or several by the same person in the same event.
export interface Line {
    key: string;
    // Newest first.
    operations: Operation[];
}

// A restore is always a line of its own, and so is a change that is not in an event.
export function foldOperations(operations: Operation[], windowMs = FOLD_MS): Line[] {
    const lines: Line[] = [];
    for (const operation of operations) {
        const line = lines[lines.length - 1];
        const newest = line?.operations[0];
        const folds =
            line &&
            newest &&
            !operation.restore &&
            !newest.restore &&
            operation.event !== null &&
            operation.event === newest.event &&
            operation.by === newest.by &&
            Date.parse(newest.at) - Date.parse(operation.at) <= windowMs;
        if (folds) line.operations.push(operation);
        else lines.push({ key: operation.key, operations: [operation] });
    }
    return lines;
}

// Lines under a heading for their day ("Today", "Tue 18 Nov"), in order.
export function groupByDay<T>(
    items: T[],
    atOf: (item: T) => string,
    label: (iso: string) => string,
): { day: string; items: T[] }[] {
    const days: { day: string; items: T[] }[] = [];
    for (const item of items) {
        const day = label(atOf(item));
        const last = days[days.length - 1];
        if (last && last.day === day) last.items.push(item);
        else days.push({ day, items: [item] });
    }
    return days;
}

// ===== Words =====

// "ravi" for ravi@example.org: short in a list, the full address is in the line's tooltip.
export function who(email: string): string {
    return email.split('@')[0] || email;
}

const quote = (name: unknown) => `“${String(name ?? '')}”`;

// "a", "a and b", "a, b and c".
function listOf(items: string[]): string {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export const KEY_FIELD_LABELS: Record<string, string> = {
    name: 'name',
    input: 'input',
    platform: 'platform',
    streamKey: 'stream key',
    backupPlatform: 'backup platform',
    backupStreamKey: 'backup stream key',
    link: 'watch link',
    remarks: 'notes',
};

export const ROLE_FIELD_LABELS: Record<string, string> = {
    email: 'email',
    type: 'role',
    input: 'input',
};

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// The fields of a row that differ, among the ones that matter.
function changedLabels(
    before: RowSnapshot | null,
    after: RowSnapshot | null,
    labels: Record<string, string>,
): string[] {
    return Object.keys(labels)
        .filter((field) => !same(before?.[field], after?.[field]))
        .map((field) => labels[field]);
}

// What one change did, without who and where: "deleted “Instagram English”".
export function describeChange(change: ChangeView): string {
    const { before, after } = change;
    const name = quote(change.rowName);
    switch (change.kind) {
        case 'event':
            if (change.action === 'added') return `added the event ${name}`;
            if (change.action === 'deleted') return `deleted the event ${name}`;
            if (change.action === 'restored') return `brought back the event ${name}`;
            return `renamed the event ${quote(before?.name)} to ${name}`;
        case 'input':
            if (change.action === 'added') return `added the input ${name}`;
            if (change.action === 'deleted') return `deleted the input ${name}`;
            if (before?.name !== after?.name) {
                return `renamed the input ${quote(before?.name)} to ${name}`;
            }
            return `moved the input ${name}`;
        case 'key': {
            if (change.action === 'added') return `added ${name}`;
            if (change.action === 'deleted') return `deleted ${name}`;
            const fields = changedLabels(before, after, KEY_FIELD_LABELS);
            if (fields.length === 1 && fields[0] === 'name') {
                return `renamed ${quote(before?.name)} to ${name}`;
            }
            return `changed the ${listOf(fields)} of ${name}`;
        }
        case 'role': {
            const email = String(change.rowName);
            if (change.action === 'added') return `gave ${email} ${after?.type} access`;
            if (change.action === 'deleted') return `removed ${email}'s access`;
            const fields = changedLabels(before, after, ROLE_FIELD_LABELS);
            return `changed the ${listOf(fields)} of ${email}'s access`;
        }
        default:
            return change.action === 'added'
                ? `added ${change.rowName} as an admin`
                : `removed ${change.rowName} as an admin`;
    }
}

// What a version restore went back to: "18 Nov, 3:42 pm", or "the start of history".
export function describeRestoreTarget(change: ChangeView, nowMs = Date.now()): string {
    if (change.restoredToAt) return formatWhen(change.restoredToAt, nowMs);
    return change.restoredTo === 0 ? 'the start of history' : 'an earlier version';
}

// A name for the event, for a line that says where.
function inEvent(operation: Operation, show: boolean): string {
    return show && operation.event ? ` in ${operation.eventName || 'a deleted event'}` : '';
}

// What one operation did, after the name of who did it: "deleted “Instagram English”". With
// `showEvent`, it says which event as well (the list of every event needs it, one event's
// timeline does not).
export function describeOperation(
    operation: Operation,
    showEvent: boolean,
    nowMs = Date.now(),
): string {
    const [first] = operation.changes;
    if (operation.restore) {
        const event = operation.eventName || 'the event';
        return `restored ${event} to ${describeRestoreTarget(first, nowMs)}`;
    }
    if (operation.changes.length === 1)
        return describeChange(first) + inEvent(operation, showEvent);
    // Several rows of one request: only a reorder does this.
    if (operation.changes.every((c) => c.kind === 'input' && c.action === 'edited')) {
        return `reordered the inputs${inEvent(operation, showEvent)}`;
    }
    return `made ${operation.changes.length} changes${inEvent(operation, showEvent)}`;
}

// A line of the list: its one operation, or a count when several were folded together.
export function describeLine(line: Line, showEvent: boolean, nowMs = Date.now()): string {
    if (line.operations.length === 1) {
        return describeOperation(line.operations[0], showEvent, nowMs);
    }
    const changes = line.operations.flatMap((o) => o.changes);
    const where = inEvent(line.operations[0], showEvent);
    const only = (kind: string) => changes.every((c) => c.kind === kind);
    if (only('key')) return `changed ${changes.length} destinations${where}`;
    if (only('role')) return `changed ${changes.length} people's access${where}`;
    return `made ${line.operations.length} changes${where}`;
}

// ===== Differences =====

// How many rows were added, deleted or changed since: "2 added, 1 deleted, 3 changed since".
export function summarizeDiff(diff: RowDiff[]): string {
    if (diff.length === 0) return 'Same as it is now';
    const count = (status: RowDiff['status']) => diff.filter((d) => d.status === status).length;
    const parts = (['added', 'deleted', 'changed'] as const)
        .filter((status) => count(status) > 0)
        .map((status) => `${count(status)} ${status}`);
    return `${parts.join(', ')} since`;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

// What restoring would do, for the question before it: "Destinations: 2 removed, 1 brought
// back and 3 changed; 1 input will change." Destinations are counted; inputs and the name
// follow. People's access is not part of a version, so a restore never changes it.
export function describeRestoreEffect(diff: RowDiff[]): string {
    const of = (kind: RowDiff['kind'], status: RowDiff['status']) =>
        diff.filter((d) => d.kind === kind && d.status === status).length;
    const parts: string[] = [];
    const keys = {
        removed: of('key', 'added'),
        back: of('key', 'deleted'),
        changed: of('key', 'changed'),
    };
    const keyParts = [
        keys.removed ? `${keys.removed} removed` : '',
        keys.back ? `${keys.back} brought back` : '',
        keys.changed ? `${keys.changed} changed` : '',
    ].filter(Boolean);
    if (keyParts.length) parts.push(`destinations: ${listOf(keyParts)}`);
    const inputs = diff.filter((d) => d.kind === 'input').length;
    if (inputs) parts.push(`${plural(inputs, 'input')} will change`);
    if (diff.some((d) => d.kind === 'event')) parts.push('the event will be renamed');
    if (parts.length === 0) return 'Nothing will change.';
    const sentence = parts.join('; ');
    return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}
