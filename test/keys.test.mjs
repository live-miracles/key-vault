import assert from 'node:assert/strict';
import test from 'node:test';

import { loadFrontendScripts } from './frontend-harness.mjs';

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function loadKeys() {
    return loadFrontendScripts(['frontend/utils.js', 'frontend/keys.js']);
}

function loadKeyAccess() {
    return loadFrontendScripts(['frontend/utils.js', 'frontend/access.js', 'frontend/keys.js']);
}

test('builds RTMP values for known, custom, and empty endpoints', () => {
    const runtime = loadKeys();
    const getRtmpValue = runtime.get('getRtmpValue');

    assert.equal(getRtmpValue('yt', 'abc123'), 'rtmp://a.rtmp.youtube.com/live2/abc123');
    assert.equal(
        getRtmpValue('rtmp', 'rtmp://custom.example/live/key'),
        'rtmp://custom.example/live/key',
    );
    assert.equal(getRtmpValue('', 'abc123'), '');
});

test('derives the YouTube backup endpoint and hides Instagram backups', () => {
    const runtime = loadKeys();

    assert.deepEqual(plain(runtime.get('getKeyBackupEndpoint')({ server: 'yt', key: 'abc123' })), {
        server: 'rtmp://b.rtmp.youtube.com/live2?backup=1/',
        key: 'abc123',
    });

    const instagramKey = { server: 'ig', server2: 'fb', key2: 'backup' };
    runtime.get('enforceLockedBackup')(instagramKey);

    assert.equal(instagramKey.server2, '');
    assert.equal(instagramKey.key2, '');
});

test('parses and builds SRT URLs with defaults and encryption settings', () => {
    const runtime = loadKeys();
    const parseSrtUrl = runtime.get('parseSrtUrl');
    const buildSrtUrl = runtime.get('buildSrtUrl');

    assert.deepEqual(plain(parseSrtUrl('not-srt')), plain(runtime.get('DEFAULT_SRT_SETTINGS')));

    const settings = parseSrtUrl(
        'srt://stream.example.test:10000?mode=listener&latency=240000&passphrase=long-secret&pbkeylen=16&streamid=live/demo',
    );

    assert.deepEqual(plain(settings), {
        mode: 'listener',
        host: 'stream.example.test',
        port: '10000',
        latencyMs: '240',
        passphrase: 'long-secret',
        pbKeyLen: '16',
        streamId: 'live/demo',
    });
    assert.equal(
        buildSrtUrl({
            mode: 'caller',
            host: 'stream.example.test',
            port: 10000,
            latencyMs: 240,
            passphrase: 'long-secret',
            pbKeyLen: 24,
            streamId: 'live/demo',
        }),
        'srt://stream.example.test:10000?mode=caller&latency=240000&passphrase=long-secret&pbkeylen=24&streamid=live%2Fdemo',
    );
});

test('detects streaming configuration changes only for streaming fields', () => {
    const runtime = loadKeys();
    const hasStreamingConfigChanged = runtime.get('hasStreamingConfigChanged');
    const oldKey = {
        server: 'yt',
        key: 'abc123',
        server2: '',
        key2: '',
        color: '',
    };

    assert.equal(hasStreamingConfigChanged(oldKey, { ...oldKey, color: '6' }), false);
    assert.equal(hasStreamingConfigChanged(oldKey, { ...oldKey, key: 'updated' }), true);
});

test('labels visible key colors with color markers', () => {
    const runtime = loadKeys();
    const { KEY_COLORS, COLORS } = runtime.get('({ KEY_COLORS, COLORS })');

    assert.equal(COLORS[KEY_COLORS.NONE].name, 'None');
    assert.equal(COLORS[KEY_COLORS.ERROR].name, '🔴 Error');
    assert.equal(COLORS[KEY_COLORS.WARNING].name, '🟡 Warning');
    assert.equal(COLORS[KEY_COLORS.CONFIGURED].name, '🟣 Configured');
});

test('keeps changed streaming configurations uncolored until configured', () => {
    const runtime = loadKeys();
    const { KEY_COLORS } = runtime.get('({ KEY_COLORS })');
    const hasStreamingConfigChanged = runtime.get('hasStreamingConfigChanged');
    const oldKey = {
        server: 'yt',
        key: 'abc123',
        server2: '',
        key2: '',
        color: KEY_COLORS.CONFIGURED,
    };
    const changedKey = { ...oldKey, key: 'updated', color: KEY_COLORS.CONFIGURED };

    if (hasStreamingConfigChanged(oldKey, changedKey)) {
        changedKey.color = KEY_COLORS.NONE;
    }

    assert.equal(changedKey.color, KEY_COLORS.NONE);
});

test('allows only owners and admins to edit key colors in the UI', () => {
    const runtime = loadKeyAccess();
    const { ROLES } = runtime.get('({ ROLES })');
    const canEditKeyColor = runtime.get('canEditKeyColor');

    runtime.set('eventRoles', {
        EVT_OWNER: [{ type: ROLES.OWNER }],
        EVT_ADMIN: [{ type: ROLES.ADMIN }],
        EVT_EDITOR: [{ type: ROLES.EDITOR }],
        EVT_VIEWER: [{ type: ROLES.VIEWER }],
    });

    assert.equal(canEditKeyColor('EVT_OWNER'), true);
    assert.equal(canEditKeyColor('EVT_ADMIN'), true);
    assert.equal(canEditKeyColor('EVT_EDITOR'), false);
    assert.equal(canEditKeyColor('EVT_VIEWER'), false);
});
