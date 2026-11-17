-- Inputs belong to one event. Each sheet has its own list, in its own order, managed by that
-- event's admins, instead of one global list for every sheet.

alter table public.inputs add column event_id text references public.events(id) on delete cascade;

-- Give every event its own copy of each input it already uses, through a stream or a role,
-- and point those streams and roles at the copy. An input no event uses is dropped.
create temp table input_copies as
select used.old_id, used.event_id, gen_random_uuid()::text as new_id
from (
  select input as old_id, event_id from public.keys
  union
  select input, event_id from public.roles where input <> '*'
) used
join public.inputs i on i.id = used.old_id;

insert into public.inputs (id, name, sort_order, event_id, created_at)
select c.new_id, i.name, i.sort_order, c.event_id, i.created_at
from input_copies c
join public.inputs i on i.id = c.old_id;

update public.keys k
set input = c.new_id
from input_copies c
where k.input = c.old_id and k.event_id = c.event_id;

update public.roles r
set input = c.new_id
from input_copies c
where r.input = c.old_id and r.event_id = c.event_id;

drop table input_copies;

delete from public.inputs where event_id is null;
alter table public.inputs alter column event_id set not null;

create index inputs_event_id_idx on public.inputs (event_id);
create unique index inputs_event_name_idx on public.inputs (event_id, lower(name));

-- Deleting an event removes its streams and its inputs in one statement. "restrict" would
-- refuse that, "no action" only checks once both are gone. An input still used by a stream
-- cannot be deleted either way.
alter table public.keys drop constraint keys_input_fkey;
alter table public.keys
  add constraint keys_input_fkey foreign key (input) references public.inputs(id) on update cascade;

-- ===== Functions the API calls for steps that must be atomic =====

drop function public.create_input(text);
drop function public.reorder_inputs(text[]);

create function public.create_input(p_event_id text, p_name text)
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
    'id', id, 'event', event_id, 'name', name, 'order', sort_order::text
  ) from created;
$$;

create function public.reorder_inputs(p_event_id text, p_ids text[])
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

revoke execute on function public.create_input(text, text) from public;
revoke execute on function public.reorder_inputs(text, text[]) from public;

do $$
declare
  api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('revoke execute on function public.create_input(text, text) from %I', api_role);
      execute format('revoke execute on function public.reorder_inputs(text, text[]) from %I', api_role);
    end if;
  end loop;
end;
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.create_input(text, text) to service_role;
    grant execute on function public.reorder_inputs(text, text[]) to service_role;
  end if;
end;
$$;
