import assert from 'node:assert/strict';
import test from 'node:test';

import { createActions } from '../frontend/src/actions.ts';
import { createDemoBackend } from '../frontend/src/demo/demo-backend.ts';
import { AppStore } from '../frontend/src/store.ts';

async function setup() {
    const demo = await createDemoBackend();
    const errors = [];
    const store = new AppStore();
    store.start(demo, { onError: (m) => errors.push(m) });
    await store.refresh();
    return { store, actions: createActions(store), demo, errors };
}

const winterOf = (store) => store.data.events.find((e) => e.name === 'Winter Retreat');

test('adding an event shows "Event N" at once, then moves to the real id', async () => {
    const { store, actions, demo } = await setup();
    const selected = [];

    assert.equal(await actions.addEvent((id) => selected.push(id)), true);

    assert.equal(selected.length, 2);
    assert.match(selected[0], /^new-/);
    const added = store.data.events.find((e) => e.id === selected[1]);
    assert.equal(added.name, 'Event 1');
    assert.equal(added.pending, undefined);
    assert.equal(
        store.data.events.some((e) => e.id === selected[0]),
        false,
    );
    assert.equal(
        demo.store.state.events.some((e) => e.id === selected[1]),
        true,
    );
});

test('renaming and deleting an event, with the next one opened', async () => {
    const { store, actions, demo } = await setup();
    const winter = winterOf(store);

    await actions.renameEvent(winter.id, 'Winter Camp');
    assert.equal(store.data.events.find((e) => e.id === winter.id).name, 'Winter Camp');
    assert.equal(demo.store.state.events.find((e) => e.id === winter.id).name, 'Winter Camp');

    const selected = [];
    await actions.deleteEvent(winter.id, (id) => selected.push(id));
    assert.equal(
        store.data.events.some((e) => e.id === winter.id),
        false,
    );
    assert.equal(
        store.data.keys.some((k) => k.event === winter.id),
        false,
    );
    assert.equal(
        demo.store.state.keys.some((k) => k.event === winter.id),
        false,
    );
    assert.deepEqual(selected, [store.data.events[0].id]);
});

test('inputs: add (and open it), rename, reorder, and delete one that is in use', async () => {
    const { store, actions, demo, errors } = await setup();
    const winter = winterOf(store);
    const inputsOfWinter = () => store.data.inputs.filter((i) => i.event === winter.id);

    const opened = [];
    assert.equal(await actions.addInput(winter.id, 'Marathi', (id) => opened.push(id)), true);
    const marathi = inputsOfWinter().find((i) => i.name === 'Marathi');
    assert.deepEqual(opened, [marathi.id]);
    assert.equal(marathi.position, 5);

    await actions.renameInput(marathi.id, 'Marathi Live');
    assert.equal(demo.store.state.inputs.find((i) => i.id === marathi.id).name, 'Marathi Live');

    const reversed = inputsOfWinter()
        .map((i) => i.id)
        .reverse();
    await actions.reorderInputs(winter.id, reversed);
    assert.deepEqual(
        demo.store.state.inputs.filter((i) => i.event === winter.id).map((i) => i.id),
        reversed,
    );
    assert.equal(inputsOfWinter().find((i) => i.id === reversed[0]).position, 1);

    // An input that still has destinations stays, and the screen goes back.
    const english = inputsOfWinter().find((i) => i.name === 'English');
    assert.equal(await actions.removeInput(english.id), false);
    assert.equal(
        store.data.inputs.some((i) => i.id === english.id),
        true,
    );
    assert.match(errors[0], /still has destinations/);

    assert.equal(await actions.removeInput(marathi.id), true);
    assert.equal(
        store.data.inputs.some((i) => i.id === marathi.id),
        false,
    );
});

test('roles: add, change and remove, with the server making the id', async () => {
    const { store, actions, demo } = await setup();
    const winter = winterOf(store);
    const hindi = store.data.inputs.find((i) => i.event === winter.id && i.name === 'Hindi');

    assert.equal(
        await actions.saveRole({
            id: '',
            event: winter.id,
            email: 'New@Example.org',
            type: 'editor',
            input: hindi.id,
        }),
        true,
    );
    const role = store.data.roles.find((r) => r.email === 'new@example.org');
    assert.equal(role.pending, undefined);
    assert.equal(role.canChange, true);
    assert.equal(
        demo.store.state.roles.some((r) => r.id === role.id),
        true,
    );

    await actions.saveRole({
        id: role.id,
        event: winter.id,
        email: role.email,
        type: 'viewer',
        input: null,
    });
    assert.equal(store.data.roles.find((r) => r.id === role.id).type, 'viewer');
    assert.equal(demo.store.state.roles.find((r) => r.id === role.id).input, null);

    await actions.removeRole(role.id);
    assert.equal(
        store.data.roles.some((r) => r.id === role.id),
        false,
    );
});

test('destinations: add shows a saving card, then the real one; edit and delete', async () => {
    const { store, actions, demo } = await setup();
    const winter = winterOf(store);
    const input = store.data.inputs.find((i) => i.event === winter.id && i.name === 'German');
    const fields = {
        event: winter.id,
        name: 'Facebook German',
        input: input.id,
        platform: 'fb',
        streamKey: 'FB-5-0-AaBb',
        backupPlatform: 'fb',
        backupStreamKey: 'FB-5-1-CcDd',
        link: '',
        remarks: '',
    };

    assert.equal(await actions.saveKey(fields), true);
    const key = store.data.keys.find((k) => k.name === 'Facebook German');
    assert.equal(key.pending, undefined);
    assert.equal(key.canChange, true);
    assert.equal(key.updatedBy.length > 0, true);
    assert.equal(
        demo.store.state.keys.some((k) => k.id === key.id),
        true,
    );

    await actions.saveKey({ ...fields, name: 'Facebook Deutsch' }, key.id);
    assert.equal(store.data.keys.find((k) => k.id === key.id).name, 'Facebook Deutsch');
    assert.equal(store.data.keys.filter((k) => k.name.startsWith('Facebook D')).length, 1);

    await actions.removeKey(key.id);
    assert.equal(
        store.data.keys.some((k) => k.id === key.id),
        false,
    );
    assert.equal(
        demo.store.state.keys.some((k) => k.id === key.id),
        false,
    );
});
