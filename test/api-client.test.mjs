import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ApiError,
    callApi,
    createHttpBackend,
    operationNames,
} from '../frontend/src/api-client.ts';

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

test('an operation is a POST to its own path with the user token and the publishable key', async () => {
    const { fetchImpl, calls } = fakeFetch(200, { id: 'k1' });

    const result = await callApi(fetchImpl, config, 'user-token', 'deleteKey', { id: 'k1' });

    assert.deepEqual(result, { id: 'k1' });
    assert.equal(calls[0].url, 'https://abc.supabase.co/functions/v1/api/deleteKey');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer user-token');
    assert.equal(calls[0].init.headers.apikey, 'sb_publishable_x');
    assert.deepEqual(JSON.parse(calls[0].init.body), { id: 'k1' });
});

test('an operation with no input sends no body', async () => {
    const { fetchImpl, calls } = fakeFetch(200, null);
    await callApi(fetchImpl, config, 't', 'getAllData');
    assert.equal(calls[0].init.body, undefined);
});

test('a refusal is an ApiError with the server code and plain message', async () => {
    const { fetchImpl } = fakeFetch(409, {
        error: { code: 'conflict', message: 'This event already has an input called "Hindi".' },
    });
    await assert.rejects(
        () => callApi(fetchImpl, config, 't', 'addInput', {}),
        (error) =>
            error instanceof ApiError &&
            error.code === 'conflict' &&
            error.message === 'This event already has an input called "Hindi".',
    );
});

test('the code falls back to the HTTP status when the body has none', async () => {
    for (const [status, code] of [
        [400, 'invalid'],
        [401, 'denied'],
        [403, 'denied'],
        [404, 'not_found'],
        [409, 'conflict'],
        [500, 'unavailable'],
    ]) {
        const { fetchImpl } = fakeFetch(status, { message: 'x' });
        await assert.rejects(
            () => callApi(fetchImpl, config, 't', 'getAllData'),
            (error) => error instanceof ApiError && error.code === code,
            String(status),
        );
    }
});

test('a gateway page that is not json is reported by status', async () => {
    const { fetchImpl } = fakeFetch(502, undefined);
    await assert.rejects(
        () => callApi(fetchImpl, config, 't', 'getAllData'),
        (error) => error instanceof ApiError && /HTTP 502/.test(error.message),
    );
});

test('a network failure is an ApiError too, in plain words', async () => {
    const fetchImpl = async () => {
        throw new TypeError('Failed to fetch');
    };
    await assert.rejects(
        () => callApi(fetchImpl, config, 't', 'getAllData'),
        (error) =>
            error instanceof ApiError &&
            error.code === 'unavailable' &&
            /Could not reach/.test(error.message),
    );
});

test('the backend has one method per operation, each using a fresh token', async () => {
    const { fetchImpl, calls } = fakeFetch(200, { ok: true });
    let tokens = 0;
    const backend = createHttpBackend(config, async () => `token-${++tokens}`, fetchImpl);

    assert.deepEqual(Object.keys(backend).sort(), [...operationNames()].sort());
    await backend.editEvent({ id: 'e1', name: 'x' });
    await backend.deleteRole({ id: 'r1' });
    assert.deepEqual(
        calls.map((c) => [c.url.split('/').pop(), c.init.headers.Authorization]),
        [
            ['editEvent', 'Bearer token-1'],
            ['deleteRole', 'Bearer token-2'],
        ],
    );
});
