-- At most 20 bunryu servers are kept. Each one that reports adds a row to ingest_instances and up
-- to 1,000 outputs and 1,000 inputs, so without a limit whoever holds the ingest token could fill
-- the database by sending reports under ever new Server Names. A real setup has a handful.
--
-- A report from a server already known is always stored. A report from a new one is refused
-- once 20 are known; a server silent for 30 days is removed first, so its place comes free.
-- The `ingest` function answers a refused report with HTTP 409 and logs it.

create or replace function public.ingest_heartbeat(
  p_instance text,
  p_sent_at timestamptz,
  p_outputs jsonb,
  p_inputs jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  stored integer;
begin
  -- A bunryu that has not reported for a month is gone; do not keep it for ever.
  delete from public.ingest_instances where last_seen_at < now() - interval '30 days';

  if not exists (select 1 from public.ingest_instances where instance = p_instance) then
    -- Two new servers reporting at once are counted one after the other.
    perform pg_advisory_xact_lock(hashtext('key-vault/ingest-instances'));
    if (select count(*) from public.ingest_instances) >= 20 then
      raise exception 'too many bunryu servers: % are reporting already', 20;
    end if;
  end if;

  insert into public.ingest_instances (instance, last_seen_at, sent_at, output_count)
  values (p_instance, now(), p_sent_at, jsonb_array_length(p_outputs))
  on conflict (instance) do update
    set last_seen_at = now(), sent_at = excluded.sent_at, output_count = excluded.output_count;

  delete from public.stream_outputs where instance = p_instance;
  delete from public.stream_inputs where instance = p_instance;

  insert into public.stream_outputs
    (instance, hash, pipeline, output, status, message, failures, stopped_after_failures, since_ms)
  select
    p_instance,
    o ->> 'hash',
    coalesce(o ->> 'pipeline', ''),
    coalesce(o ->> 'output', ''),
    o ->> 'status',
    coalesce(o ->> 'message', ''),
    coalesce((o ->> 'failures')::integer, 0),
    coalesce((o ->> 'stoppedAfterFailures')::boolean, false),
    coalesce((o ->> 'sinceMs')::bigint, 0)
  from jsonb_array_elements(p_outputs) as o;
  get diagnostics stored = row_count;

  insert into public.stream_inputs (instance, pipeline, status, message, since_ms)
  select
    p_instance,
    i ->> 'pipeline',
    i ->> 'status',
    coalesce(i ->> 'message', ''),
    coalesce((i ->> 'sinceMs')::bigint, 0)
  from jsonb_array_elements(p_inputs) as i;

  return stored;
end;
$$;

-- `create or replace` keeps the function's privileges; restated so this file stands on its own.
revoke execute on function public.ingest_heartbeat(text, timestamptz, jsonb, jsonb) from public;

do $$
declare
  api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('revoke execute on function public.ingest_heartbeat(text, timestamptz, jsonb, jsonb) from %I', api_role);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.ingest_heartbeat(text, timestamptz, jsonb, jsonb) to service_role;
  end if;
end;
$$;
