import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiError } from '../supabase/functions/_shared/types.ts';
import { createActions } from '../frontend/src/actions.ts';
import { createDemoBackend } from '../frontend/src/demo/demo-backend.ts';
import { AppStore } from '../frontend/src/store.ts';

// A store on the demo backend (the server's real operations), with the errors and the busy
// signal recorded. `override` replaces single operations, for slow or failing ones.
async function setup(override = {}) {
    const demo = await createDemoBackend();
    const calls = [];
    const backend = new Proxy(demo, {
        get(target, name) {
            if (name in override) {
                return (input) => {
                    calls.push(name);
                    return override[name](input, target[name].bind(target));
                };
            }
            const method = target[name];
            if (typeof method !== 'function') return method;
            return (input) => {
                calls.push(name);
                return method(input);
            };
        },
    });
    const errors = [];
    const busy = [];
    const store = new AppStore();
    store.start(backend, { onError: (m) => errors.push(m), onBusy: (b) => busy.push(b) });
    await store.refresh();
    return { store, actions: createActions(store), demo, errors, busy, calls };
}

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('the store loads what the server sends for this person', async () => {
    const { store } = await setup();
    assert.equal(store.data.events.length, 2);
    assert.equal(store.data.isAppOwner, true);
});

test('a change shows at once, then takes in the server’s answer', async () => {
    const gate = deferred();
    const { store, actions, busy } = await setup({
        addInput: async (input, real) => {
            await gate.promise;
            return real(input);
        },
    });
    const event = store.data.events[0].id;
    const before = store.data.inputs.length;

    const done = actions.addInput(event, 'Marathi');
    await tick();
    // Shown before the server has answered, marked as still saving.
    const waiting = store.data.inputs.find((i) => i.name === 'Marathi');
    assert.equal(store.data.inputs.length, before + 1);
    assert.equal(waiting.pending, true);
    assert.deepEqual(busy, [true]);

    gate.resolve();
    assert.equal(await done, true);
    const saved = store.data.inputs.find((i) => i.name === 'Marathi');
    assert.equal(store.data.inputs.length, before + 1);
    assert.equal(saved.pending, undefined);
    assert.match(saved.id, /^[0-9a-f-]{36}$/);
    assert.deepEqual(busy, [true, false]);
});

test('a refused change goes back to what it was and says why in the server’s words', async () => {
    const { store, actions, errors } = await setup();
    const winter = store.data.events[0];
    const keysBefore = structuredClone(store.data.keys);
    const input = store.data.inputs.find((i) => i.event === winter.id).id;

    // The same address as the first YouTube destination: the server refuses.
    const first = store.data.keys.find((k) => k.event === winter.id && k.platform === 'yt');
    const ok = await actions.saveKey({
        event: winter.id,
        name: 'Duplicate',
        input,
        platform: 'yt',
        streamKey: first.streamKey,
        backupPlatform: '',
        backupStreamKey: '',
        link: '',
        remarks: '',
    });

    assert.equal(ok, false);
    assert.deepEqual(store.data.keys, keysBefore);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /already added in this event/);
});

test('a failure that is not the server’s refusal is told in plain words', async () => {
    const { store, actions, errors } = await setup({
        deleteKey: async () => {
            throw new TypeError('Failed to fetch');
        },
    });
    const quiet = console.error;
    console.error = () => {};
    try {
        const count = store.data.keys.length;
        assert.equal(await actions.removeKey(store.data.keys[0].id), false);
        assert.equal(store.data.keys.length, count);
    } finally {
        console.error = quiet;
    }
    assert.deepEqual(errors, ['Something went wrong. Please try again.']);
});

test('changes are sent one after another, so going back is always to a real state', async () => {
    const gate = deferred();
    const order = [];
    const { store, actions } = await setup({
        editInput: async (input, real) => {
            order.push('rename started');
            await gate.promise;
            order.push('rename done');
            return real(input);
        },
        deleteKey: async (input, real) => {
            order.push('delete started');
            return real(input);
        },
    });
    const input = store.data.inputs[0].id;
    const key = store.data.keys[0].id;

    const first = actions.renameInput(input, 'Renamed');
    const second = actions.removeKey(key);
    await tick();
    assert.deepEqual(order, ['rename started']);
    gate.resolve();
    await Promise.all([first, second]);
    assert.deepEqual(order, ['rename started', 'rename done', 'delete started']);
    assert.equal(store.data.inputs.find((i) => i.id === input).name, 'Renamed');
    assert.equal(
        store.data.keys.some((k) => k.id === key),
        false,
    );
});

test('a refresh never replaces the data while a change is on its way', async () => {
    const gate = deferred();
    const { store, actions, calls } = await setup({
        editInput: async (input, real) => {
            await gate.promise;
            return real(input);
        },
    });
    const input = store.data.inputs[0].id;
    const loads = () => calls.filter((c) => c === 'getAllData').length;

    const change = actions.renameInput(input, 'Newer name');
    await tick();
    const loadsBefore = loads();
    assert.equal(await store.refresh(), false);
    // Not even asked: the old data would only be shown over the new.
    assert.equal(loads(), loadsBefore);
    assert.equal(store.data.inputs.find((i) => i.id === input).name, 'Newer name');

    gate.resolve();
    await change;
    // The refresh that was held back runs once the change is done.
    await tick();
    await tick();
    assert.equal(loads(), loadsBefore + 1);
    assert.equal(store.data.inputs.find((i) => i.id === input).name, 'Newer name');
});

test('a refresh that was already loading is dropped if a change starts meanwhile', async () => {
    const slowLoad = deferred();
    let slow = false;
    const { store, actions } = await setup({
        getAllData: async (input, real) => {
            const answer = await real(input);
            if (slow) await slowLoad.promise;
            return answer;
        },
    });
    const input = store.data.inputs[0].id;

    slow = true;
    const refresh = store.refresh();
    await tick();
    slow = false;
    await actions.renameInput(input, 'During the load');
    slowLoad.resolve();
    // What the server sent before the change would have undone it on screen.
    assert.equal(await refresh, false);
    assert.equal(store.data.inputs.find((i) => i.id === input).name, 'During the load');
});

test('a failed refresh keeps the data and says so; a failed status check keeps the last report', async () => {
    let failing = false;
    const { store, errors } = await setup({
        getAllData: async (input, real) => {
            if (failing) throw new ApiError('unavailable', 'Could not reach the server.');
            return real(input);
        },
        getStatus: async (input, real) => {
            if (failing) throw new Error('offline');
            return real(input);
        },
    });
    await store.refreshStatus();
    const report = store.status;
    assert.equal(report.online, true);

    failing = true;
    const quiet = console.error;
    console.error = () => {};
    try {
        assert.equal(await store.refresh(), false);
        assert.equal(await store.refreshStatus(), false);
    } finally {
        console.error = quiet;
    }
    assert.deepEqual(errors, ['Could not reach the server.']);
    assert.equal(store.data.events.length, 2);
    assert.equal(store.status, report);
});

test('listeners are told whether the data or only the status changed', async () => {
    const { store, actions } = await setup();
    const kinds = [];
    store.subscribe((kind) => kinds.push(kind));
    await store.refreshStatus();
    await actions.renameEvent(store.data.events[0].id, 'Winter');
    assert.equal(kinds[0], 'status');
    assert.ok(kinds.slice(1).every((kind) => kind === 'data'));
    assert.ok(kinds.length >= 3);
});
