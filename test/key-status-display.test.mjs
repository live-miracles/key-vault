import assert from 'node:assert/strict';
import test from 'node:test';

import { loadFrontendScripts } from './frontend-harness.mjs';

const runtime = loadFrontendScripts(['frontend/src/utils.ts', 'frontend/src/keys.ts']);
const getKeyDisplay = runtime.get('getKeyDisplay');
const getKeyStatus = runtime.get('getKeyStatus');
const KEY_COLORS = runtime.get('KEY_COLORS');

const status = (state, extra = {}) => ({
    status: state,
    message: '',
    failures: 0,
    stoppedAfterFailures: false,
    pipeline: 'Hindi',
    output: 'YouTube',
    ...extra,
});
const report = (keys) => ({ online: true, instances: [], keys });
const key = (extra = {}) => ({ id: 'K1', color: '', ...extra });

test('a key with no status and no manual color has no color', () => {
    const { color, title } = getKeyDisplay(key(), report({}));
    assert.equal(color.bgCss, '');
    assert.equal(title, '');
    assert.equal(getKeyDisplay(key(), undefined).color.bgCss, '');
});

test('each reported status gets its own color and an explanation', () => {
    const cases = {
        running: 'tint-running',
        warning: 'tint-warning',
        error: 'tint-error',
        stopped: 'tint-configured',
    };
    for (const [state, css] of Object.entries(cases)) {
        const { color, title } = getKeyDisplay(
            key(),
            report({ K1: { main: status(state), backup: null } }),
        );
        assert.equal(color.bgCss, css, state);
        assert.match(title, /Hindi → YouTube/);
    }
});

test('the worse of main and backup decides', () => {
    const entry = { main: status('running'), backup: status('error', { message: 'refused' }) };
    assert.equal(getKeyStatus(key(), report({ K1: entry })).status, 'error');
    assert.equal(
        getKeyStatus(key(), report({ K1: { main: status('stopped'), backup: status('running') } }))
            .status,
        'running',
    );
    assert.equal(getKeyStatus(key(), report({ K1: { main: null, backup: null } })), null);
});

test('an error that stopped the output says how many attempts failed', () => {
    const { title } = getKeyDisplay(
        key(),
        report({
            K1: {
                main: status('error', {
                    stoppedAfterFailures: true,
                    failures: 5,
                    message: 'Connection refused',
                }),
                backup: null,
            },
        }),
    );
    assert.match(title, /stopped after 5 failed attempts/);
    assert.match(title, /Connection refused/);
});

test('a color set by hand wins over the reported status', () => {
    const { color, title } = getKeyDisplay(
        key({ color: KEY_COLORS.WARNING }),
        report({ K1: { main: status('running'), backup: null } }),
    );
    assert.equal(color.bgCss, 'tint-warning');
    assert.match(title, /set by hand/i);
});
