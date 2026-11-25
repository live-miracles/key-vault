import assert from 'node:assert/strict';
import test from 'node:test';

import { hashUrl } from '../supabase/functions/_shared/link-hash.ts';
import { streamUrl } from '../supabase/functions/_shared/platforms.ts';
import {
    buildStatusReport,
    FRESH_MS,
    normalizeInputName,
    parseHeartbeat,
} from '../supabase/functions/_shared/status.ts';

const SECRET = 'test-secret';
const NOW = Date.parse('2026-11-13T10:00:00Z');

function heartbeat(overrides = {}) {
    return {
        version: 1,
        instance: 'prod',
        sentAt: '2026-11-13T10:00:00Z',
        outputs: [
            {
                hash: 'a'.repeat(32),
                pipeline: 'Hindi',
                output: 'YouTube',
                status: 'running',
                message: '',
                failures: 0,
                stoppedAfterFailures: false,
                sinceMs: 1,
            },
        ],
        ...overrides,
    };
}

test('parseHeartbeat accepts the documented payload', () => {
    const parsed = parseHeartbeat(heartbeat());
    assert.equal(parsed.instance, 'prod');
    assert.equal(parsed.outputs.length, 1);
    assert.equal(parsed.outputs[0].status, 'running');
});

// bunryu reports under its Server Name, a free-form label whose default is "Bunryu"; a
// capital letter or a space in it must not make Key Vault refuse every report.
test("parseHeartbeat accepts bunryu's Server Name as typed", () => {
    for (const name of ['Bunryu', 'Prod Server', 'prod-2', 'Ashram (Main)']) {
        assert.equal(parseHeartbeat(heartbeat({ instance: name })).instance, name);
    }
    assert.equal(parseHeartbeat(heartbeat({ instance: '  Bunryu  ' })).instance, 'Bunryu');
});

test('parseHeartbeat rejects bad payloads', () => {
    assert.throws(() => parseHeartbeat(null), /JSON object/);
    assert.throws(() => parseHeartbeat(heartbeat({ version: 2 })), /version/);
    assert.throws(() => parseHeartbeat(heartbeat({ instance: '' })), /instance/);
    assert.throws(() => parseHeartbeat(heartbeat({ instance: '   ' })), /instance/);
    assert.throws(() => parseHeartbeat(heartbeat({ instance: 'a'.repeat(81) })), /instance/);
    assert.throws(() => parseHeartbeat(heartbeat({ instance: 'a\nb' })), /instance/);
    assert.throws(() => parseHeartbeat(heartbeat({ sentAt: 'x' })), /sentAt/);
    assert.throws(() => parseHeartbeat(heartbeat({ outputs: 'x' })), /outputs/);
    assert.throws(
        () =>
            parseHeartbeat(
                heartbeat({ outputs: Array.from({ length: 1001 }, () => heartbeat().outputs[0]) }),
            ),
        /more than/,
    );
});

test('parseHeartbeat strips urls and control characters and bounds messages', () => {
    const out = parseHeartbeat(
        heartbeat({
            outputs: [
                {
                    ...heartbeat().outputs[0],
                    message:
                        'failed to open rtmp://a.example/live/SECRET\nnext line ' + 'x'.repeat(500),
                    pipeline: 'Line\u0007bell',
                },
            ],
        }),
    ).outputs[0];
    assert.ok(!out.message.includes('SECRET'));
    assert.ok(!out.message.includes('\n'));
    assert.ok(out.message.length <= 300);
    assert.equal(out.pipeline, 'Line bell');
});

test('parseHeartbeat hides secret parameters that are not inside a URL', () => {
    const out = parseHeartbeat(
        heartbeat({
            outputs: [
                {
                    ...heartbeat().outputs[0],
                    message: 'bad passphrase=hunter2hunter2 and streamKey=abcd-1234 retrying',
                },
            ],
        }),
    ).outputs[0];
    assert.ok(!out.message.includes('hunter2'));
    assert.ok(!out.message.includes('abcd-1234'));
    // The words the advice is matched on are kept.
    assert.match(out.message, /passphrase=<hidden>/);
    assert.match(out.message, /retrying/);
});

const row = (status, extra = {}) => ({
    instance: 'prod',
    hash: 'h',
    pipeline: 'P',
    output: 'O',
    message: '',
    failures: 0,
    stoppedAfterFailures: false,
    sinceMs: 0,
    status,
    ...extra,
});

const dest = (id, extra = {}) => ({
    id,
    platform: 'yt',
    streamKey: 'abcd-1234',
    backupPlatform: '',
    backupStreamKey: '',
    ...extra,
});

test('buildStatusReport takes the worse of main and backup, and says which', async () => {
    const mainHash = await hashUrl(SECRET, streamUrl('yt', 'abcd-1234'));
    const backupHash = await hashUrl(SECRET, 'rtmp://b.rtmp.youtube.com/live2?backup=1/abcd-1234');
    const keys = [dest('K1'), dest('K2', { streamKey: 'unknown-key' })];
    const rows = [
        row('running', { hash: mainHash }),
        row('error', { hash: backupHash, message: 'refused', stoppedAfterFailures: true }),
    ];
    const instances = [{ instance: 'prod', lastSeenAt: new Date(NOW - 30_000).toISOString() }];

    const report = await buildStatusReport(keys, rows, instances, SECRET, NOW);

    assert.equal(report.online, true);
    assert.equal(report.keys.K1.state, 'error');
    assert.equal(report.keys.K1.side, 'backup');
    assert.equal(report.keys.K1.stoppedAfterFailures, true);
    // Each stream keeps its own status, so a card can show main and backup apart.
    assert.deepEqual(report.keys.K1.sides, { main: 'running', backup: 'error' });
    // bunryu has no output with this link: not set up.
    assert.equal(report.keys.K2.state, 'not_configured');
    assert.deepEqual(report.keys.K2.sides, { main: 'not_configured', backup: 'not_configured' });
});

test('each side is reported on its own: a stopped backup, and no backup at all', async () => {
    const mainHash = await hashUrl(SECRET, streamUrl('vc', 'abcd-1234'));
    const backupHash = await hashUrl(SECRET, streamUrl('rtmp', 'rtmp://x.test/live/key'));
    const withBackup = dest('K1', {
        platform: 'vc',
        backupPlatform: 'rtmp',
        backupStreamKey: 'rtmp://x.test/live/key',
    });
    const noBackup = dest('K2', { platform: 'vc' });
    const report = await buildStatusReport(
        [withBackup, noBackup],
        [row('running', { hash: mainHash }), row('stopped', { hash: backupHash })],
        [{ instance: 'prod', lastSeenAt: new Date(NOW - 1000).toISOString() }],
        SECRET,
        NOW,
    );
    assert.deepEqual(report.keys.K1.sides, { main: 'running', backup: 'stopped' });
    // A destination with no backup link has no backup side to show.
    assert.deepEqual(report.keys.K2.sides, { main: 'running', backup: null });
});

test('a healthy main stream outranks a stopped backup, and a destination with no link has no status', async () => {
    const mainHash = await hashUrl(SECRET, streamUrl('vc', 'abcd-1234'));
    const backupHash = await hashUrl(SECRET, streamUrl('rtmp', 'rtmp://x.test/live/key'));
    const keys = [
        dest('K1', {
            platform: 'vc',
            backupPlatform: 'rtmp',
            backupStreamKey: 'rtmp://x.test/live/key',
        }),
        dest('K2', { streamKey: '' }),
    ];
    const report = await buildStatusReport(
        keys,
        [row('running', { hash: mainHash }), row('stopped', { hash: backupHash })],
        [{ instance: 'prod', lastSeenAt: new Date(NOW - 1000).toISOString() }],
        SECRET,
        NOW,
    );
    assert.equal(report.keys.K1.state, 'running');
    assert.equal(report.keys.K1.side, 'main');
    assert.equal(report.keys.K2, null);
});

test('one link used by several outputs shows the worst', async () => {
    const hash = await hashUrl(SECRET, streamUrl('yt', 'abcd-1234'));
    const report = await buildStatusReport(
        [dest('K1')],
        [
            row('warning', { hash }),
            row('error', { hash, instance: 'prod' }),
            row('running', { hash }),
        ],
        [{ instance: 'prod', lastSeenAt: new Date(NOW - 1000).toISOString() }],
        SECRET,
        NOW,
    );
    assert.equal(report.keys.K1.state, 'error');
});

test('names are compared ignoring case and runs of spaces, not the letter s', () => {
    assert.equal(normalizeInputName('  Hindi   Live '), 'hindi live');
    assert.equal(normalizeInputName('Hindi Live'), normalizeInputName('hindi  live'));
    assert.equal(normalizeInputName('Mississippi'), 'mississippi');
});

test('a bunryu that stopped reporting is offline, and what it last did is not shown', async () => {
    const hash = await hashUrl(SECRET, streamUrl('yt', 'abcd-1234'));
    const keys = [dest('K1')];
    const stale = new Date(NOW - FRESH_MS - 1000).toISOString();

    const report = await buildStatusReport(
        keys,
        [row('running', { hash })],
        [{ instance: 'prod', lastSeenAt: stale }],
        SECRET,
        NOW,
    );

    assert.equal(report.online, false);
    assert.equal(report.instances[0].online, false);
    // Its "running" is not repeated: the link is remembered, but as off.
    assert.equal(report.keys.K1.state, 'stopped');
});

// Once bunryu has stopped reporting it is off: nothing it last said about running is shown, but which
// links it had is remembered from its last report.
test('a bunryu that stopped reporting shows every link it knew as stopped, and the rest as not set up', async () => {
    const known = await hashUrl(SECRET, streamUrl('yt', 'abcd-1234'));
    const keys = [dest('K1'), dest('K2', { streamKey: 'new-key' })];
    const stale = new Date(NOW - FRESH_MS - 1000).toISOString();
    const rows = [
        row('running', { hash: known, message: 'was fine', sinceMs: 5, failures: 2 }),
        row('error', { hash: known, stoppedAfterFailures: true, message: 'refused' }),
    ];

    const report = await buildStatusReport(
        keys,
        rows,
        [{ instance: 'prod', lastSeenAt: stale }],
        SECRET,
        NOW,
    );

    assert.equal(report.online, false);
    assert.equal(report.off, true);
    // Known to bunryu: off, with nothing left of the last live state.
    assert.equal(report.keys.K1.state, 'stopped');
    assert.equal(report.keys.K1.message, '');
    assert.equal(report.keys.K1.failures, 0);
    assert.equal(report.keys.K1.stoppedAfterFailures, false);
    // YouTube's backup address has no row in the last report, so it was not set up either.
    assert.deepEqual(report.keys.K1.sides, { main: 'stopped', backup: 'not_configured' });
    // Added after the last report: bunryu has not had it.
    assert.equal(report.keys.K2.state, 'not_configured');
});

test('before any bunryu has reported nothing is off and nothing is claimed', async () => {
    const report = await buildStatusReport([dest('K1')], [], [], SECRET, NOW);
    assert.equal(report.online, false);
    assert.equal(report.off, false);
});

test('a live bunryu is never off, even beside one that went quiet long ago', async () => {
    const hash = await hashUrl(SECRET, streamUrl('yt', 'abcd-1234'));
    const report = await buildStatusReport(
        [dest('K1')],
        [row('running', { hash, instance: 'prod' })],
        [
            { instance: 'dev', lastSeenAt: new Date(NOW - 86_400_000).toISOString() },
            { instance: 'prod', lastSeenAt: new Date(NOW - 1000).toISOString() },
        ],
        SECRET,
        NOW,
    );
    assert.equal(report.off, false);
    assert.equal(report.keys.K1.state, 'running');
});

test('inputs are not remembered when bunryu is off', async () => {
    const report = await buildStatusReport(
        [],
        [],
        [{ instance: 'prod', lastSeenAt: new Date(NOW - FRESH_MS - 1000).toISOString() }],
        SECRET,
        NOW,
        [inputRow('Hindi', 'running')],
        [{ id: 'L1', name: 'Hindi' }],
    );
    assert.equal(report.inputs.L1, null);
});

test('with two instances only the live one counts', async () => {
    const hash = await hashUrl(SECRET, streamUrl('yt', 'abcd-1234'));
    const keys = [dest('K1')];
    const report = await buildStatusReport(
        keys,
        [row('error', { hash, instance: 'dev' }), row('running', { hash, instance: 'prod' })],
        [
            { instance: 'dev', lastSeenAt: new Date(NOW - 3_600_000).toISOString() },
            { instance: 'prod', lastSeenAt: new Date(NOW - 1000).toISOString() },
        ],
        SECRET,
        NOW,
    );
    assert.equal(report.keys.K1.state, 'running');
});

// ---- inputs ----

const inputRow = (pipeline, status, extra = {}) => ({
    instance: 'prod',
    pipeline,
    status,
    message: '',
    sinceMs: 0,
    ...extra,
});

test('parseHeartbeat takes inputs, and treats a missing list as none', () => {
    assert.deepEqual(parseHeartbeat(heartbeat()).inputs, []);
    const parsed = parseHeartbeat(
        heartbeat({
            inputs: [
                {
                    pipeline: 'Hindi',
                    status: 'error',
                    message: 'no signal rtmp://x/y/SECRET',
                    sinceMs: 5,
                },
            ],
        }),
    );
    assert.equal(parsed.inputs[0].pipeline, 'Hindi');
    assert.equal(parsed.inputs[0].status, 'error');
    assert.ok(!parsed.inputs[0].message.includes('SECRET'));
});

test('parseHeartbeat rejects an inputs list that is not a list', () => {
    assert.throws(() => parseHeartbeat(heartbeat({ inputs: 'x' })), /inputs must be/);
    assert.throws(
        () =>
            parseHeartbeat(
                heartbeat({
                    inputs: Array.from({ length: 1001 }, () => ({
                        pipeline: 'Hindi',
                        status: 'running',
                    })),
                }),
            ),
        /more than/,
    );
});

// One unusable entry must not cost every other destination its status.
test('parseHeartbeat leaves out an unusable entry and keeps the rest', () => {
    const good = heartbeat().outputs[0];
    const parsed = parseHeartbeat(
        heartbeat({
            outputs: [
                good,
                { ...good, hash: 'xyz' },
                { ...good, status: 'bad' },
                null,
                'x',
                { ...good, output: '', pipeline: '' },
            ],
            inputs: [
                { pipeline: 'Hindi', status: 'running' },
                { pipeline: '', status: 'running' },
                { pipeline: '   \n ', status: 'running' },
                { pipeline: 'Tamil', status: 'bad' },
                null,
            ],
        }),
    );
    assert.equal(parsed.outputs.length, 2);
    assert.equal(parsed.outputs[1].output, '');
    assert.deepEqual(
        parsed.inputs.map((i) => i.pipeline),
        ['Hindi'],
    );
    assert.deepEqual(parsed.skipped, [
        'outputs[1].hash is invalid',
        'outputs[2].status is invalid',
        'outputs[3] is not an object',
        'outputs[4] is not an object',
        'inputs[1].pipeline is blank',
        'inputs[2].pipeline is blank',
        'inputs[3].status is invalid',
        'inputs[4] is not an object',
    ]);
    assert.deepEqual(parseHeartbeat(heartbeat()).skipped, []);
});

test('an input is matched to a pipeline by name, ignoring case and spaces', async () => {
    const inputs = [
        { id: 'L1', name: 'Hindi' },
        { id: 'L2', name: 'Tamil' },
        { id: 'L3', name: 'German' },
    ];
    const report = await buildStatusReport(
        [],
        [],
        [{ instance: 'prod', lastSeenAt: new Date(NOW - 1000).toISOString() }],
        SECRET,
        NOW,
        [
            inputRow(' hindi  ', 'running'),
            inputRow('TAMIL', 'warning'),
            inputRow('Tamil', 'error'),
            inputRow('Unrelated', 'error'),
        ],
        inputs,
    );
    assert.equal(report.inputs.L1.status, 'running');
    // Two pipelines of one name: the worse one shows.
    assert.equal(report.inputs.L2.status, 'error');
    // No pipeline of that name is reported.
    assert.equal(report.inputs.L3, null);
});

test('an output running in another pipeline than its input is marked', async () => {
    const mainHash = await hashUrl(SECRET, streamUrl('yt', 'abcd-1234'));
    const keys = [dest('K1', { input: 'L1' }), dest('K2', { input: 'L9', streamKey: 'other' })];
    const inputs = [
        { id: 'L1', name: 'Hindi' },
        { id: 'L9', name: 'Tamil' },
    ];
    const otherHash = await hashUrl(SECRET, streamUrl('yt', 'other'));
    const instances = [{ instance: 'prod', lastSeenAt: new Date(NOW - 1000).toISOString() }];

    const report = await buildStatusReport(
        keys,
        [
            row('running', { hash: mainHash, pipeline: 'Tamil' }),
            row('running', { hash: otherHash, pipeline: ' tamil' }),
        ],
        instances,
        SECRET,
        NOW,
        [],
        inputs,
    );
    // The link of a Hindi stream runs in the Tamil pipeline: probably put in the wrong place.
    assert.equal(report.keys.K1.inputMismatch, true);
    // Same name apart from case and spaces: fine.
    assert.equal(report.keys.K2.inputMismatch, false);

    // Nothing is claimed when the input or the pipeline is unknown.
    const unknown = await buildStatusReport(
        keys,
        [row('running', { hash: mainHash, pipeline: '' })],
        instances,
        SECRET,
        NOW,
        [],
        inputs,
    );
    assert.equal(unknown.keys.K1.inputMismatch, false);
    const noInputs = await buildStatusReport(
        keys,
        [row('running', { hash: mainHash, pipeline: 'Tamil' })],
        instances,
        SECRET,
        NOW,
    );
    assert.equal(noInputs.keys.K1.inputMismatch, false);
});

test('inputs of a bunryu that went quiet are ignored', async () => {
    const report = await buildStatusReport(
        [],
        [],
        [{ instance: 'prod', lastSeenAt: new Date(NOW - FRESH_MS - 1000).toISOString() }],
        SECRET,
        NOW,
        [inputRow('Hindi', 'running')],
        [{ id: 'L1', name: 'Hindi' }],
    );
    assert.equal(report.inputs.L1, null);
});
