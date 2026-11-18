-- Key Vault's database, in one piece. There is no data to carry over, so this is the schema
-- as it should be, not a history of how it got here.
--
-- Nothing in it is readable or writable from the browser: every table has row level security
-- with no policy, and the browser reaches data only through the `api` Edge Function, which
-- checks who may do what (supabase/functions/_shared/access.ts) before using the service role.
--
-- Ids are random UUIDs made here, so nothing else has to pick or check one.
create extension if not exists citext;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  created_at timestamptz not null default now()
);

-- An input is one feed of an event, matched to a bunryu pipeline by name. Each event has its
-- own, in its own order (sort_order: 1, 2, 3 ...).
create table public.inputs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index inputs_event_id_idx on public.inputs (event_id);
create unique index inputs_event_name_idx on public.inputs (event_id, lower(name));

-- input_id: the one input a viewer or editor is limited to; null is every input of the event.
-- Admins and owners always have null.
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  email citext not null check (char_length(email) <= 254),
  type text not null check (type in ('viewer', 'editor', 'admin', 'owner')),
  input_id uuid references public.inputs(id),
  created_at timestamptz not null default now()
);
create index roles_event_id_idx on public.roles (event_id);
create index roles_email_idx on public.roles (email);

-- A destination: one place an input goes live. For the platforms with a known address
-- (youtube, facebook, instagram, vdocipher) stream_key is just the key; for 'rtmp' and 'srt'
-- it is the whole address. The backup is empty where the platform sets its own up or has none.
--
-- The foreign key to inputs has no "on delete": deleting an event removes its destinations
-- and its inputs in one statement, which the default allows, while an input a destination
-- still uses cannot be deleted on its own.
create table public.keys (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  input_id uuid not null references public.inputs(id),
  platform text not null check (platform in ('yt', 'fb', 'ig', 'vc', 'rtmp', 'srt')),
  stream_key text not null,
  backup_platform text not null default '' check (backup_platform in ('', 'yt', 'fb', 'ig', 'vc', 'rtmp', 'srt')),
  backup_stream_key text not null default '',
  link text not null default '',
  remarks text not null default '',
  created_at timestamptz not null default now(),
  -- Who last added or edited it, and when. Filled in by the API from the signed-in email.
  updated_by text not null default '',
  updated_action text not null default '' check (updated_action in ('', 'added', 'edited')),
  updated_at timestamptz not null default now()
);
create index keys_event_id_idx on public.keys (event_id);
create index keys_input_id_idx on public.keys (input_id);

-- ===== What bunryu reports =====
-- Only the latest heartbeat of each bunryu is kept: every beat replaces that instance's rows.
-- Outputs are identified by a hash of their destination address, never the address.

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

-- The state of each input (pipeline) bunryu runs, so Key Vault can say whether the signal is
-- arriving and whether an output runs in the pipeline its destination is meant for.
create table public.stream_inputs (
  id bigint generated always as identity primary key,
  instance text not null references public.ingest_instances(instance) on delete cascade,
  pipeline text not null check (pipeline <> ''),
  status text not null check (status in ('running', 'warning', 'error', 'stopped')),
  message text not null default '',
  since_ms bigint not null default 0
);
create index stream_inputs_instance_idx on public.stream_inputs (instance);

-- ===== Functions the API calls for steps that must be atomic =====

create function public.create_event(p_name text, p_admin_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_event public.events;
  new_role public.roles;
begin
  insert into public.events (name) values (p_name) returning * into new_event;
  if p_admin_email is not null then
    insert into public.roles (event_id, email, type)
    values (new_event.id, p_admin_email, 'admin')
    returning * into new_role;
  end if;
  return jsonb_build_object(
    'event', jsonb_build_object('id', new_event.id, 'name', new_event.name),
    'adminRole', case when new_role.id is null then null else jsonb_build_object(
      'id', new_role.id, 'event', new_role.event_id, 'email', new_role.email::text,
      'type', new_role.type, 'input', null) end
  );
end;
$$;

create function public.create_input(p_event_id uuid, p_name text)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with created as (
    insert into public.inputs (event_id, name, sort_order)
    select p_event_id, p_name, coalesce(max(sort_order), 0) + 1
    from public.inputs
    where event_id = p_event_id
    returning id, event_id, name, sort_order
  )
  select jsonb_build_object(
    'id', id, 'event', event_id, 'name', name, 'position', sort_order
  ) from created;
$$;

create function public.reorder_inputs(p_event_id uuid, p_ids uuid[])
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.inputs i
  set sort_order = o.position
  from unnest(p_ids) with ordinality as o(id, position)
  where i.id = o.id and i.event_id = p_event_id;
$$;

-- Replaces both the outputs and the inputs of one bunryu in a single transaction. The upsert of
-- the instance row comes first: it holds the row lock, so two overlapping beats from one bunryu
-- are applied one after the other. `p_inputs` is optional so an older bunryu that sends none
-- still works.
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

-- ===== Access =====

alter table public.events enable row level security;
alter table public.inputs enable row level security;
alter table public.roles enable row level security;
alter table public.keys enable row level security;
alter table public.ingest_instances enable row level security;
alter table public.stream_outputs enable row level security;
alter table public.stream_inputs enable row level security;

-- The roles below exist on Supabase; the guards let the same file run on a plain Postgres
-- (the migration test) where they do not. Only the service role may call the functions.
do $$
declare
  api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('revoke all on all tables in schema public from %I', api_role);
      execute format('revoke all on all sequences in schema public from %I', api_role);
      execute format('revoke execute on all functions in schema public from %I', api_role);
    end if;
  end loop;
end;
$$;

revoke execute on function public.create_event(text, text) from public;
revoke execute on function public.create_input(uuid, text) from public;
revoke execute on function public.reorder_inputs(uuid, uuid[]) from public;
revoke execute on function public.ingest_heartbeat(text, timestamptz, jsonb, jsonb) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.create_event(text, text) to service_role;
    grant execute on function public.create_input(uuid, text) to service_role;
    grant execute on function public.reorder_inputs(uuid, uuid[]) to service_role;
    grant execute on function public.ingest_heartbeat(text, timestamptz, jsonb, jsonb) to service_role;
  end if;
end;
$$;
