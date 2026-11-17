-- A "language" is now called an "input": one feed of an event (it matches a pipeline in
-- bunryu by name). Only names change; the rows, ids and rules stay as they were.

alter table public.languages rename to inputs;
alter table public.inputs rename constraint languages_pkey to inputs_pkey;

alter table public.roles rename column language to input;
alter table public.keys rename column language to input;
alter table public.keys rename constraint keys_language_fkey to keys_input_fkey;

-- Function bodies are stored as text and name the old table and columns, so they are
-- written again rather than renamed.
create or replace function public.create_event(p_name text, p_admin_email text)
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
    insert into public.roles (event_id, email, type, input)
    values (new_event.id, p_admin_email, '2', '*')
    returning * into new_role;
  end if;
  return jsonb_build_object(
    'event', jsonb_build_object('id', new_event.id, 'name', new_event.name),
    'adminRole', case when new_role.id is null then null else jsonb_build_object(
      'id', new_role.id, 'event', new_role.event_id, 'email', new_role.email::text,
      'type', new_role.type, 'input', new_role.input) end
  );
end;
$$;

drop function public.create_language(text);
drop function public.reorder_languages(text[]);

create function public.create_input(p_name text)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with created as (
    insert into public.inputs (name, sort_order)
    select p_name, coalesce(max(sort_order), 0) + 1 from public.inputs
    returning id, name, sort_order
  )
  select jsonb_build_object('id', id, 'name', name, 'order', sort_order::text) from created;
$$;

create function public.reorder_inputs(p_ids text[])
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.inputs i
  set sort_order = o.position
  from unnest(p_ids) with ordinality as o(id, position)
  where i.id = o.id;
$$;

revoke execute on function public.create_input(text) from public;
revoke execute on function public.reorder_inputs(text[]) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.create_input(text) from anon;
    revoke execute on function public.reorder_inputs(text[]) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.create_input(text) from authenticated;
    revoke execute on function public.reorder_inputs(text[]) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.create_input(text) to service_role;
    grant execute on function public.reorder_inputs(text[]) to service_role;
  end if;
end;
$$;
