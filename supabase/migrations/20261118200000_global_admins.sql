-- Admins and owners are the same in every event, so they are no longer a role you give in an
-- event. Owners are the people named in KEY_VAULT_OWNER_EMAILS (set on the server, never in the
-- database). Admins are the ones listed here, whom any admin can add and remove from the Admins
-- dialog. A role in an event is now only viewer or editor.
--
-- Everyone who was an admin or an owner in an event is moved here, so they now have access to
-- every event. Their roles are then removed. (An owner was already an owner of every event.)

create table public.app_admins (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique check (char_length(email) <= 254),
  -- Who added them (an email). Empty for one moved over from an event role.
  added_by text not null default '',
  created_at timestamptz not null default now()
);

insert into public.app_admins (email)
select distinct email from public.roles where type in ('admin', 'owner');

delete from public.roles where type in ('admin', 'owner');

alter table public.roles drop constraint roles_type_check;
alter table public.roles
  add constraint roles_type_check check (type in ('viewer', 'editor'));

-- Nobody has a role in the event they create any more, so the function that made both is not
-- needed: the API inserts the event itself.
drop function public.create_event(text, text);

-- Same access as every other table: row level security with no policy, so only the API
-- (service role) reads or writes it. A new table gets the default grants on Supabase, so they
-- are taken away here; the guard lets the file run on a plain Postgres too.
alter table public.app_admins enable row level security;

do $$
declare
  api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('revoke all on public.app_admins from %I', api_role);
    end if;
  end loop;
end;
$$;
