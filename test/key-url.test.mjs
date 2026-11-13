import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { hashUrl, keyUrl, normalizeUrl } from '../supabase/functions/_shared/key-url.ts';
import { loadFrontendScripts } from './frontend-harness.mjs';

// The vectors are shared with bunryu (its test/fixtures/key-vault-hash-vectors.json):
// the same URL must hash to the same value on both sides or no key will ever match.
const fixture = JSON.parse(
    fs.readFileSync(new URL('./fixtures/key-vault-hash-vectors.json', import.meta.url), 'utf8'),
);

for (const vector of fixture.vectors) {
    test(`hash vector: ${vector.description}`, async () => {
        assert.equal(normalizeUrl(vector.url), vector.normalized);
        assert.equal(await hashUrl(fixture.secret, vector.url), vector.hash);
    });
}

test('keyUrl builds the same URL as the browser for every server kind', () => {
    const runtime = loadFrontendScripts(['frontend/src/utils.ts', 'frontend/src/keys.ts']);
    const getRtmpValue = runtime.get('getRtmpValue');
    const cases = [
        ['yt', 'abcd-1234'],
        ['fb', 'FB-1-0-key'],
        ['vc', 'stream'],
        ['ig', 'key?s_prp=abc123&x=1'],
        ['rtmp', 'rtmp://custom.example/live/key'],
        ['srt', 'srt://host:9000?mode=caller&streamid=x'],
        ['rtmp://b.rtmp.youtube.com/live2?backup=1/', 'abcd-1234'],
        ['', 'abc'],
        ['yt', ''],
        ['', ''],
    ];
    for (const [server, key] of cases) {
        assert.equal(keyUrl(server, key), getRtmpValue(server, key), `${server} + ${key}`);
    }
});

test('a YouTube main and backup key hash to different values', async () => {
    const main = await hashUrl('s', keyUrl('yt', 'abcd-1234'));
    const backup = await hashUrl(
        's',
        keyUrl('rtmp://b.rtmp.youtube.com/live2?backup=1/', 'abcd-1234'),
    );
    assert.notEqual(main, backup);
});
