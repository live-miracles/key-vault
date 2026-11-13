import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiError, callApi } from '../frontend/src/api-client.ts';

const config = { supabaseUrl: 'https://abc.supabase.co', publishableKey: 'sb_publishable_x' };

function fakeFetch(status, body) {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url, init });
        return {
            ok: status >= 200 && status < 300,
            status,
            json: async () => {
                if (body === undefined) throw new Error('not json');
                return body;
            },
        };
    };
    return { fetchImpl, calls };
}

test('callApi posts the operation with the user token and the publishable key', async () => {
    const { fetchImpl, calls } = fakeFetch(200, { success: true, data: { etag: 'e' } });

    const answer = await callApi(fetchImpl, config, 'user-token', 'getAllData', ['old']);

    assert.deepEqual(answer, { success: true, data: { etag: 'e' } });
    assert.equal(calls[0].url, 'https://abc.supabase.co/functions/v1/api');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer user-token');
    assert.equal(calls[0].init.headers.apikey, 'sb_publishable_x');
    assert.deepEqual(JSON.parse(calls[0].init.body), { operation: 'getAllData', args: ['old'] });
});

test('an application error is an answer, not an exception', async () => {
    const { fetchImpl } = fakeFetch(200, { success: false, error: 'Access denied for email: a' });
    const answer = await callApi(fetchImpl, config, 't', 'addKey', [{}]);
    assert.deepEqual(answer, { success: false, error: 'Access denied for email: a' });
});

test('http errors throw with the server message and status', async () => {
    const { fetchImpl } = fakeFetch(401, { error: 'Authentication is required.' });
    await assert.rejects(
        () => callApi(fetchImpl, config, 't', 'getAllData', []),
        (error) =>
            error instanceof ApiError &&
            error.status === 401 &&
            error.message === 'Authentication is required.',
    );
});

test('a gateway page that is not json is reported by status', async () => {
    const { fetchImpl } = fakeFetch(502, undefined);
    await assert.rejects(() => callApi(fetchImpl, config, 't', 'getAllData', []), /HTTP 502/);
});

test('an answer without success is rejected', async () => {
    const { fetchImpl } = fakeFetch(200, { hello: 'world' });
    await assert.rejects(() => callApi(fetchImpl, config, 't', 'getAllData', []), /unexpected/);
});
