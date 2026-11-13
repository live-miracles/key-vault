-- What bunryu reports about its outputs (see docs/refactor-plan.md). Only the latest
-- heartbeat of each bunryu is kept: every beat replaces that instance's rows. Outputs are
-- identified by a hash of their destination URL, never the URL.
create table public.ingest_instances (
  instance text primary key check (instance ~ '^[a-z0-9][a-z0-9-]{0,31}$'),
  last_seen_at timestamptz not null,
  sent_at timestamptz not null,
  output_count integer not null default 0
);

create table public.stream_outputs (
  id bigint generated always as identity primary key,
  instance text not null references public.ingest_instances(instance) on delete cascade,
  hash text not null check (hash ~ '^[0-9a-f]{32}$'),
  pipeline text not null default '',
  output text not null default '',
  status text not null check (status in ('running', 'warning', 'error', 'stopped')),
  message text not null default '',
  failures integer not null default 0,
  stopped_after_failures boolean not null default false,
  since_ms bigint not null default 0
);
create index stream_outputs_hash_idx on public.stream_outputs (hash);
create index stream_outputs_instance_idx on public.stream_outputs (instance);

-- Replaces one instance's outputs in a single transaction. The upsert of the instance
-- row comes first: it holds the row lock, so two overlapping beats from one bunryu are
-- applied one after the other.
create function public.ingest_heartbeat(p_instance text, p_sent_at timestamptz, p_outputs jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  stored integer;
begin
  insert into public.ingest_instances (instance, last_seen_at, sent_at, output_count)
  values (p_instance, now(), p_sent_at, jsonb_array_length(p_outputs))
  on conflict (instance) do update
    set last_seen_at = now(), sent_at = excluded.sent_at, output_count = excluded.output_count;

  delete from public.stream_outputs where instance = p_instance;

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

  -- A bunryu that has not reported for a month is gone; do not keep it for ever.
  delete from public.ingest_instances where last_seen_at < now() - interval '30 days';

  return stored;
end;
$$;

alter table public.ingest_instances enable row level security;
alter table public.stream_outputs enable row level security;

do $$
declare
  api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('revoke all on public.ingest_instances from %I', api_role);
      execute format('revoke all on public.stream_outputs from %I', api_role);
      execute format('revoke execute on function public.ingest_heartbeat(text, timestamptz, jsonb) from %I', api_role);
    end if;
  end loop;
end;
$$;

revoke execute on function public.ingest_heartbeat(text, timestamptz, jsonb) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.ingest_heartbeat(text, timestamptz, jsonb) to service_role;
  end if;
end;
$$;
