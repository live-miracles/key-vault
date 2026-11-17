-- Ids are random UUIDs (kept as text). They used to be a letter and a number (E1, K1, R1, L1)
-- because the Google Sheet had to stay small; here the database guarantees they never repeat,
-- so nothing else has to check. Rows that already exist keep the id they have.

alter table public.events alter column id set default (gen_random_uuid()::text);
alter table public.roles alter column id set default (gen_random_uuid()::text);
alter table public.keys alter column id set default (gen_random_uuid()::text);

alter table public.languages drop constraint languages_id_check;
alter table public.languages alter column id set default (gen_random_uuid()::text);

drop sequence public.event_id_seq;
drop sequence public.role_id_seq;
drop sequence public.key_id_seq;

-- A language is created from its name alone; the database makes the id.
drop function public.create_language(text, text);

create function public.create_language(p_name text)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with created as (
    insert into public.languages (name, sort_order)
    select p_name, coalesce(max(sort_order), 0) + 1 from public.languages
    returning id, name, sort_order
  )
  select jsonb_build_object('id', id, 'name', name, 'order', sort_order::text) from created;
$$;

revoke execute on function public.create_language(text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.create_language(text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.create_language(text) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.create_language(text) to service_role;
  end if;
end;
$$;
