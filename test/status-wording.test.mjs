import assert from 'node:assert/strict';
import test from 'node:test';

import {
    describeInputBanner,
    describeKeyNote,
    describeSide,
    getInputStatus,
    getKeyDisplay,
    reportedStatus,
    INPUT_OFF_AFTER_MS,
} from '../frontend/src/status-wording.ts';

// What the server sends for a destination (see supabase/functions/_shared/status.ts).
const status = (state, extra = {}) => ({
    state,
    side: 'main',
    message: '',
    failures: 0,
    stoppedAfterFailures: false,
    sinceMs: 0,
    pipeline: 'Hindi',
    output: 'YouTube',
    inputMismatch: false,
    ...extra,
});
const report = (keys, extra = {}) => ({ online: true, instances: [], keys, inputs: {}, ...extra });
const key = (extra = {}) => ({ id: 'K1', input: 'L1', name: 'Destination', ...extra });
const NOW = Date.parse('2026-11-16T10:00:00Z');

test('a destination bunryu does not report on has no color', () => {
    assert.deepEqual(getKeyDisplay(key(), report({})), { tint: '', title: '' });
    assert.deepEqual(getKeyDisplay(key(), undefined), { tint: '', title: '' });
    // Not set up is not a status of a stream.
    const unset = report({ K1: status('not_configured') });
    assert.deepEqual(getKeyDisplay(key(), unset), { tint: '', title: '' });
    assert.equal(reportedStatus(unset, 'K1'), null);
});

test('each reported status gets its own color and an explanation', () => {
    const cases = {
        running: 'tint-running',
        warning: 'tint-warning',
        error: 'tint-error',
        stopped: 'tint-configured',
    };
    for (const [state, tint] of Object.entries(cases)) {
        const display = getKeyDisplay(key(), report({ K1: status(state) }));
        assert.equal(display.tint, tint, state);
        assert.match(display.title, /Hindi → YouTube/);
    }
});

test('an error that stopped the output says how many attempts failed', () => {
    const { title } = getKeyDisplay(
        key(),
        report({
            K1: status('error', {
                stoppedAfterFailures: true,
                failures: 5,
                message: 'Connection refused',
            }),
        }),
    );
    assert.match(title, /stopped after 5 failed attempts/);
    assert.match(title, /Connection refused/);
});

test('a known error is explained in the media team’s words, without the raw text', () => {
    const cases = [
        ['server returned 403 forbidden', /did not accept the stream key/],
        ['Connection refused', /Could not reach the platform/],
        ['Input/output error', /closed the connection/],
        ['SRT connection setup failure', /SRT link was rejected/],
        ['Output is falling behind live', /slowly/],
    ];
    for (const [message, expected] of cases) {
        const note = describeKeyNote(key(), report({ K1: status('error', { message }) }), NOW);
        assert.equal(note.state, 'error');
        assert.equal(note.label, 'Problem');
        assert.match(note.text, expected, message);
        assert.ok(!note.text.includes(message), message);
    }
});

test('an error nobody has advice for gets a plain generic line and a copyable detail', () => {
    const note = describeKeyNote(
        key({ name: undefined }),
        report({ K1: status('error', { message: 'ffmpeg exited 1' }) }),
        NOW,
    );
    assert.match(note.text, /stream key/);
    assert.doesNotMatch(note.text, /ffmpeg/i);
    assert.equal(note.copy, 'Destination (main stream) | Hindi → YouTube | ffmpeg exited 1');

    const warning = describeKeyNote(key(), report({ K1: status('warning') }), NOW);
    assert.match(warning.text, /not smoothly/);
    // Nothing to copy when bunryu sent no message.
    assert.equal(warning.copy, '');
});

test('the note says when it is the backup that has the problem, and when bunryu gave up', () => {
    const note = describeKeyNote(
        key(),
        report({
            K1: status('error', {
                side: 'backup',
                message: 'Connection refused',
                stoppedAfterFailures: true,
                failures: 5,
            }),
        }),
        NOW,
    );
    assert.match(
        note.text,
        /^Backup stream: Gave up after 5 failed attempts. Could not reach the platform/,
    );
    assert.match(note.copy, /\(backup stream\)/);
});

test('a running stream keeps for how long out of sight, and a stopped one says it is not sending', () => {
    const running = describeKeyNote(
        key(),
        report({ K1: status('running', { sinceMs: NOW - 10 * 60000 }) }),
        NOW,
    );
    // How long it has been live is kept for the label's hover, not printed on the card.
    assert.deepEqual([running.label, running.text, running.detail], ['Live', '', 'for 10 min']);
    const stopped = describeKeyNote(key(), report({ K1: status('stopped') }), NOW);
    assert.equal(stopped.label, 'Not sending');
});

test('a link bunryu does not know is "not set up yet", but only while bunryu is reporting', () => {
    const unset = report({ K1: status('not_configured') });
    const note = describeKeyNote(key(), unset, NOW);
    assert.equal(note.label, 'Not set up yet');
    assert.match(note.text, /old one/);
    // bunryu offline or never connected: nothing can be said about any destination.
    assert.equal(describeKeyNote(key(), { ...unset, online: false }, NOW), null);
    assert.equal(describeKeyNote(key(), undefined, NOW), null);
    // A destination with no link has nothing for bunryu to know: the server sends no entry.
    assert.equal(describeKeyNote(key(), report({ K1: null }), NOW), null);
    assert.equal(describeKeyNote(key(), report({}), NOW), null);
});

test('a destination whose link runs in another input is told to check the input', () => {
    const wrong = report({
        K1: status('running', { pipeline: 'Tamil', inputMismatch: true }),
    });
    const note = describeKeyNote(key(), wrong, NOW, 'Hindi');
    assert.equal(note.label, 'Check input');
    assert.equal(note.state, 'warning');
    assert.match(note.text, /under “Tamil”, but this destination is for “Hindi”/);

    // A problem keeps its own label and gets the same sentence in front of the advice.
    const broken = describeKeyNote(
        key(),
        report({
            K1: status('error', {
                message: 'Connection refused',
                pipeline: 'Tamil',
                inputMismatch: true,
            }),
        }),
        NOW,
        'Hindi',
    );
    assert.equal(broken.label, 'Problem');
    assert.match(broken.text, /One of them is wrong. Could not reach the platform/);
});

const inputState = (state) => ({ status: state, message: '', sinceMs: 0, pipeline: 'Hindi' });

test('when the input is not arriving, a failing destination is not blamed on the platform', () => {
    const keys = { K1: status('error', { message: 'Connection refused' }) };
    const broken = report(keys, { inputs: { L1: inputState('error') } });
    const note = describeKeyNote(key(), broken, NOW, 'Hindi');
    assert.match(note.text, /input “Hindi” is not arriving/);
    assert.match(note.text, /not a problem with the platform/);
    assert.doesNotMatch(note.text, /Could not reach/);
    // A healthy input leaves the platform advice alone.
    const fine = report(keys, { inputs: { L1: inputState('running') } });
    assert.match(describeKeyNote(key(), fine, NOW, 'Hindi').text, /Could not reach the platform/);
});

test('the input banner only appears for an input in trouble, and only while bunryu reports', () => {
    const banner = (state, online = true) =>
        describeInputBanner(
            'L1',
            'Hindi',
            report({}, { inputs: { L1: inputState(state) }, online }),
        );
    assert.equal(banner('error').label, 'Not arriving');
    assert.match(banner('error').text, /Nothing is arriving on input “Hindi”/);
    assert.equal(banner('warning').label, 'Unstable');
    assert.equal(banner('running'), null);
    assert.equal(banner('stopped'), null);
    assert.equal(banner('error', false), null);
    assert.equal(describeInputBanner('L1', 'Hindi', report({})), null);
    assert.equal(getInputStatus('L1', report({}, { inputs: { L1: null } })), null);
});

const OFF = {
    status: 'error',
    message: '',
    sinceMs: NOW - INPUT_OFF_AFTER_MS - 1,
    pipeline: 'Hindi',
};

test('an input with no signal for a long time is off, so its destinations are "not started yet"', () => {
    for (const state of ['error', 'warning', 'stopped']) {
        const idle = report(
            { K1: status(state, { message: 'Connection refused' }) },
            { inputs: { L1: OFF } },
        );
        const note = describeKeyNote(key(), idle, NOW, 'Hindi');
        assert.equal(note.label, 'Not started yet', state);
        assert.equal(note.state, 'none', state);
        assert.doesNotMatch(note.text, /not arriving|Gave up|stream key/i, state);
        assert.equal(getKeyDisplay(key(), idle, NOW).tint, '', state);
    }
    // A stream that is live is never called not started.
    const live = report({ K1: status('running') }, { inputs: { L1: OFF } });
    assert.equal(describeKeyNote(key(), live, NOW, 'Hindi').label, 'Live');
    // The input shows as idle and raises no banner.
    assert.equal(getInputStatus('L1', report({}, { inputs: { L1: OFF } }), NOW).status, 'stopped');
    assert.equal(
        describeInputBanner('L1', 'Hindi', report({}, { inputs: { L1: OFF } }), NOW),
        null,
    );
    // An input bunryu itself calls stopped counts the same.
    const stoppedInput = report({ K1: status('error') }, { inputs: { L1: inputState('stopped') } });
    assert.equal(describeKeyNote(key(), stoppedInput, NOW, 'Hindi').label, 'Not started yet');
});

test('an input that has only just lost its signal is still an alarm', () => {
    const recent = { ...OFF, sinceMs: NOW - 2 * 60000 };
    const lost = report(
        { K1: status('error', { message: 'Connection refused' }) },
        { inputs: { L1: recent } },
    );
    assert.equal(getInputStatus('L1', lost, NOW).status, 'error');
    assert.equal(describeInputBanner('L1', 'Hindi', lost, NOW).label, 'Not arriving');
    const note = describeKeyNote(key(), lost, NOW, 'Hindi');
    assert.equal(note.label, 'Problem');
    assert.match(note.text, /not arriving/);
    assert.equal(getKeyDisplay(key(), lost, NOW).tint, 'tint-error');
    // A report that does not say since when is not taken as a long silence.
    const unknown = report({ K1: status('error') }, { inputs: { L1: { ...OFF, sinceMs: 0 } } });
    assert.equal(describeKeyNote(key(), unknown, NOW, 'Hindi').label, 'Problem');
});

test('a link under the wrong input is still said, even when the input is off', () => {
    const wrong = report(
        { K1: status('error', { pipeline: 'Tamil', inputMismatch: true }) },
        { inputs: { L1: OFF } },
    );
    assert.equal(describeKeyNote(key(), wrong, NOW, 'Hindi').label, 'Problem');
});

test('main and backup each get a dot: green, amber, red or grey', () => {
    const r = (sides, extra = {}) =>
        report(
            { K1: status('error', { sides }) },
            { inputs: { L1: { status: 'running' } }, ...extra },
        );
    const sides = { main: 'running', backup: 'error' };
    assert.deepEqual(describeSide(key(), 'main', r(sides), NOW), {
        state: 'running',
        label: 'Main: Live',
    });
    assert.deepEqual(describeSide(key(), 'backup', r(sides), NOW), {
        state: 'error',
        label: 'Backup: Problem',
    });
    assert.equal(
        describeSide(key(), 'main', r({ main: 'warning', backup: null }), NOW).state,
        'warning',
    );
    // Off on purpose, and not given to bunryu yet, are both grey, with their own words.
    const off = r({ main: 'stopped', backup: 'not_configured' });
    assert.deepEqual(describeSide(key(), 'main', off, NOW), {
        state: 'stopped',
        label: 'Main: Not sending',
    });
    assert.deepEqual(describeSide(key(), 'backup', off, NOW), {
        state: 'stopped',
        label: 'Backup: Not set up yet',
    });
});

test('no dot where nothing can be said: no backup, no fresh report, an older server', () => {
    const r = report({ K1: status('running', { sides: { main: 'running', backup: null } }) });
    assert.equal(describeSide(key(), 'backup', r, NOW), null);
    assert.equal(describeSide(key(), 'main', { ...r, online: false }, NOW), null);
    assert.equal(describeSide(key(), 'main', null, NOW), null);
    // An older server sends no sides at all.
    assert.equal(describeSide(key(), 'main', report({ K1: status('running') }), NOW), null);
    assert.equal(describeSide(key(), 'main', report({}), NOW), null);
});

test('a stream waiting for its input to go live is grey, not red', () => {
    const OFF = { status: 'stopped', sinceMs: 0 };
    const sides = { main: 'error', backup: 'error' };
    const r = report({ K1: status('error', { sides }) }, { inputs: { L1: OFF } });
    assert.equal(describeSide(key(), 'main', r, NOW).state, 'stopped');
    assert.equal(describeSide(key(), 'main', r, NOW).label, 'Main: Not started yet');
    // A link under the wrong input is still shown as it is.
    const wrong = report(
        { K1: status('error', { sides, inputMismatch: true }) },
        { inputs: { L1: OFF } },
    );
    assert.equal(describeSide(key(), 'main', wrong, NOW).state, 'error');
});
