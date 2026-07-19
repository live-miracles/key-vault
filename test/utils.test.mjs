import assert from 'node:assert/strict';
import test from 'node:test';

import { loadFrontendScripts } from './frontend-harness.mjs';

function loadUtils() {
    return loadFrontendScripts(['frontend/utils.js']);
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

test('updates and reads query parameters', () => {
    const runtime = loadUtils();

    runtime.get('setUrlParam')('event', 'E2');
    assert.equal(runtime.get('getUrlParam')('event'), 'E2');

    runtime.get('setUrlParam')('event', null);
    assert.equal(runtime.get('getUrlParam')('event'), null);
});
