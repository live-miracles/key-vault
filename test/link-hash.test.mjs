import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { hashUrl, normalizeUrl } from '../supabase/functions/_shared/link-hash.ts';
import { streamUrl } from '../supabase/functions/_shared/platforms.ts';

// The vectors are shared with bunryu (its test/fixtures/key-vault-hash-vectors.json):
// the same URL must hash to the same value on both sides or no destination will ever match.
const fixture = JSON.parse(
    fs.readFileSync(new URL('./fixtures/key-vault-hash-vectors.json', import.meta.url), 'utf8'),
);

for (const vector of fixture.vectors) {
    test(`hash vector: ${vector.description}`, async () => {
        assert.equal(normalizeUrl(vector.url), vector.normalized);
        assert.equal(await hashUrl(fixture.secret, vector.url), vector.hash);
    });
}

test('a YouTube main and backup address hash to different values', async () => {
    const main = await hashUrl('s', streamUrl('yt', 'abcd-1234'));
    const backup = await hashUrl('s', 'rtmp://b.rtmp.youtube.com/live2?backup=1/abcd-1234');
    assert.notEqual(main, backup);
});
