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
    const created = JSON.parse(psql(`select public.create_event('Event one', 'a@example.test')`));
    assert.equal(created.event.id, 'E1');
    assert.equal(created.adminRole.id, 'R1');
    assert.equal(created.adminRole.type, '2');
    assert.equal(created.adminRole.language, '*');
    const bare = JSON.parse(psql(`select public.create_event('Event two', null)`));
    assert.equal(bare.event.id, 'E2');
    assert.equal(bare.adminRole, null);

    // ---- languages ----
    assert.deepEqual(JSON.parse(psql(`select public.create_language('L1', 'English')`)), {
        id: 'L1',
        name: 'English',
        order: '1',
    });
    assert.equal(JSON.parse(psql(`select public.create_language('L2', 'Hindi')`)).order, '2');
    psql(`select public.reorder_languages(array['L2', 'L1'])`);
    assert.equal(
        psql(`select string_agg(id, ',' order by sort_order) from public.languages`),
        'L2,L1',
    );
    psql(`select public.create_language('bad', 'x')`, { fail: true });

    // ---- keys ----
    psql(`insert into public.keys (event_id, name, language, server, key)
          values ('E1', 'Main', 'L1', 'yt', 'abcd-1234')`);
    assert.equal(psql(`select id from public.keys`), 'K1');
    psql(
        `insert into public.keys (event_id, name, language, server, key, color_override)
          values ('E1', 'Bad color', 'L1', 'yt', 'k', '9')`,
        { fail: true },
    );
    psql(`delete from public.languages where id = 'L1'`, { fail: true });
    psql(`insert into public.roles (event_id, email, type) values ('E9', 'x@example.test', '1')`, {
        fail: true,
    });
    psql(`insert into public.roles (event_id, email, type) values ('E1', 'x@example.test', '7')`, {
        fail: true,
    });
    // Emails compare without case.
    assert.equal(psql(`select count(*) from public.roles where email = 'A@EXAMPLE.TEST'`), '1');
    // Deleting an event takes its roles and keys with it.
    psql(`delete from public.events where id = 'E1'`);
    assert.equal(psql(`select count(*) from public.keys`), '0');
    assert.equal(psql(`select count(*) from public.roles`), '0');

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
    psql(`select public.ingest_heartbeat('Bad Name', now(), '[]'::jsonb)`, { fail: true });

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
             and relname in ('events','languages','roles','keys','ingest_instances','stream_outputs')`,
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
