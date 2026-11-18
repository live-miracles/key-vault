import assert from 'node:assert/strict';
import test from 'node:test';

import { loadFrontendScripts } from './frontend-harness.mjs';

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function loadKeys() {
    return loadFrontendScripts(['frontend/src/utils.ts', 'frontend/src/keys.ts']);
}

function loadKeyAccess() {
    return loadFrontendScripts([
        'frontend/src/utils.ts',
        'frontend/src/access.ts',
        'frontend/src/keys.ts',
    ]);
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

test('detects known RTMP server URLs pasted into custom URL fields', () => {
    const runtime = loadKeys();
    const detectKnownRtmpServerUrl = runtime.get('detectKnownRtmpServerUrl');

    assert.deepEqual(plain(detectKnownRtmpServerUrl('rtmp://a.rtmp.youtube.com/live2/abc123')), {
        server: 'yt',
        streamKey: 'abc123',
    });
    assert.deepEqual(
        plain(detectKnownRtmpServerUrl('rtmps://live-api-s.facebook.com:443/rtmp/live_123')),
        { server: 'fb', streamKey: 'live_123' },
    );
    assert.deepEqual(plain(detectKnownRtmpServerUrl('rtmp://a.rtmp.youtube.com/live2/')), {
        server: 'yt',
        streamKey: '',
    });
    assert.equal(detectKnownRtmpServerUrl('rtmp://custom.example/live/key'), null);
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

test('builds key URL copy payload as a JSON string', () => {
    const runtime = loadKeys();
    const getKeyUrlCopyPayload = runtime.get('getKeyUrlCopyPayload');

    assert.equal(
        getKeyUrlCopyPayload({ name: 'YouTube Main' }, 'rtmp://example.test/live/abc123'),
        '{"name":"YouTube Main","url":"rtmp://example.test/live/abc123"}',
    );
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

test('keeps only the stream key when a whole address is pasted', () => {
    const runtime = loadKeys();
    const clean = (server, value) => plain(runtime.get('cleanStreamKeyInput')(server, value));

    // A bare key is left alone, apart from the spaces around it.
    assert.deepEqual(clean('yt', '  abcd-1234 '), {
        server: 'yt',
        key: 'abcd-1234',
        serverUrl: '',
        notice: '',
    });

    // A full YouTube address, main or backup, becomes the key.
    for (const url of [
        'rtmp://a.rtmp.youtube.com/live2/abcd-1234',
        'rtmp://b.rtmp.youtube.com/live2?backup=1/abcd-1234',
    ]) {
        const cleaned = clean('yt', url);
        assert.equal(cleaned.server, 'yt');
        assert.equal(cleaned.key, 'abcd-1234');
        assert.match(cleaned.notice, /YouTube/);
    }

    // An address for another known platform moves the choice there.
    assert.equal(clean('yt', 'rtmps://live-api-s.facebook.com:443/rtmp/FB-1-0-x').server, 'fb');
    assert.equal(clean('yt', 'rtmp://live-ingest-01.vd0.co:1935/livestream/key-9').server, 'vc');
    const instagram = clean(
        'ig',
        'rtmps://edgetee-upload-abc1.xx.fbcdn.net:443/rtmp/IG-1?s_prp=abc1',
    );
    assert.deepEqual([instagram.server, instagram.key], ['ig', 'IG-1?s_prp=abc1']);

    // "Something else" splits the address from the key at the last slash.
    const custom = clean('rtmp', 'rtmp://live.example.test/app/secret');
    assert.deepEqual(
        [custom.server, custom.serverUrl, custom.key],
        ['rtmp', 'rtmp://live.example.test/app/', 'secret'],
    );

    // An unknown address for a known platform is left for the checks to explain.
    assert.equal(clean('yt', 'rtmp://other.example.test/live/k').notice, '');
});

test('explains what is wrong with a stream key in plain words', () => {
    const runtime = loadKeys();
    const problem = runtime.get('getStreamKeyProblem');

    assert.equal(problem('yt', 'abcd-1234'), '');
    assert.match(problem('yt', ''), /Paste your YouTube stream key/);
    assert.match(problem('rtmp', ''), /key your provider gave you/);
    assert.match(problem('yt', 'two words'), /no spaces/);
    assert.match(problem('yt', 'rtmp://a.rtmp.youtube.com/live2/k'), /full address/);
    assert.match(problem('ig', 'IG-1-2'), /s_prp/);
    assert.equal(problem('ig', 'IG-1-2?s_prp=abc'), '');
});

test('finds destinations by name, platform, input, notes or watch link', () => {
    const runtime = loadKeys();
    const matches = runtime.get('matchesDestinationSearch');
    const key = {
        name: 'Hindi Main',
        server: 'yt',
        key: 'abcd-1234',
        remarks: 'Studio feed',
        link: 'https://example.test/watch/hindi',
    };

    assert.equal(matches(key, ''), true);
    assert.equal(matches(key, '   '), true);
    assert.equal(matches(key, 'hindi'), true);
    assert.equal(matches(key, 'HINDI main'), true);
    assert.equal(matches(key, 'youtube'), true);
    assert.equal(matches(key, 'studio'), true);
    assert.equal(matches(key, 'watch/hindi'), true);
    assert.equal(matches(key, 'tamil', 'Tamil'), true);
    assert.equal(matches(key, 'youtube tamil', 'Tamil'), true);
    assert.equal(matches(key, 'facebook'), false);
    assert.equal(matches(key, 'hindi tamil'), false);
});

test('finds a destination by its stream key or address, main or backup', () => {
    const runtime = loadKeys();
    const matches = runtime.get('matchesDestinationSearch');
    const facebook = {
        name: 'Main',
        server: 'fb',
        key: 'abcd-1234-efgh',
        server2: 'rtmp',
        key2: 'rtmp://backup.example.test/live/zzz-777',
    };

    assert.equal(matches(facebook, 'abcd-1234-efgh'), true);
    assert.equal(matches(facebook, '1234'), true);
    assert.equal(matches(facebook, 'zzz-777'), true);
    assert.equal(matches(facebook, 'live-api-s.facebook.com'), true);
    assert.equal(matches(facebook, 'backup.example.test'), true);
    assert.equal(matches(facebook, 'not-a-key'), false);

    // A YouTube main gets YouTube's own backup server, with the same key.
    const youtube = { name: 'Main', server: 'yt', key: 'yt-key-42' };
    assert.equal(matches(youtube, 'yt-key-42'), true);
    assert.equal(matches(youtube, 'a.rtmp.youtube.com'), true);
    assert.equal(matches(youtube, 'b.rtmp.youtube.com'), true);
    assert.equal(matches(youtube, 'facebook'), false);
});

test('a card says who last added or edited the destination, when that is known', () => {
    const runtime = loadKeys();
    const render = runtime.get('renderLastEdit');
    const at = '2026-11-17T15:42:00';

    const edited = render({
        updatedBy: 'ann@example.test',
        updatedAction: 'edited',
        updatedAt: at,
    });
    assert.match(edited, /title="Edited by ann@example\.test, /);
    assert.match(
        render({ updatedBy: 'ann@example.test', updatedAction: 'added', updatedAt: at }),
        /title="Added by ann@example\.test, /,
    );

    // Made before this was recorded, or still being saved: nothing to say.
    assert.equal(render({ updatedBy: '', updatedAction: '', updatedAt: '' }), '');
    assert.equal(render({ name: 'Pending' }), '');
    // An email is text, never markup.
    assert.doesNotMatch(
        render({ updatedBy: '<b>x</b>@example.test', updatedAction: 'edited', updatedAt: at }),
        /<b>/,
    );
});

test('a card warns, in words, when its main or backup link is used by another destination', () => {
    const runtime = loadKeys();
    const describe = runtime.get('describeLinkClashes');
    const nameOf = (id) => ({ en: 'English', hi: 'Hindi' })[id];
    const yt = (id, name, input, key) => ({ id, name, input, server: 'yt', key });
    const keys = [
        yt('a', 'Channel 1', 'en', 'same-key'),
        yt('b', 'Channel 3', 'hi', 'same-key'),
        yt('c', 'Channel 5', 'hi', 'other-key'),
    ];

    const texts = (key) => plain(describe(key, keys, nameOf)).map((clash) => clash.text);
    assert.deepEqual(texts(keys[0]), [
        'Main and Backup links are also used by “Channel 3” (Hindi).',
    ]);
    assert.deepEqual(texts(keys[2]), []);

    // A destination whose own main and backup are one link.
    const same = { id: 'd', name: 'Own', input: 'en', server: 'rtmp', key: 'rtmp://x/y' };
    same.server2 = 'rtmp';
    same.key2 = 'rtmp://x/y';
    assert.deepEqual(texts(same).slice(-1), ['Main and Backup are the same link.']);
});
