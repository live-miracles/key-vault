-- Key Vault's database. It replaces the Google Sheet: one table per tab, with the
-- relations the sheet only implied (a key belongs to an event and a language, a role to
-- an event) enforced here. Ids keep their sheet form (E1, K1, R1, L1).
--
-- Nothing in this schema is readable or writable from the browser: every table has row
-- level security with no policy, and the browser reaches data only through the `api` Edge
-- Function, which checks the roles in access.ts before using the service role.
create extension if not exists citext;

create sequence public.event_id_seq;
create sequence public.role_id_seq;
create sequence public.key_id_seq;

create table public.events (
  id text primary key default ('E' || nextval('public.event_id_seq')),
  name text not null check (char_length(name) between 1 and 200),
  created_at timestamptz not null default now()
);

create table public.languages (
  id text primary key check (id ~ '^L[1-9][0-9]*$'),
  name text not null check (char_length(name) between 1 and 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- type: '0' viewer, '1' editor, '2' admin, '3' owner (the codes the app has always used).
-- language: a language id, or '*' for all of them, so it has no foreign key.
create table public.roles (
  id text primary key default ('R' || nextval('public.role_id_seq')),
  event_id text not null references public.events(id) on delete cascade,
  email citext not null check (char_length(email) <= 254),
  type text not null check (type in ('0', '1', '2', '3')),
  language text not null default '*',
  created_at timestamptz not null default now()
);
create index roles_event_id_idx on public.roles (event_id);
create index roles_email_idx on public.roles (email);

-- color_override: '' none, '1' error, '3' warning, '6' configured. Set by an owner or
-- admin; the color normally comes from bunryu's status.
create table public.keys (
  id text primary key default ('K' || nextval('public.key_id_seq')),
  event_id text not null references public.events(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  language text not null references public.languages(id) on delete restrict on update cascade,
  server text not null,
  key text not null,
  server2 text not null default '',
  key2 text not null default '',
  link text not null default '',
  color_override text not null default '' check (color_override in ('', '1', '3', '6')),
  remarks text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index keys_event_id_idx on public.keys (event_id);

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
    insert into public.roles (event_id, email, type, language)
    values (new_event.id, p_admin_email, '2', '*')
    returning * into new_role;
  end if;
  return jsonb_build_object(
    'event', jsonb_build_object('id', new_event.id, 'name', new_event.name),
    'adminRole', case when new_role.id is null then null else jsonb_build_object(
      'id', new_role.id, 'event', new_role.event_id, 'email', new_role.email::text,
      'type', new_role.type, 'language', new_role.language) end
  );
end;
$$;

create function public.create_language(p_id text, p_name text)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with created as (
    insert into public.languages (id, name, sort_order)
    select p_id, p_name, coalesce(max(sort_order), 0) + 1 from public.languages
    returning id, name, sort_order
  )
  select jsonb_build_object('id', id, 'name', name, 'order', sort_order::text) from created;
$$;

create function public.reorder_languages(p_ids text[])
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.languages l
  set sort_order = o.position
  from unnest(p_ids) with ordinality as o(id, position)
  where l.id = o.id;
$$;

-- ===== Access =====

alter table public.events enable row level security;
alter table public.languages enable row level security;
alter table public.roles enable row level security;
alter table public.keys enable row level security;

-- The roles below exist on Supabase; the guards let the same file run on a plain
-- Postgres (the migration test) where they do not.
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
revoke execute on function public.create_language(text, text) from public;
revoke execute on function public.reorder_languages(text[]) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.create_event(text, text) to service_role;
    grant execute on function public.create_language(text, text) to service_role;
    grant execute on function public.reorder_languages(text[]) to service_role;
  end if;
end;
$$;
