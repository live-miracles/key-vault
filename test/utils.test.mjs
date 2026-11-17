import assert from 'node:assert/strict';
import test from 'node:test';

import { loadFrontendScripts } from './frontend-harness.mjs';

function loadUtils() {
    return loadFrontendScripts(['frontend/src/utils.ts']);
}

test('escapes HTML-sensitive characters', () => {
    const runtime = loadUtils();

    assert.equal(
        runtime.get('escapeHtml')(`<button title="x">Tom & 'Jerry'</button>`),
        '&lt;button title=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/button&gt;',
    );
});

test('keeps only safe HTTP and HTTPS URLs', () => {
    const runtime = loadUtils();
    const safeUrl = runtime.get('safeUrl');

    assert.equal(safeUrl('https://example.test/path'), 'https://example.test/path');
    assert.equal(safeUrl('/relative'), 'https://example.test/relative');
    assert.equal(safeUrl('javascript:alert(1)'), '');
    assert.equal(safeUrl(''), '');
});

test('makes a different stand-in id each time, never an empty one', () => {
    const runtime = loadUtils();
    runtime.context.crypto = { randomUUID: () => 'abc' };
    assert.equal(runtime.get('newTempId')(), 'new-abc');

    runtime.context.crypto = undefined;
    const first = runtime.get('newTempId')();
    const second = runtime.get('newTempId')();
    assert.ok(first.length > 4);
    assert.notEqual(first, second);
});

test('updates and reads query parameters', () => {
    const runtime = loadUtils();

    runtime.get('setUrlParam')('event', 'E2');
    assert.equal(runtime.get('getUrlParam')('event'), 'E2');

    runtime.get('setUrlParam')('event', null);
    assert.equal(runtime.get('getUrlParam')('event'), null);
});

test('describes whether bunryu is connected or when it was last seen', () => {
    const runtime = loadUtils();
    const describeBunryu = runtime.get('describeBunryu');
    const now = Date.parse('2026-11-15T12:00:00Z');
    const ago = (ms) => new Date(now - ms).toISOString();

    assert.equal(describeBunryu(undefined, now).state, 'unknown');
    assert.deepEqual(describeBunryu({ online: true, instances: [] }, now).text, 'bunryu connected');
    assert.equal(
        describeBunryu({ online: false, instances: [] }, now).text,
        'bunryu not connected',
    );

    const offline = (...ms) => ({
        online: false,
        instances: ms.map((m, i) => ({ instance: `i${i}`, lastSeenAt: ago(m), online: false })),
    });
    assert.equal(describeBunryu(offline(30000), now).text, 'bunryu last seen just now');
    assert.equal(describeBunryu(offline(5 * 60000), now).text, 'bunryu last seen 5 min ago');
    assert.equal(describeBunryu(offline(3 * 3600000), now).text, 'bunryu last seen 3 h ago');
    assert.equal(describeBunryu(offline(2 * 86400000), now).text, 'bunryu last seen 2 d ago');
    // With several instances, the most recent report counts.
    assert.equal(
        describeBunryu(offline(2 * 86400000, 10 * 60000), now).text,
        'bunryu last seen 10 min ago',
    );
});
