import assert from 'node:assert/strict';
import test from 'node:test';

import { operationFrom, readBody } from '../supabase/functions/_shared/http.ts';

test('operationFrom takes the last segment of the path', () => {
    assert.equal(operationFrom('/functions/v1/api/addKey'), 'addKey');
    assert.equal(operationFrom('/api/getAllData/'), 'getAllData');
    assert.equal(operationFrom('/'), '');
});

test('operationFrom does not throw on a malformed escape', () => {
    assert.doesNotThrow(() => operationFrom('/functions/v1/api/%E0%A4%A'));
    assert.equal(operationFrom('/functions/v1/api/%E0%A4%A'), '');
});

// A body sent in pieces with no Content-Length, as a chunked upload is.
function streamed(...parts) {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
        start(controller) {
            for (const part of parts) controller.enqueue(encoder.encode(part));
            controller.close();
        },
    });
    return new Request('https://example.test/api/x', { method: 'POST', body, duplex: 'half' });
}

test('readBody returns the body as text', async () => {
    const request = new Request('https://example.test/api/x', {
        method: 'POST',
        body: '{"a":"é"}',
    });
    assert.equal(await readBody(request, 100), '{"a":"é"}');
    assert.equal(await readBody(streamed('{"a":', '1}'), 100), '{"a":1}');
    assert.equal(await readBody(new Request('https://example.test/api/x'), 100), '');
});

test('readBody refuses a body over the limit, with or without a Content-Length', async () => {
    const declared = new Request('https://example.test/api/x', {
        method: 'POST',
        body: 'x'.repeat(11),
    });
    assert.equal(await readBody(declared, 10), null);
    assert.equal(await readBody(streamed('x'.repeat(6), 'x'.repeat(6)), 10), null);
    // The limit is in bytes, not characters: "é" is two.
    assert.equal(await readBody(streamed('é'.repeat(6)), 10), null);
    assert.equal(await readBody(streamed('x'.repeat(10)), 10), 'x'.repeat(10));
});
