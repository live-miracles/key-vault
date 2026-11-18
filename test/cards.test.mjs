import assert from 'node:assert/strict';
import test from 'node:test';

import {
    inputDotHtml,
    inputLabelHtml,
    keyNoteTextHtml,
    keyStatusPillHtml,
    renderCard,
    renderDestinationList,
    renderLastEdit,
    statusPillsHtml,
} from '../frontend/src/cards.ts';
import { summarizeKeyStatuses } from '../frontend/src/overview.ts';

test('a card says who last added or edited the destination, when that is known', () => {
    const at = '2026-11-17T15:42:00';

    const edited = renderLastEdit({
        updatedBy: 'ann@example.test',
        updatedAction: 'edited',
        updatedAt: at,
    });
    assert.match(edited, /title="Edited by ann@example\.test, /);
    assert.match(
        renderLastEdit({ updatedBy: 'ann@example.test', updatedAction: 'added', updatedAt: at }),
        /title="Added by ann@example\.test, /,
    );

    // Made before this was recorded, or still being saved: nothing to say.
    assert.equal(renderLastEdit({ updatedBy: '', updatedAction: '', updatedAt: '' }), '');
    assert.equal(renderLastEdit({ name: 'Pending' }), '');
    // An email is text, never markup.
    assert.doesNotMatch(
        renderLastEdit({
            updatedBy: '<b>x</b>@example.test',
            updatedAction: 'edited',
            updatedAt: at,
        }),
        /<b>/,
    );
});

const event = {
    id: 'e1',
    name: 'Event',
    can: { seeTechnicalStatus: false },
};
const data = (extra = {}) => ({
    events: [event],
    inputs: [
        { id: 'i1', event: 'e1', name: 'Hindi', position: 1 },
        { id: 'i2', event: 'e1', name: 'Tamil', position: 2 },
    ],
    keys: [],
    roles: [],
    ...extra,
});
const key = (extra = {}) => ({
    id: 'k1',
    event: 'e1',
    name: 'YouTube <Hindi>',
    input: 'i1',
    platform: 'yt',
    streamKey: 'abcd-1234',
    backupPlatform: '',
    backupStreamKey: '',
    link: 'https://example.test/watch',
    remarks: '',
    updatedBy: '',
    updatedAction: '',
    updatedAt: '',
    canChange: true,
    ...extra,
});
const NOW = Date.parse('2026-11-16T10:00:00Z');
const errorStatus = {
    state: 'error',
    side: 'main',
    message: 'Connection refused',
    failures: 0,
    stoppedAfterFailures: false,
    sinceMs: 0,
    pipeline: 'Hindi',
    output: 'YouTube',
    inputMismatch: false,
};
const ctx = (extra = {}) => ({ data: data(), report: null, nowMs: NOW, ...extra });

test('a card shows the name as text, the links as words, and the tools only to those who may', () => {
    const html = renderCard(key(), [key()], ctx());
    assert.match(html, /YouTube &lt;Hindi&gt;/);
    assert.doesNotMatch(html, /<Hindi>/);
    // The addresses are never printed; hover and copy have them.
    assert.doesNotMatch(html, />rtmp:\/\//);
    assert.match(html, /Main<\/span>/);
    assert.match(html, /Backup<\/span>/);
    assert.match(html, /href="https:\/\/example\.test\/watch"/);
    assert.match(html, /data-action="edit-key-by-id"/);

    const readOnly = renderCard(key({ canChange: false }), [key()], ctx());
    assert.doesNotMatch(readOnly, /edit-key-by-id|delete-key-by-id/);

    const pending = renderCard(key({ pending: true }), [key()], ctx());
    assert.match(pending, /Saving/);
    assert.doesNotMatch(pending, /edit-key-by-id|copy-text/);
});

test('a card shows a dot before Main and before Backup, and none before a link that is not there', () => {
    const withBackup = key({ backupPlatform: 'rtmp', backupStreamKey: 'rtmp://b.test/live/k' });
    const sides = { main: 'running', backup: 'stopped' };
    const report = {
        online: true,
        instances: [],
        inputs: { i1: { status: 'running', message: '', sinceMs: 0, pipeline: 'Hindi' } },
        keys: { k1: { ...errorStatus, state: 'running', sides } },
    };
    const html = renderCard(withBackup, [withBackup], ctx({ report }));
    assert.match(html, /input-dot-running[^>]*title="Main: Live"/);
    assert.match(html, /input-dot-stopped[^>]*title="Backup: Not sending"/);

    // No report: nothing is claimed. Saving: no dots either.
    assert.doesNotMatch(renderCard(withBackup, [withBackup], ctx()), /input-dot/);
    assert.doesNotMatch(
        renderCard({ ...withBackup, pending: true }, [withBackup], ctx({ report })),
        /input-dot/,
    );
});

test('a card for a destination in trouble says what to try, and admins also get bunryu’s own report', () => {
    const report = { online: true, instances: [], inputs: {}, keys: { k1: errorStatus } };
    const editor = renderCard(key(), [key()], ctx({ report }));
    assert.match(editor, /status-error/);
    assert.match(editor, /tint-error/);
    assert.match(editor, /Could not reach the platform/);
    assert.match(editor, /Copy error details/);
    // The editor's hover is the note, not the encoder's words.
    assert.doesNotMatch(editor, /title="Error • /);

    const admin = {
        ...data(),
        events: [{ ...event, can: { seeTechnicalStatus: true } }],
    };
    assert.match(
        renderCard(key(), [key()], ctx({ report, data: admin })),
        /title="Error • Hindi → YouTube • Connection refused"/,
    );
});

test('a link another destination uses turns red and adds a warning line', () => {
    const other = key({ id: 'k2', name: 'Copy', input: 'i2' });
    const html = renderCard(key(), [key(), other], ctx());
    assert.match(html, /dest-card-warning/);
    assert.match(html, /“Copy” \(Tamil\)/);
    assert.match(html, /dest-link-name text-error/);
});

test('under All the cards are split into one section per input, in the given order', () => {
    const keys = [
        key({ id: 'k1', input: 'i1' }),
        key({ id: 'k2', input: 'i1', streamKey: 'zzzz' }),
        key({ id: 'k3', input: 'i2', streamKey: 'yyyy' }),
    ];
    const grouped = renderDestinationList(keys, keys, true, ctx());
    assert.equal((grouped.match(/<section class="dest-section"/g) || []).length, 2);
    assert.match(grouped, /dest-section-count">2</);

    const flat = renderDestinationList([keys[2]], keys, false, ctx());
    assert.doesNotMatch(flat, /dest-section/);
});

test('an input in trouble has a banner at the top of its section', () => {
    const report = {
        online: true,
        instances: [],
        keys: {},
        inputs: { i1: { status: 'error', message: '', sinceMs: 0, pipeline: 'Hindi' } },
    };
    const keys = [key()];
    const html = renderDestinationList(keys, keys, true, ctx({ report }));
    assert.match(html, /input-banner-error/);
    assert.match(html, /Nothing is arriving on input “Hindi”/);
    assert.match(html, /input-dot-error/);
});

test('pills count destinations by state, and a missing input is flagged', () => {
    const pills = statusPillsHtml({
        total: 4,
        running: 2,
        warning: 0,
        error: 1,
        stopped: 0,
        unreported: 1,
    });
    assert.match(pills, /status-error[^>]*>1</);
    assert.match(pills, /status-running[^>]*>2</);
    assert.doesNotMatch(pills, /status-warning/);

    assert.equal(inputLabelHtml(data(), 'i1'), 'Hindi');
    assert.match(inputLabelHtml(data(), 'gone'), /Input not found/);

    assert.match(keyStatusPillHtml(null, true), /Saving/);
    assert.equal(keyStatusPillHtml(null), '');
    assert.equal(keyNoteTextHtml({ state: 'running', label: 'Live', text: '', copy: '' }), '');
});

test('destinations of an input that is off count as unreported, not as errors', () => {
    const now = Date.parse('2026-11-16T10:00:00Z');
    const off = { status: 'error', message: '', sinceMs: now - 11 * 60000, pipeline: 'Hindi' };
    const report = {
        online: true,
        instances: [],
        keys: { k1: { state: 'error', inputMismatch: false } },
        inputs: { i1: off },
    };
    const summary = summarizeKeyStatuses([{ id: 'k1', input: 'i1' }], report, now);
    assert.equal(summary.error, 0);
    assert.equal(summary.unreported, 1);
    assert.match(inputDotHtml('i1', report, now), /input-dot-stopped/);
});
