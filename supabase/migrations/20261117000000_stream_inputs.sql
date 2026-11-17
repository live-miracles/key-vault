-- bunryu also reports the state of each input (pipeline), so Key Vault can say whether the
-- signal is arriving and whether an output runs in the pipeline its stream is meant for.
-- Like stream_outputs, only the latest heartbeat of each bunryu is kept. A pipeline is
-- matched to a Key Vault input by name (see docs/refactor-plan.md).
create table public.stream_inputs (
  id bigint generated always as identity primary key,
  instance text not null references public.ingest_instances(instance) on delete cascade,
  pipeline text not null check (pipeline <> ''),
  status text not null check (status in ('running', 'warning', 'error', 'stopped')),
  message text not null default '',
  since_ms bigint not null default 0
);
create index stream_inputs_instance_idx on public.stream_inputs (instance);

alter table public.stream_inputs enable row level security;

-- One function replaces both the outputs and the inputs of an instance in a single
-- transaction. `p_inputs` is optional so an older bunryu that sends none still works.
drop function public.ingest_heartbeat(text, timestamptz, jsonb);

create function public.ingest_heartbeat(
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

  -- A bunryu that has not reported for a month is gone; do not keep it for ever.
  delete from public.ingest_instances where last_seen_at < now() - interval '30 days';

  return stored;
end;
$$;

do $$
declare
  api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('revoke all on public.stream_inputs from %I', api_role);
      execute format('revoke execute on function public.ingest_heartbeat(text, timestamptz, jsonb, jsonb) from %I', api_role);
    end if;
  end loop;
end;
$$;

revoke execute on function public.ingest_heartbeat(text, timestamptz, jsonb, jsonb) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.ingest_heartbeat(text, timestamptz, jsonb, jsonb) to service_role;
  end if;
end;
$$;
