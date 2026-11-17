import assert from 'node:assert/strict';
import test from 'node:test';

import { hashUrl, keyUrl } from '../supabase/functions/_shared/key-url.ts';
import {
    buildStatusReport,
    FRESH_MS,
    parseHeartbeat,
    worstStatus,
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

test('parseHeartbeat rejects bad payloads', () => {
    assert.throws(() => parseHeartbeat(null), /JSON object/);
    assert.throws(() => parseHeartbeat(heartbeat({ version: 2 })), /version/);
    assert.throws(() => parseHeartbeat(heartbeat({ instance: 'Prod!' })), /instance/);
    assert.throws(() => parseHeartbeat(heartbeat({ sentAt: 'x' })), /sentAt/);
    assert.throws(() => parseHeartbeat(heartbeat({ outputs: 'x' })), /outputs/);
    assert.throws(
        () => parseHeartbeat(heartbeat({ outputs: [{ ...heartbeat().outputs[0], hash: 'xyz' }] })),
        /hash/,
    );
    assert.throws(
        () =>
            parseHeartbeat(heartbeat({ outputs: [{ ...heartbeat().outputs[0], status: 'bad' }] })),
        /status/,
    );
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

test('worstStatus prefers error, then warning, running and stopped', () => {
    assert.equal(worstStatus([]), null);
    assert.equal(worstStatus([row('stopped'), row('running')]).status, 'running');
    assert.equal(worstStatus([row('running'), row('warning')]).status, 'warning');
    assert.equal(worstStatus([row('warning'), row('error'), row('running')]).status, 'error');
});

test('buildStatusReport matches keys by hash, main and backup separately', async () => {
    const mainHash = await hashUrl(SECRET, keyUrl('yt', 'abcd-1234'));
    const backupHash = await hashUrl(
        SECRET,
        keyUrl('rtmp://b.rtmp.youtube.com/live2?backup=1/', 'abcd-1234'),
    );
    const keys = [
        {
            id: 'K1',
            server: 'yt',
            key: 'abcd-1234',
            server2: 'rtmp://b.rtmp.youtube.com/live2?backup=1/',
            key2: 'abcd-1234',
        },
        { id: 'K2', server: 'yt', key: 'unknown-key', server2: '', key2: '' },
    ];
    const rows = [
        row('running', { hash: mainHash }),
        row('error', { hash: backupHash, message: 'refused', stoppedAfterFailures: true }),
    ];
    const instances = [{ instance: 'prod', lastSeenAt: new Date(NOW - 30_000).toISOString() }];

    const report = await buildStatusReport(keys, rows, instances, SECRET, NOW);

    assert.equal(report.online, true);
    assert.equal(report.keys.K1.main.status, 'running');
    assert.equal(report.keys.K1.backup.status, 'error');
    assert.equal(report.keys.K1.backup.stoppedAfterFailures, true);
    assert.equal(report.keys.K2.main, null);
    assert.equal(report.keys.K2.backup, null);
});

test('a bunryu that stopped reporting is offline and its rows are ignored', async () => {
    const hash = await hashUrl(SECRET, keyUrl('yt', 'abcd-1234'));
    const keys = [{ id: 'K1', server: 'yt', key: 'abcd-1234', server2: '', key2: '' }];
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
    assert.equal(report.keys.K1.main, null);
});

test('with two instances only the live one counts', async () => {
    const hash = await hashUrl(SECRET, keyUrl('yt', 'abcd-1234'));
    const keys = [{ id: 'K1', server: 'yt', key: 'abcd-1234', server2: '', key2: '' }];
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
    assert.equal(report.keys.K1.main.status, 'running');
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

test('parseHeartbeat rejects bad inputs', () => {
    assert.throws(() => parseHeartbeat(heartbeat({ inputs: 'x' })), /inputs must be/);
    assert.throws(
        () => parseHeartbeat(heartbeat({ inputs: [{ pipeline: '', status: 'running' }] })),
        /pipeline/,
    );
    assert.throws(
        () => parseHeartbeat(heartbeat({ inputs: [{ pipeline: 'Hindi', status: 'bad' }] })),
        /status/,
    );
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
    const mainHash = await hashUrl(SECRET, keyUrl('yt', 'abcd-1234'));
    const keys = [
        { id: 'K1', input: 'L1', server: 'yt', key: 'abcd-1234', server2: '', key2: '' },
        { id: 'K2', input: 'L9', server: 'yt', key: 'other', server2: '', key2: '' },
    ];
    const inputs = [
        { id: 'L1', name: 'Hindi' },
        { id: 'L9', name: 'Tamil' },
    ];
    const otherHash = await hashUrl(SECRET, keyUrl('yt', 'other'));
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
    assert.equal(report.keys.K1.main.inputMismatch, true);
    // Same name apart from case and spaces: fine.
    assert.equal(report.keys.K2.main.inputMismatch, false);

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
    assert.equal(unknown.keys.K1.main.inputMismatch, false);
    const noInputs = await buildStatusReport(
        keys,
        [row('running', { hash: mainHash, pipeline: 'Tamil' })],
        instances,
        SECRET,
        NOW,
    );
    assert.equal(noInputs.keys.K1.main.inputMismatch, false);
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
