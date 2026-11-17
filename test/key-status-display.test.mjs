import assert from 'node:assert/strict';
import test from 'node:test';

import { loadFrontendScripts } from './frontend-harness.mjs';

const runtime = loadFrontendScripts(['frontend/src/utils.ts', 'frontend/src/keys.ts']);
const getKeyDisplay = runtime.get('getKeyDisplay');
const getKeyStatus = runtime.get('getKeyStatus');
const KEY_COLORS = runtime.get('KEY_COLORS');

const status = (state, extra = {}) => ({
    status: state,
    message: '',
    failures: 0,
    stoppedAfterFailures: false,
    pipeline: 'Hindi',
    output: 'YouTube',
    ...extra,
});
const report = (keys) => ({ online: true, instances: [], keys });
const key = (extra = {}) => ({ id: 'K1', color: '', ...extra });

test('a key with no status and no manual color has no color', () => {
    const { color, title } = getKeyDisplay(key(), report({}));
    assert.equal(color.bgCss, '');
    assert.equal(title, '');
    assert.equal(getKeyDisplay(key(), undefined).color.bgCss, '');
});

test('each reported status gets its own color and an explanation', () => {
    const cases = {
        running: 'tint-running',
        warning: 'tint-warning',
        error: 'tint-error',
        stopped: 'tint-configured',
    };
    for (const [state, css] of Object.entries(cases)) {
        const { color, title } = getKeyDisplay(
            key(),
            report({ K1: { main: status(state), backup: null } }),
        );
        assert.equal(color.bgCss, css, state);
        assert.match(title, /Hindi → YouTube/);
    }
});

test('the worse of main and backup decides', () => {
    const entry = { main: status('running'), backup: status('error', { message: 'refused' }) };
    assert.equal(getKeyStatus(key(), report({ K1: entry })).status, 'error');
    assert.equal(
        getKeyStatus(key(), report({ K1: { main: status('stopped'), backup: status('running') } }))
            .status,
        'running',
    );
    assert.equal(getKeyStatus(key(), report({ K1: { main: null, backup: null } })), null);
});

test('an error that stopped the output says how many attempts failed', () => {
    const { title } = getKeyDisplay(
        key(),
        report({
            K1: {
                main: status('error', {
                    stoppedAfterFailures: true,
                    failures: 5,
                    message: 'Connection refused',
                }),
                backup: null,
            },
        }),
    );
    assert.match(title, /stopped after 5 failed attempts/);
    assert.match(title, /Connection refused/);
});

const describeKeyNote = runtime.get('describeKeyNote');
const NOW = Date.parse('2026-11-16T10:00:00Z');
const liveKey = key({ server: 'yt', key: 'abcd-1234' });

test('a known error is explained in the media team’s words, without the raw text', () => {
    const cases = [
        ['server returned 403 forbidden', /did not accept the stream key/],
        ['Connection refused', /Could not reach the platform/],
        ['Input/output error', /closed the connection/],
        ['SRT connection setup failure', /SRT link was rejected/],
        ['Output is falling behind live', /slowly/],
    ];
    for (const [message, expected] of cases) {
        const note = describeKeyNote(
            liveKey,
            report({ K1: { main: status('error', { message }), backup: null } }),
            NOW,
        );
        assert.equal(note.state, 'error');
        assert.equal(note.label, 'Problem');
        assert.match(note.text, expected, message);
        assert.ok(!note.text.includes(message), message);
    }
});

test('an error nobody has advice for gets a plain generic line and a copyable detail', () => {
    const note = describeKeyNote(
        liveKey,
        report({
            K1: { main: status('error', { message: 'ffmpeg exited 1' }), backup: null },
        }),
        NOW,
    );
    assert.match(note.text, /stream key/);
    assert.doesNotMatch(note.text, /ffmpeg/i);
    assert.equal(note.copy, 'Destination (main stream) | Hindi → YouTube | ffmpeg exited 1');
    const warning = describeKeyNote(
        liveKey,
        report({ K1: { main: status('warning'), backup: null } }),
        NOW,
    );
    assert.match(warning.text, /not smoothly/);
    // Nothing to copy when bunryu sent no message.
    assert.equal(warning.copy, '');
});

test('the note says when it is the backup that has the problem, and when bunryu gave up', () => {
    const note = describeKeyNote(
        liveKey,
        report({
            K1: {
                main: status('running'),
                backup: status('error', {
                    message: 'Connection refused',
                    stoppedAfterFailures: true,
                    failures: 5,
                }),
            },
        }),
        NOW,
    );
    assert.match(
        note.text,
        /^Backup stream: Gave up after 5 failed attempts. Could not reach the platform/,
    );
});

test('a running stream says for how long, and a stopped one says it is not sending', () => {
    const running = describeKeyNote(
        liveKey,
        report({
            K1: { main: status('running', { sinceMs: NOW - 10 * 60000 }), backup: null },
        }),
        NOW,
    );
    assert.deepEqual([running.label, running.text], ['Live', 'for 10 min']);
    const stopped = describeKeyNote(
        liveKey,
        report({ K1: { main: status('stopped'), backup: null } }),
        NOW,
    );
    assert.equal(stopped.label, 'Not sending');
});

test('a link bunryu does not know is "not set up yet", but only while bunryu is reporting', () => {
    const note = describeKeyNote(liveKey, report({ K1: { main: null, backup: null } }), NOW);
    assert.equal(note.label, 'Not set up yet');
    assert.match(note.text, /old one/);
    // bunryu offline or never connected: nothing can be said about any stream.
    assert.equal(describeKeyNote(liveKey, { ...report({}), online: false }, NOW), null);
    assert.equal(describeKeyNote(liveKey, undefined, NOW), null);
    // A stream with no link yet has nothing for bunryu to know.
    assert.equal(describeKeyNote(key(), report({}), NOW), null);
});

const describeInputBanner = runtime.get('describeInputBanner');
const getInputStatus = runtime.get('getInputStatus');

const inputReport = (inputs, keys = {}) => ({ online: true, instances: [], keys, inputs });
const inputState = (state) => ({ status: state, message: '', sinceMs: 0, pipeline: 'Hindi' });

test('a stream whose link runs in another input is told to check the input', () => {
    const wrong = report({
        K1: {
            main: status('running', { pipeline: 'Tamil', inputMismatch: true }),
            backup: null,
        },
    });
    const note = describeKeyNote(liveKey, wrong, NOW, 'Hindi');
    assert.equal(note.label, 'Check input');
    assert.equal(note.state, 'warning');
    assert.match(note.text, /under “Tamil”, but this destination is for “Hindi”/);
    // A problem keeps its own label and gets the same sentence in front of the advice.
    const broken = describeKeyNote(
        liveKey,
        report({
            K1: {
                main: status('error', {
                    message: 'Connection refused',
                    pipeline: 'Tamil',
                    inputMismatch: true,
                }),
                backup: null,
            },
        }),
        NOW,
        'Hindi',
    );
    assert.equal(broken.label, 'Problem');
    assert.match(broken.text, /One of them is wrong. Could not reach the platform/);
});

test('when the input is not arriving, a failing stream is not blamed on the platform', () => {
    const broken = {
        ...inputReport(
            { L1: inputState('error') },
            {
                K1: { main: status('error', { message: 'Connection refused' }), backup: null },
            },
        ),
    };
    const note = describeKeyNote({ ...liveKey, input: 'L1' }, broken, NOW, 'Hindi');
    assert.match(note.text, /input “Hindi” is not arriving/);
    assert.match(note.text, /not a problem with the platform/);
    assert.doesNotMatch(note.text, /Could not reach/);
    // A healthy input leaves the platform advice alone.
    const fine = { ...broken, inputs: { L1: inputState('running') } };
    assert.match(
        describeKeyNote({ ...liveKey, input: 'L1' }, fine, NOW, 'Hindi').text,
        /Could not reach the platform/,
    );
});

test('the input banner only appears for an input in trouble, and only while bunryu reports', () => {
    const banner = (state, online = true) =>
        describeInputBanner('L1', 'Hindi', { ...inputReport({ L1: inputState(state) }), online });
    assert.equal(banner('error').label, 'Not arriving');
    assert.match(banner('error').text, /Nothing is arriving on input “Hindi”/);
    assert.equal(banner('warning').label, 'Unstable');
    assert.equal(banner('running'), null);
    assert.equal(banner('stopped'), null);
    assert.equal(banner('error', false), null);
    assert.equal(describeInputBanner('L1', 'Hindi', inputReport({})), null);
    assert.equal(getInputStatus('L1', inputReport({ L1: null })), null);
});

test('a color stored on the key is ignored: only the reported status colors a row', () => {
    const running = report({ K1: { main: status('running'), backup: null } });
    const { color, title } = getKeyDisplay(key({ color: KEY_COLORS.WARNING }), running);
    assert.equal(color.bgCss, 'tint-running');
    assert.doesNotMatch(title, /by hand/i);
    assert.equal(getKeyDisplay(key({ color: KEY_COLORS.ERROR }), report({})).color.bgCss, '');
});
