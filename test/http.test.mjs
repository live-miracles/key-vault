import assert from 'node:assert/strict';
import test from 'node:test';

import { operationFrom } from '../supabase/functions/_shared/http.ts';

test('operationFrom takes the last segment of the path', () => {
    assert.equal(operationFrom('/functions/v1/api/addKey'), 'addKey');
    assert.equal(operationFrom('/api/getAllData/'), 'getAllData');
    assert.equal(operationFrom('/'), '');
});

test('operationFrom does not throw on a malformed escape', () => {
    assert.doesNotThrow(() => operationFrom('/functions/v1/api/%E0%A4%A'));
    assert.equal(operationFrom('/functions/v1/api/%E0%A4%A'), '');
});
