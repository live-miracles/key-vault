import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiError } from '../supabase/functions/_shared/types.ts';
import { createDemoBackend } from '../frontend/src/demo/demo-backend.ts';
import { DEMO_EMAIL } from '../frontend/src/demo/demo-data.ts';
import { platformName } from '../supabase/functions/_shared/platforms.ts';

test('the demo is the real operations on an in-memory store, as an app owner', async () => {
    const backend = await createDemoBackend();
    const data = await backend.getAllData();

    assert.equal(data.userEmail, DEMO_EMAIL);
    assert.equal(data.isAppOwner, true);
    assert.equal(data.canCreateEvents, true);
    assert.equal(data.events.length, 2);
    // The server's own flags, not a copy of its rules.
    assert.ok(data.events.every((e) => e.can.rename && e.can.delete && e.can.manageInputs));
    assert.ok(data.keys.every((k) => k.canChange));
    assert.ok(data.inputs.every((i) => i.canAddKeys));
    // Every id is random, never a hand-picked one.
    assert.ok(
        [...data.events, ...data.keys, ...data.inputs].every((x) => /^[0-9a-f-]{36}$/.test(x.id)),
    );
});

test('it has a destination of every platform, an SRT link among them', async () => {
    const { keys } = await (await createDemoBackend()).getAllData();
    const platforms = new Set(keys.map((k) => k.platform));
    for (const platform of ['yt', 'fb', 'ig', 'vc', 'rtmp', 'srt']) {
        assert.ok(platforms.has(platform), platformName(platform));
    }
});

test("bunryu's report matches the destinations by really hashing their addresses", async () => {
    const backend = await createDemoBackend();
    const { keys, inputs } = await backend.getAllData();
    const report = await backend.getStatus();
    const byName = (name) => keys.find((k) => k.name === name);

    assert.equal(report.online, true);
    const seen = new Set(keys.map((k) => report.keys[k.id]?.state));
    for (const state of ['running', 'warning', 'error', 'stopped', 'not_configured']) {
        assert.ok(seen.has(state), `no destination is ${state}`);
    }

    assert.equal(report.keys[byName('Facebook English').id].state, 'warning');
    assert.equal(report.keys[byName('Instagram English').id].state, 'error');
    assert.equal(report.keys[byName('Instagram English').id].stoppedAfterFailures, true);
    assert.equal(report.keys[byName('Channel 3 SRT Hindi').id].state, 'not_configured');
    assert.equal(report.keys[byName('VdoCipher Hindi').id].state, 'stopped');

    // A link that runs in another input's pipeline, and an input with no signal.
    assert.equal(report.keys[byName('Partner Stream German').id].inputMismatch, true);
    const tamil = inputs.find((i) => i.name === 'Tamil');
    assert.equal(report.inputs[tamil.id].status, 'error');
    assert.equal(report.keys[byName('YouTube Tamil').id].state, 'error');
});

test('the demo reports bunryu as online however long the page has been open', async () => {
    const backend = await createDemoBackend();
    // An old heartbeat: the demo refreshes it, as a bunryu that keeps reporting would.
    backend.store.state.status.instances[0].lastSeenAt = '2000-01-01T00:00:00.000Z';
    assert.equal((await backend.getStatus()).online, true);
});

test('the demo refuses what the server refuses, in the server’s own words', async () => {
    const backend = await createDemoBackend();
    const { events, inputs } = await backend.getAllData();
    const event = events[0].id;
    const input = inputs.find((i) => i.event === event).id;
    const fields = { event, name: 'New one', input, platform: 'yt', streamKey: 'fresh-key-1' };

    await assert.rejects(
        () => backend.addKey({ ...fields, streamKey: 'two words' }),
        (error) =>
            error instanceof ApiError &&
            error.code === 'invalid' &&
            /no spaces/.test(error.message),
    );
    await assert.rejects(
        () => backend.addKey({ ...fields, streamKey: 'abcd-1234-efgh-5678-ijkl' }),
        (error) => error instanceof ApiError && error.code === 'conflict',
    );
    const added = await backend.addKey(fields);
    assert.equal(added.canChange, true);
    assert.ok(added.id);
});

test('the owner can read the settings bunryu needs, and they are not real secrets', async () => {
    const settings = await (await createDemoBackend()).getBunryuSettings();
    assert.match(settings.url, /\/functions\/v1\/ingest$/);
    assert.match(settings.secret, /not-a-real-key/);
});

test('the demo has a history, and every version of Winter Retreat can be compared', async () => {
    const backend = await createDemoBackend();
    const data = await backend.getAllData();
    assert.equal(data.canSeeHistory, true);
    const winter = data.events.find((e) => e.name === 'Winter Retreat');

    const history = await backend.getHistory({ event: winter.id });
    assert.ok(history.length >= 8);
    // Newest first, each with the names the dialog needs.
    assert.deepEqual(
        history.map((c) => c.id),
        history.map((c) => c.id).sort((a, b) => b - a),
    );
    assert.ok(history.every((c) => c.eventName === 'Winter Retreat'));
    // The admin change is in the history of everything, and in no event's own.
    assert.ok(!history.some((c) => c.kind === 'admin'));
    assert.ok((await backend.getHistory({})).some((c) => c.kind === 'admin'));

    // The newest version is the event as it is.
    assert.deepEqual(
        (await backend.compareEvent({ event: winter.id, atChange: history[0].id })).diff,
        [],
    );
    // Every version in between can be worked out.
    for (const change of history) {
        const { then } = await backend.compareEvent({ event: winter.id, atChange: change.id });
        assert.ok(then.event.id === winter.id);
    }

    const start = await backend.compareEvent({ event: winter.id, atChange: 0 });
    assert.equal(start.then.event.name, 'Winter Retreat draft');
    const statuses = Object.fromEntries(
        start.diff
            .filter((d) => d.kind === 'key' || d.kind === 'role')
            .map((d) => [d.then?.name ?? d.then?.email ?? d.now?.name, d.status]),
    );
    // The destination that was deleted since was there at the start.
    assert.equal(statuses['YouTube German old'], 'deleted');
    assert.equal(statuses['Facebook English'], 'changed');
    assert.equal(statuses['Channel 3 SRT Hindi'], 'changed');
});

test('the demo can restore Winter Retreat to the start of its history, and undo that', async () => {
    const backend = await createDemoBackend();
    const { events } = await backend.getAllData();
    const winter = events.find((e) => e.name === 'Winter Retreat');
    const before = await backend.getAllData();

    const { changed } = await backend.restoreEventVersion({ event: winter.id, atChange: 0 });
    assert.ok(changed > 0);
    const after = await backend.getAllData();
    assert.equal(after.events.find((e) => e.id === winter.id).name, 'Winter Retreat draft');
    assert.ok(after.keys.some((k) => k.name === 'YouTube German old'));
    // The other event is untouched.
    const spring = (data) => data.keys.filter((k) => k.event !== winter.id);
    assert.deepEqual(spring(after), spring(before));

    // The restore is the newest entry, one line for all its rows, and reverting it brings back
    // what there was.
    const newest = (await backend.getHistory({ event: winter.id, limit: changed }))[0];
    assert.ok(newest.batch);
    assert.equal(newest.restoredTo, 0);
    const lastBefore =
        Math.min(
            ...(await backend.getHistory({ event: winter.id, limit: changed })).map((c) => c.id),
        ) - 1;
    await backend.restoreEventVersion({ event: winter.id, atChange: lastBefore });
    const undone = await backend.getAllData();
    assert.equal(undone.events.find((e) => e.id === winter.id).name, 'Winter Retreat');
    assert.ok(!undone.keys.some((k) => k.name === 'YouTube German old'));
});
