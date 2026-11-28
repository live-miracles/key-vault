// Applies supabase/migrations to a throwaway Postgres (Docker) and exercises the schema
// and the SQL functions the Edge Functions call. Not part of `npm test` because it needs
// Docker: run it with `npm run test:db`.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const name = `key-vault-db-check-${process.pid}`;

function docker(args, input) {
    const result = spawnSync('docker', args, { encoding: 'utf8', input });
    if (result.error) throw result.error;
    return result;
}

function psql(sql, { fail = false } = {}) {
    const result = docker(
        ['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA'],
        sql,
    );
    if (fail) {
        assert.notEqual(result.status, 0, `expected an error from: ${sql}`);
        return result.stderr;
    }
    assert.equal(result.status, 0, `${sql}\n${result.stderr}`);
    return result.stdout.trim();
}

const started = docker([
    'run',
    '-d',
    '--rm',
    '--name',
    name,
    '-e',
    'POSTGRES_PASSWORD=test',
    'postgres:17-alpine',
]);
assert.equal(started.status, 0, started.stderr);

try {
    for (let i = 0; ; i += 1) {
        const ready = docker(['exec', name, 'pg_isready', '-U', 'postgres']);
        // The image restarts once after initialising; wait for a query to succeed.
        if (
            ready.status === 0 &&
            docker(['exec', name, 'psql', '-U', 'postgres', '-c', 'select 1']).status === 0
        ) {
            break;
        }
        assert.ok(i < 60, 'Postgres did not start');
        spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 500)']);
    }

    const dir = path.join(root, 'supabase', 'migrations');
    for (const file of readdirSync(dir).sort()) {
        if (file.endsWith('_global_admins.sql')) {
            // This one moves data, so give it some to move: an admin or owner of an event
            // becomes an admin of every event, once however many events or cases they had.
            psql(`
                insert into public.events (id, name) values
                  ('00000000-0000-4000-8000-000000000001', 'Old one'),
                  ('00000000-0000-4000-8000-000000000002', 'Old two');
                insert into public.roles (event_id, email, type) values
                  ('00000000-0000-4000-8000-000000000001', 'Ann@Example.test', 'admin'),
                  ('00000000-0000-4000-8000-000000000002', 'ann@example.test', 'admin'),
                  ('00000000-0000-4000-8000-000000000002', 'Boss@Example.test', 'owner'),
                  ('00000000-0000-4000-8000-000000000002', 'ed@example.test', 'editor'),
                  ('00000000-0000-4000-8000-000000000001', 'vi@example.test', 'viewer');
            `);
        }
        psql(readFileSync(path.join(dir, file), 'utf8'));
        console.log('applied', file);
        if (file.endsWith('_global_admins.sql')) {
            assert.equal(
                psql(
                    `select string_agg(lower(email::text), ',' order by email) from public.app_admins`,
                ),
                'ann@example.test,boss@example.test',
            );
            assert.equal(
                psql(`select string_agg(distinct type, ',' order by type) from public.roles`),
                'editor,viewer',
            );
            assert.equal(psql(`select count(*) from public.roles`), '2');
            psql(`delete from public.app_admins; delete from public.events`);
        }
    }

    // ---- ids, events, roles ----
    // Ids are random UUIDs the database makes; the caller never picks one.
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const newEvent = (eventName) =>
        psql(
            `with e as (insert into public.events (name) values ('${eventName}') returning id) select id from e`,
        );
    const eventId = newEvent('Event one');
    assert.match(eventId, uuid);
    const bare = { event: { id: newEvent('Event two') } };
    assert.notEqual(bare.event.id, eventId);
    // The function that made an event and its admin role is gone: admins have every event.
    psql(`select public.create_event('Event x', null)`, { fail: true });

    // ---- inputs ----
    // An input belongs to one event: its order and its names are that event's own.
    const english = JSON.parse(psql(`select public.create_input('${eventId}', 'English')`));
    assert.match(english.id, uuid);
    assert.equal(english.event, eventId);
    assert.equal(english.name, 'English');
    assert.equal(english.position, 1);
    const hindi = JSON.parse(psql(`select public.create_input('${eventId}', 'Hindi')`));
    assert.equal(hindi.position, 2);
    const otherEnglish = JSON.parse(
        psql(`select public.create_input('${bare.event.id}', 'English')`),
    );
    assert.equal(otherEnglish.position, 1);
    psql(`select public.create_input('${eventId}', 'english')`, { fail: true });
    psql(`select public.create_input(gen_random_uuid(), 'Tamil')`, { fail: true });
    psql(
        `select public.reorder_inputs('${eventId}', array['${hindi.id}', '${english.id}']::uuid[])`,
    );
    assert.equal(
        psql(
            `select string_agg(name, ',' order by sort_order) from public.inputs where event_id = '${eventId}'`,
        ),
        'Hindi,English',
    );
    assert.equal(psql(`select sort_order from public.inputs where id = '${otherEnglish.id}'`), '1');
    // ---- keys ----
    psql(`insert into public.keys (event_id, name, input_id, platform, stream_key)
          values ('${eventId}', 'Main', '${english.id}', 'yt', 'abcd-1234')`);
    assert.match(psql(`select id from public.keys`), uuid);
    // Who last changed a destination: unknown ('') until the API records it, and only 'added'
    // or 'edited' once it does.
    assert.equal(psql(`select updated_by || '|' || updated_action from public.keys`), '|');
    psql(`update public.keys set updated_action = 'deleted'`, { fail: true });
    psql(`update public.keys set updated_by = 'a@example.test', updated_action = 'edited'`);
    assert.equal(psql(`select updated_action from public.keys`), 'edited');
    // Only the platforms Key Vault knows.
    psql(
        `insert into public.keys (event_id, name, input_id, platform, stream_key)
          values ('${eventId}', 'Bad platform', '${english.id}', 'twitch', 'k')`,
        { fail: true },
    );
    psql(
        `insert into public.keys (event_id, name, input_id, platform, stream_key, backup_platform)
          values ('${eventId}', 'Bad backup', '${english.id}', 'vc', 'k', 'twitch')`,
        { fail: true },
    );
    // An input a destination or a role still uses cannot be deleted.
    psql(`delete from public.inputs where id = '${english.id}'`, { fail: true });
    psql(
        `insert into public.roles (event_id, email, type, input_id) values ('${eventId}', 'v@example.test', 'viewer', '${hindi.id}')`,
    );
    psql(`delete from public.inputs where id = '${hindi.id}'`, { fail: true });
    psql(
        `insert into public.roles (event_id, email, type) values (gen_random_uuid(), 'x@example.test', 'editor')`,
        { fail: true },
    );
    psql(
        `insert into public.roles (event_id, email, type) values ('${eventId}', 'x@example.test', 'boss')`,
        { fail: true },
    );
    // Emails compare without case.
    assert.equal(psql(`select count(*) from public.roles where email = 'V@EXAMPLE.TEST'`), '1');
    // Who gave the access is empty unless the API says so.
    assert.equal(psql(`select added_by from public.roles where email = 'v@example.test'`), '');
    // Admins and owners are not a role: admins are listed once for the app, by email, without case.
    for (const type of ['admin', 'owner']) {
        psql(
            `insert into public.roles (event_id, email, type) values ('${eventId}', 'o@example.test', '${type}')`,
            { fail: true },
        );
    }
    psql(
        `insert into public.app_admins (email, added_by) values ('Boss@Example.test', 'a@example.test')`,
    );
    psql(`insert into public.app_admins (email) values ('boss@example.test')`, { fail: true });
    assert.equal(psql(`select email from public.app_admins`), 'Boss@Example.test');
    psql(`delete from public.app_admins`);
    // A deleted event is kept, with a time and who deleted it, until the API removes it.
    const trashed = { event: { id: newEvent('Event three') } };
    assert.equal(psql(`select count(*) from public.events where deleted_at is not null`), '0');
    psql(
        `update public.events set deleted_at = now() - interval '31 days', deleted_by = 'a@example.test' where id = '${trashed.event.id}'`,
    );
    psql(`delete from public.events where deleted_at < now() - interval '30 days'`);
    assert.equal(psql(`select count(*) from public.events where id = '${trashed.event.id}'`), '0');
    // Deleting an event takes its roles, keys and inputs with it, and leaves the others alone.
    psql(`delete from public.events where id = '${eventId}'`);
    assert.equal(psql(`select count(*) from public.keys`), '0');
    assert.equal(psql(`select count(*) from public.roles`), '0');
    assert.equal(psql(`select string_agg(id::text, ',') from public.inputs`), otherEnglish.id);

    // ---- history ----
    // A change is a row with who, when, and the row before and after. It has no foreign key:
    // the history of an event outlives its row.
    const ghost = '00000000-0000-4000-8000-0000000000ff';
    psql(
        `insert into public.changes (by, event_id, kind, row_id, action, after)
         values ('a@example.test', '${ghost}', 'key', '${ghost}', 'added', '{"name": "Main"}')`,
    );
    assert.equal(psql(`select id from public.changes`), '1');
    for (const [kind, action] of [
        ['folder', 'added'],
        ['key', 'renamed'],
    ]) {
        psql(
            `insert into public.changes (by, kind, row_id, action) values ('a', '${kind}', '${ghost}', '${action}')`,
            { fail: true },
        );
    }
    psql(`delete from public.changes where at < now() - interval '30 days'`);
    assert.equal(psql(`select count(*) from public.changes`), '1');
    psql(`delete from public.changes`);

    // Turning an event into an earlier version, and recording it, is one transaction.
    const historic = newEvent('Event four');
    const input = (name) =>
        JSON.parse(psql(`select public.create_input('${historic}', '${name}')`));
    const a = input('English');
    const b = input('Hindi');
    const c = input('Tamil');
    const keyId = psql(
        `with k as (insert into public.keys (event_id, name, input_id, platform, stream_key)
          values ('${historic}', 'Main', '${a.id}', 'yt', 'abcd-1234') returning id) select id from k`,
    );
    const roleId = psql(
        `with r as (insert into public.roles (event_id, email, type, input_id)
          values ('${historic}', 'v@example.test', 'viewer', '${c.id}') returning id) select id from r`,
    );
    const apply = (steps, changes = []) =>
        `select public.apply_event_version('${historic}',
            '${JSON.stringify(steps)}'::jsonb, '${JSON.stringify(changes)}'::jsonb)`;
    const none = {
        eventName: null,
        upsertInputs: [],
        deleteInputs: [],
        upsertKeys: [],
        deleteKeys: [],
        upsertRoles: [],
        deleteRoles: [],
    };
    const stamp = { updatedBy: 'a@example.test', updatedAction: 'edited', updatedAt: '' };
    const recorded = {
        at: '2026-11-19T10:00:00.000Z',
        by: 'a@example.test',
        event: historic,
        kind: 'input',
        rowId: a.id,
        action: 'edited',
        before: { id: a.id, name: 'English' },
        after: { id: a.id, name: 'Hindi' },
        batch: '00000000-0000-4000-8000-0000000000aa',
        restoredTo: 3,
    };
    const state = () =>
        psql(`
            select (select name from public.events where id = '${historic}')
              || '|' || (select string_agg(name || sort_order, ',' order by sort_order) from public.inputs where event_id = '${historic}')
              || '|' || (select string_agg(name, ',') from public.keys where event_id = '${historic}')
              || '|' || (select count(*) from public.roles where event_id = '${historic}')
              || '|' || (select count(*) from public.changes)`);
    assert.equal(state(), 'Event four|English1,Hindi2,Tamil3|Main|1|0');

    // Two inputs swap names, and the unique index on (event, name) does not stop it. A new
    // input, a changed destination and the event's name come with it; the person and the input
    // that were added since go away; and the change is recorded in the same step.
    const added = JSON.parse(psql(`select public.create_input('${historic}', 'Added since')`));
    const swap = {
        ...none,
        eventName: 'Event five',
        upsertInputs: [
            { id: a.id, event: historic, name: 'Hindi', position: 2 },
            { id: b.id, event: historic, name: 'English', position: 1 },
        ],
        deleteInputs: [added.id],
        upsertKeys: [
            {
                id: keyId,
                event: historic,
                name: 'Renamed',
                input: b.id,
                platform: 'yt',
                streamKey: 'abcd-5678',
                backupPlatform: '',
                backupStreamKey: '',
                link: '',
                remarks: '',
                ...stamp,
            },
        ],
        deleteRoles: [roleId],
    };
    psql(apply(swap, [recorded]));
    assert.equal(state(), 'Event five|English1,Hindi2,Tamil3|Renamed|0|1');
    // The same names as before, on the other inputs: they really swapped.
    assert.equal(psql(`select name from public.inputs where id = '${a.id}'`), 'Hindi');
    assert.equal(psql(`select name from public.inputs where id = '${b.id}'`), 'English');
    assert.equal(psql(`select id from public.keys where name = 'Renamed'`), keyId);
    assert.equal(
        psql(`select updated_by || '|' || updated_action from public.keys`),
        'a@example.test|edited',
    );
    assert.equal(
        psql(
            `select by || '|' || event_id || '|' || kind || '|' || action || '|' || (after ->> 'name') || '|' || batch || '|' || restored_to from public.changes`,
        ),
        `a@example.test|${historic}|input|edited|Hindi|00000000-0000-4000-8000-0000000000aa|3`,
    );

    // A step that cannot be applied undoes all the others, the record included.
    const missing = '00000000-0000-4000-8000-0000000000ee';
    const broken = {
        ...none,
        eventName: 'Never',
        upsertInputs: [{ id: a.id, event: historic, name: 'Elsewhere', position: 9 }],
        deleteKeys: [keyId],
        upsertRoles: [
            {
                id: roleId,
                event: historic,
                email: 'v@example.test',
                type: 'viewer',
                input: missing,
            },
        ],
    };
    psql(apply(broken, [recorded]), { fail: true });
    assert.equal(state(), 'Event five|English1,Hindi2,Tamil3|Renamed|0|1');
    // A row of another event is not touched, even under its id.
    const foreign = psql(
        `with k as (insert into public.keys (event_id, name, input_id, platform, stream_key)
          values ('${bare.event.id}', 'Theirs', '${otherEnglish.id}', 'yt', 'abcd-9999') returning id) select id from k`,
    );
    psql(
        apply({ ...none, upsertKeys: [{ ...swap.upsertKeys[0], id: foreign, name: 'Hijacked' }] }),
    );
    assert.equal(psql(`select name from public.keys where id = '${foreign}'`), 'Theirs');
    psql(
        `select public.apply_event_version(gen_random_uuid(), '${JSON.stringify(none)}'::jsonb, '[]'::jsonb)`,
        {
            fail: true,
        },
    );
    psql(`delete from public.changes; delete from public.events where id = '${historic}'`);

    // ---- heartbeat ----
    const hash = (c) => c.repeat(32);
    const beat = (outputs) =>
        `select public.ingest_heartbeat('prod', now(), '${JSON.stringify(outputs)}'::jsonb)`;
    const output = (c, status, extra = {}) => ({
        hash: hash(c),
        pipeline: 'Hindi',
        output: 'YouTube',
        status,
        message: '',
        failures: 0,
        stoppedAfterFailures: false,
        sinceMs: 5,
        ...extra,
    });

    assert.equal(psql(beat([output('a', 'running'), output('b', 'error', { failures: 3 })])), '2');
    assert.equal(psql(`select count(*) from public.stream_outputs`), '2');
    // The next beat replaces the previous one, it does not add to it.
    assert.equal(psql(beat([output('a', 'warning')])), '1');
    assert.equal(psql(`select status from public.stream_outputs`), 'warning');
    assert.equal(
        psql(`select output_count from public.ingest_instances where instance = 'prod'`),
        '1',
    );
    // Inputs are replaced with the outputs, and are optional.
    const inputBeat = (inputs) =>
        `select public.ingest_heartbeat('prod', now(), '[]'::jsonb, '${JSON.stringify(inputs)}'::jsonb)`;
    assert.equal(
        psql(inputBeat([{ pipeline: 'Hindi', status: 'error', message: 'no signal' }])),
        '0',
    );
    assert.equal(psql(`select pipeline || ':' || status from public.stream_inputs`), 'Hindi:error');
    psql(inputBeat([{ pipeline: '', status: 'running' }]), { fail: true });
    psql(inputBeat([{ pipeline: 'Hindi', status: 'bogus' }]), { fail: true });
    assert.equal(psql(beat([])), '0');
    assert.equal(psql(`select count(*) from public.stream_inputs`), '0');
    assert.equal(psql(beat([])), '0');
    assert.equal(psql(`select count(*) from public.stream_outputs`), '0');

    // A second instance is independent.
    psql(
        `select public.ingest_heartbeat('dev', now(), '${JSON.stringify([output('c', 'stopped')])}'::jsonb)`,
    );
    assert.equal(psql(beat([output('a', 'running')])), '1');
    assert.equal(psql(`select count(*) from public.stream_outputs`), '2');

    // A bad row rejects the whole beat and keeps the previous one.
    psql(beat([output('a', 'running'), { ...output('b', 'running'), hash: 'not-a-hash' }]), {
        fail: true,
    });
    assert.equal(psql(`select count(*) from public.stream_outputs where instance = 'prod'`), '1');
    psql(beat([output('a', 'bogus')]), { fail: true });
    // bunryu's Server Name is a free-form label ("Bunryu" is its default), so it is kept as typed.
    psql(`select public.ingest_heartbeat('Prod Server', now(), '[]'::jsonb)`);
    assert.equal(
        psql(`select count(*) from public.ingest_instances where instance = 'Prod Server'`),
        '1',
    );
    psql(`delete from public.ingest_instances where instance = 'Prod Server'`);
    psql(`select public.ingest_heartbeat('', now(), '[]'::jsonb)`, { fail: true });
    psql(`select public.ingest_heartbeat('${'a'.repeat(81)}', now(), '[]'::jsonb)`, { fail: true });

    // An instance silent for a month is dropped by the next beat of anyone.
    psql(
        `update public.ingest_instances set last_seen_at = now() - interval '31 days' where instance = 'dev'`,
    );
    psql(beat([output('a', 'running')]));
    assert.equal(psql(`select string_agg(instance, ',') from public.ingest_instances`), 'prod');
    assert.equal(psql(`select count(*) from public.stream_outputs where instance = 'dev'`), '0');

    // At most 20 bunryu servers are kept: a new one is refused once 20 report, a known one never,
    // and one silent for a month makes room.
    for (let i = 2; i <= 20; i += 1) {
        psql(`select public.ingest_heartbeat('server ${i}', now(), '[]'::jsonb)`);
    }
    assert.equal(psql(`select count(*) from public.ingest_instances`), '20');
    const refused = psql(`select public.ingest_heartbeat('server 21', now(), '[]'::jsonb)`, {
        fail: true,
    });
    assert.match(refused, /too many bunryu servers/);
    psql(beat([output('a', 'running')]));
    psql(
        `update public.ingest_instances set last_seen_at = now() - interval '31 days' where instance = 'server 2'`,
    );
    psql(`select public.ingest_heartbeat('server 21', now(), '[]'::jsonb)`);
    assert.equal(psql(`select count(*) from public.ingest_instances`), '20');
    psql(`delete from public.ingest_instances where instance <> 'prod'`);

    // ---- access ----
    assert.equal(
        psql(
            `select bool_and(relrowsecurity) from pg_class where relnamespace = 'public'::regnamespace
             and relname in ('events','inputs','roles','keys','changes','ingest_instances','stream_outputs','stream_inputs')`,
        ),
        't',
    );
    assert.equal(
        psql(`select count(*) from pg_policies where schemaname = 'public'`),
        '0',
        'no policy: the browser has no direct access',
    );

    console.log('migration checks passed');
} finally {
    docker(['rm', '-f', name]);
}
