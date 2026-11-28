import assert from 'node:assert/strict';
import test from 'node:test';

import * as p from '../supabase/functions/_shared/platforms.ts';

const dest = (extra = {}) => ({
    platform: 'yt',
    streamKey: 'abcd-1234',
    backupPlatform: '',
    backupStreamKey: '',
    ...extra,
});

test('builds addresses for known, custom and empty destinations', () => {
    assert.equal(p.streamUrl('yt', 'abcd-1234'), 'rtmp://a.rtmp.youtube.com/live2/abcd-1234');
    assert.equal(
        p.streamUrl('fb', 'FB-1-0-key'),
        'rtmps://live-api-s.facebook.com:443/rtmp/FB-1-0-key',
    );
    assert.equal(
        p.streamUrl('vc', 'stream'),
        'rtmp://live-ingest-01.vd0.co:1935/livestream/stream',
    );
    assert.equal(
        p.streamUrl('ig', 'key?s_prp=abc123&x=1'),
        'rtmps://edgetee-upload-abc123.xx.fbcdn.net:443/rtmp/key?s_prp=abc123&x=1',
    );
    assert.equal(
        p.streamUrl('rtmp', 'rtmp://custom.example/live/key'),
        'rtmp://custom.example/live/key',
    );
    assert.equal(p.streamUrl('srt', 'srt://host:9000?mode=caller'), 'srt://host:9000?mode=caller');
    assert.equal(p.streamUrl('', 'abc'), '');
    assert.equal(p.streamUrl('nope', 'abc'), '');
    assert.equal(p.streamUrl('yt', ''), '');
});

test('derives the YouTube backup, gives Instagram none, and leaves the rest to the person', () => {
    assert.equal(p.backupUrl(dest()), 'rtmp://b.rtmp.youtube.com/live2?backup=1/abcd-1234');
    assert.equal(p.backupUrl(dest({ platform: 'ig', streamKey: 'k?s_prp=a' })), '');
    assert.equal(
        p.backupUrl(
            dest({ platform: 'vc', backupPlatform: 'rtmp', backupStreamKey: 'rtmp://x.test/a/b' }),
        ),
        'rtmp://x.test/a/b',
    );
    assert.equal(p.backupUrl(dest({ platform: 'vc' })), '');
    assert.equal(p.backupUrl(dest({ streamKey: '' })), '');
});

test('a stored backup follows the platform: none and derived store nothing, Facebook is Facebook', () => {
    const typed = { backupPlatform: 'rtmp', backupStreamKey: 'rtmp://x.test/a/b' };
    assert.deepEqual(p.normalizeBackup(dest(typed)), dest());
    assert.deepEqual(
        p.normalizeBackup(dest({ platform: 'ig', ...typed })),
        dest({ platform: 'ig' }),
    );
    assert.equal(
        p.normalizeBackup(dest({ platform: 'fb', backupPlatform: 'rtmp', backupStreamKey: 'FB-2' }))
            .backupPlatform,
        'fb',
    );
    assert.equal(
        p.normalizeBackup(dest({ platform: 'fb', backupPlatform: 'fb', backupStreamKey: '' }))
            .backupPlatform,
        '',
    );
    assert.deepEqual(
        p.normalizeBackup(dest({ platform: 'vc', ...typed })),
        dest({ platform: 'vc', ...typed }),
    );
});

test('detects known platform addresses pasted into a custom address field', () => {
    assert.deepEqual(p.detectKnownAddress('rtmp://a.rtmp.youtube.com/live2/abcd'), {
        platform: 'yt',
        streamKey: 'abcd',
    });
    assert.deepEqual(p.detectKnownAddress('rtmps://live-api-s.facebook.com:443/rtmp/'), {
        platform: 'fb',
        streamKey: '',
    });
    assert.equal(p.detectKnownAddress('rtmp://custom.example/live/key'), null);
    assert.equal(p.detectKnownAddress(''), null);
});

test('splits and joins a custom rtmp address at the last slash', () => {
    assert.deepEqual(p.splitRtmpAddress('rtmp://x.test/live/key'), {
        serverUrl: 'rtmp://x.test/live/',
        streamKey: 'key',
    });
    assert.deepEqual(p.splitRtmpAddress('justakey'), { serverUrl: '', streamKey: 'justakey' });
    assert.equal(p.joinRtmpAddress('rtmp://x.test/live', 'key'), 'rtmp://x.test/live/key');
    assert.equal(p.joinRtmpAddress('rtmp://x.test/live/', ''), '');
});

test('parses and builds SRT links with defaults and encryption settings', () => {
    assert.deepEqual(p.parseSrtUrl('rtmp://nope'), p.DEFAULT_SRT_SETTINGS);
    const settings = p.parseSrtUrl(
        'srt://host.test:9000?mode=listener&latency=120000&passphrase=0123456789&pbkeylen=24&streamid=abc',
    );
    assert.deepEqual(settings, {
        mode: 'listener',
        host: 'host.test',
        port: 9000,
        latencyMs: 120,
        passphrase: '0123456789',
        pbKeyLen: 24,
        streamId: 'abc',
    });
    assert.equal(
        p.buildSrtUrl({ ...settings, mode: 'caller' }),
        'srt://host.test:9000?mode=caller&latency=120000&passphrase=0123456789&pbkeylen=24&streamid=abc',
    );
    assert.equal(
        p.buildSrtUrl({ ...p.DEFAULT_SRT_SETTINGS, host: 'h.test', port: 1 }),
        'srt://h.test:1?mode=caller&latency=240000',
    );
});

test('detects a change to where the stream goes, not to its name or notes', () => {
    const before = dest();
    assert.equal(p.destinationChanged(before, { ...before, name: 'x', remarks: 'y' }), false);
    for (const field of ['platform', 'streamKey', 'backupPlatform', 'backupStreamKey']) {
        assert.equal(p.destinationChanged(before, { ...before, [field]: 'changed' }), true);
    }
});

test('keeps only the stream key when a whole address is pasted', () => {
    const youtube = p.cleanStreamKeyInput('yt', 'rtmp://a.rtmp.youtube.com/live2/abcd-1234');
    assert.equal(youtube.streamKey, 'abcd-1234');
    assert.match(youtube.notice, /full YouTube address/);

    // Pasted into the wrong platform: the right one is chosen.
    const moved = p.cleanStreamKeyInput(
        'vc',
        'rtmps://live-api-s.facebook.com:443/rtmp/FB-1-0-key',
    );
    assert.equal(moved.platform, 'fb');
    assert.equal(moved.streamKey, 'FB-1-0-key');

    assert.equal(
        p.cleanStreamKeyInput('yt', 'rtmp://b.rtmp.youtube.com/live2?backup=1/abcd').streamKey,
        'abcd',
    );
    const instagram = p.cleanStreamKeyInput(
        'vc',
        'rtmps://edgetee-upload-abc.xx.fbcdn.net:443/rtmp/key?s_prp=abc',
    );
    assert.equal(instagram.platform, 'ig');
    assert.equal(instagram.streamKey, 'key?s_prp=abc');

    const custom = p.cleanStreamKeyInput('rtmp', 'rtmp://x.test/live/key');
    assert.equal(custom.serverUrl, 'rtmp://x.test/live/');
    assert.equal(custom.streamKey, 'key');

    // A plain key, or an address of an unknown platform for a known one, is left alone.
    assert.equal(p.cleanStreamKeyInput('yt', '  abcd  ').notice, '');
    assert.equal(p.cleanStreamKeyInput('yt', 'rtmp://x.test/live/key').notice, '');
});

test('explains what is wrong with a stream key in plain words', () => {
    assert.match(p.streamKeyProblem('yt', ''), /Paste your YouTube stream key/);
    assert.match(p.streamKeyProblem('rtmp', ''), /Paste the stream key your provider gave you/);
    assert.match(p.streamKeyProblem('yt', 'ab cd'), /no spaces/);
    assert.match(p.streamKeyProblem('yt', 'rtmp://x.test/key'), /full address/);
    assert.match(p.streamKeyProblem('ig', 'nokey'), /s_prp/);
    assert.equal(p.streamKeyProblem('ig', 'k?s_prp=abc'), null);
    assert.equal(p.streamKeyProblem('yt', 'abcd-1234'), null);
});

test('says which box of the form is wrong', () => {
    assert.equal(p.endpointProblem('', '', true).field, 'platform');
    assert.equal(p.endpointProblem('', '', false), null);
    assert.equal(p.endpointProblem('yt', '', true).field, 'streamKey');
    assert.equal(p.endpointProblem('rtmp', 'justakey', true).field, 'address');
    assert.equal(p.endpointProblem('rtmp', 'ftp://x.test/a', true).field, 'address');
    assert.equal(p.endpointProblem('rtmp', 'rtmp://x.test/live/', true).field, 'streamKey');
    assert.equal(p.endpointProblem('rtmp', 'rtmp://x.test/live/key', true), null);

    const srt = (query, host = 'h.test', port = '1') =>
        p.endpointProblem('srt', `srt://${host}:${port}?${query}`, true);
    assert.equal(srt('mode=caller&latency=240000', '').field, 'srtHost');
    // The form checks the typed settings, so a port that is not a number is caught there.
    const typed = { ...p.DEFAULT_SRT_SETTINGS, host: 'h.test', port: 70000 };
    assert.equal(p.srtProblem(typed).field, 'srtPort');
    assert.equal(p.srtProblem({ ...typed, port: 9000 }), null);
    assert.equal(
        srt('mode=caller&latency=240000&passphrase=short&pbkeylen=32').field,
        'srtPassphrase',
    );
    assert.equal(
        srt('mode=caller&latency=240000&passphrase=0123456789&pbkeylen=7').field,
        'srtKeyLen',
    );
    assert.equal(srt('mode=caller&latency=240000'), null);
});

test('a destination is valid when its main is, and its backup where the platform allows one', () => {
    assert.equal(p.destinationProblem(dest()), null);
    assert.equal(p.destinationProblem(dest({ streamKey: 'a b' })).part, 'main');
    // YouTube and Instagram ignore whatever was sent as a backup.
    assert.equal(
        p.destinationProblem(dest({ backupPlatform: 'rtmp', backupStreamKey: 'bad' })),
        null,
    );
    const vc = { platform: 'vc', streamKey: 'key' };
    assert.equal(
        p.destinationProblem(dest({ ...vc, backupPlatform: 'rtmp', backupStreamKey: 'bad' })).part,
        'backup',
    );
    assert.equal(
        p.destinationProblem(dest({ ...vc, backupStreamKey: 'orphan' })).field,
        'platform',
    );
});

test('names use letters, numbers, spaces, - and _', () => {
    assert.equal(p.destinationNameProblem('YouTube English_1-b'), null);
    assert.match(p.destinationNameProblem(''), /Give this destination a name/);
    assert.match(p.destinationNameProblem('a/b'), /letters, numbers/);
});

test('a watch link is empty or a whole http or https address', () => {
    assert.equal(p.watchLinkProblem(''), null);
    assert.equal(p.watchLinkProblem('https://www.youtube.com/watch?v=abc'), null);
    assert.equal(p.watchLinkProblem('http://example.org/live'), null);
    assert.match(p.watchLinkProblem('www.youtube.com/watch?v=abc'), /starting with https:\/\//);
    assert.match(p.watchLinkProblem('javascript:alert(1)'), /starting with https:\/\//);
    assert.match(p.watchLinkProblem('rtmp://a.rtmp.youtube.com/live2/abc'), /https:\/\//);
});

test('finds an address another destination already uses, or a backup equal to the main', () => {
    const other = dest({
        platform: 'vc',
        streamKey: 'other',
        backupPlatform: 'vc',
        backupStreamKey: 'spare',
    });
    assert.equal(p.findClash(dest({ platform: 'vc', streamKey: 'fresh' }), [other]), null);
    assert.equal(p.findClash(dest({ platform: 'vc', streamKey: 'other' }), [other]).part, 'main');
    // Another destination's backup counts.
    assert.equal(p.findClash(dest({ platform: 'vc', streamKey: 'spare' }), [other]).part, 'main');
    const backupUsed = dest({
        platform: 'vc',
        streamKey: 'fresh',
        backupPlatform: 'vc',
        backupStreamKey: 'spare',
    });
    assert.equal(p.findClash(backupUsed, [other]).part, 'backup');
    const same = dest({
        platform: 'vc',
        streamKey: 'x',
        backupPlatform: 'vc',
        backupStreamKey: 'x',
    });
    assert.match(p.findClash(same, []).message, /different from the main/);
    // YouTube's derived backup is a different address from its main.
    assert.equal(p.findClash(dest(), []), null);
});
