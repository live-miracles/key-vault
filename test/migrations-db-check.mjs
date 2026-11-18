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
        psql(readFileSync(path.join(dir, file), 'utf8'));
        console.log('applied', file);
    }

    // ---- ids, events, roles ----
    // Ids are random UUIDs the database makes; the caller never picks one.
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const created = JSON.parse(psql(`select public.create_event('Event one', 'a@example.test')`));
    const eventId = created.event.id;
    assert.match(eventId, uuid);
    assert.match(created.adminRole.id, uuid);
    assert.equal(created.adminRole.type, 'admin');
    assert.equal(created.adminRole.input, null);
    const bare = JSON.parse(psql(`select public.create_event('Event two', null)`));
    assert.notEqual(bare.event.id, eventId);
    assert.equal(bare.adminRole, null);

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
    psql(`select public.reorder_inputs('${eventId}', array['${hindi.id}', '${english.id}'])`);
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
    assert.equal(psql(`select count(*) from public.roles where email = 'A@EXAMPLE.TEST'`), '1');
    // Deleting an event takes its roles, keys and inputs with it, and leaves the others alone.
    psql(`delete from public.events where id = '${eventId}'`);
    assert.equal(psql(`select count(*) from public.keys`), '0');
    assert.equal(psql(`select count(*) from public.roles`), '0');
    assert.equal(psql(`select string_agg(id::text, ',') from public.inputs`), otherEnglish.id);

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

    // ---- access ----
    assert.equal(
        psql(
            `select bool_and(relrowsecurity) from pg_class where relnamespace = 'public'::regnamespace
             and relname in ('events','inputs','roles','keys','ingest_instances','stream_outputs','stream_inputs')`,
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
