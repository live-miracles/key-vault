import assert from 'node:assert/strict';
import test from 'node:test';

import { describeLinkClashes, matchesDestinationSearch } from '../frontend/src/search.ts';

test('finds destinations by name, platform, input, notes or watch link', () => {
    const key = {
        name: 'Hindi Main',
        platform: 'yt',
        streamKey: 'abcd-1234',
        remarks: 'Studio feed',
        link: 'https://example.test/watch/hindi',
    };
    const matches = matchesDestinationSearch;

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
    const facebook = {
        name: 'Main',
        platform: 'fb',
        streamKey: 'abcd-1234-efgh',
        backupPlatform: 'rtmp',
        backupStreamKey: 'rtmp://backup.example.test/live/zzz-777',
    };
    const matches = matchesDestinationSearch;

    assert.equal(matches(facebook, 'abcd-1234-efgh'), true);
    assert.equal(matches(facebook, '1234'), true);
    assert.equal(matches(facebook, 'zzz-777'), true);
    assert.equal(matches(facebook, 'live-api-s.facebook.com'), true);
    assert.equal(matches(facebook, 'backup.example.test'), true);
    assert.equal(matches(facebook, 'not-a-key'), false);

    // A YouTube main gets YouTube's own backup server, with the same key.
    const youtube = { name: 'Main', platform: 'yt', streamKey: 'yt-key-42' };
    assert.equal(matches(youtube, 'yt-key-42'), true);
    assert.equal(matches(youtube, 'a.rtmp.youtube.com'), true);
    assert.equal(matches(youtube, 'b.rtmp.youtube.com'), true);
    assert.equal(matches(youtube, 'facebook'), false);
});

test('a card warns, in words, when its main or backup link is used by another destination', () => {
    const nameOf = (id) => ({ en: 'English', hi: 'Hindi' })[id];
    const yt = (id, name, input, streamKey) => ({
        id,
        name,
        input,
        platform: 'yt',
        streamKey,
        backupPlatform: '',
        backupStreamKey: '',
    });
    const keys = [
        yt('a', 'Channel 1', 'en', 'same-key'),
        yt('b', 'Channel 3', 'hi', 'same-key'),
        yt('c', 'Channel 5', 'hi', 'other-key'),
    ];
    const texts = (key) => describeLinkClashes(key, keys, nameOf).map((clash) => clash.text);

    // YouTube's backup is made from the same key, so both links clash and it is said once.
    assert.deepEqual(texts(keys[0]), [
        'Main and Backup links are also used by “Channel 3” (Hindi).',
    ]);
    assert.deepEqual(texts(keys[2]), []);

    // A destination whose own main and backup are one link.
    const same = {
        id: 'd',
        name: 'Own',
        input: 'en',
        platform: 'rtmp',
        streamKey: 'rtmp://x/y',
        backupPlatform: 'rtmp',
        backupStreamKey: 'rtmp://x/y',
    };
    assert.deepEqual(texts(same).slice(-1), ['Main and Backup are the same link.']);
});

test('only one link clashing names just that link, and many clashes are counted', () => {
    const nameOf = () => 'English';
    const vc = (id, streamKey, backup = '') => ({
        id,
        name: `Key ${id}`,
        input: 'en',
        platform: 'vc',
        streamKey,
        backupPlatform: backup ? 'vc' : '',
        backupStreamKey: backup,
    });
    const keys = [vc('a', 'one', 'spare'), vc('b', 'spare'), vc('c', 'spare'), vc('d', 'spare')];
    const [clash] = describeLinkClashes(keys[0], keys, nameOf);
    assert.equal(clash.label, 'Backup');
    assert.match(
        clash.text,
        /^Backup link is also used by “Key b” \(English\) and “Key c” \(English\) and 1 more\.$/,
    );
});
