-- The change history: one row for every row an admin or editor adds, edits or deletes, with who
-- did it, when, and the row before and after as JSON. Any earlier version of an event is worked
-- out from it by undoing the newer changes (supabase/functions/_shared/history.ts). Kept for
-- HISTORY_DAYS (30) days; the API removes older rows (see types.ts).
--
-- Written by the API, in supabase/functions/_shared/operations.ts, not by triggers: the API uses
-- the service role, so a trigger could not know who made a change.
--
-- Same access as every other table: row level security with no policy, so only the API (service
-- role) reads or writes it. A new table gets the default grants on Supabase, so they are taken
-- away here; the guards let the file run on a plain Postgres too.

create table public.changes (
  id bigint generated always as identity primary key,  -- also the order of the changes
  at timestamptz not null default now(),
  by text not null,                      -- email of whoever did it
  -- No foreign key: the history of an event outlives its row. Null for a change to the admins.
  event_id uuid,
  kind text not null check (kind in ('event', 'input', 'key', 'role', 'admin')),
  row_id uuid not null,                  -- id of the event, input, key, role or admin
  action text not null check (action in ('added', 'edited', 'deleted', 'restored')),
  before jsonb,                          -- the row before; null when it was added
  after jsonb,                           -- the row after; null when it was deleted
  batch uuid,                            -- the same for every row of one version restore
  restored_to bigint                     -- for a version restore: the change it went back to
);
create index changes_event_id_idx on public.changes (event_id, id desc);
create index changes_at_idx on public.changes (at);

-- Turns an event into one of its earlier versions, and records that, in one transaction: it is
-- applied completely or not at all. `p_steps` is what restoreSteps() in history.ts works out:
--   { eventName, upsertInputs, deleteInputs, upsertKeys, deleteKeys, upsertRoles, deleteRoles }
-- Rows keep their original ids, so the history keeps pointing at the same rows.
--
-- The order matters:
--  1. Inputs are upserted under a temporary name, because the unique index on (event, name) is
--     not deferrable and two inputs may be swapping names.
--  2. Destinations and people are upserted, so they can point at the restored inputs.
--  3. Destinations and people that were added since are deleted.
--  4. Inputs that were added since are deleted: nothing points at them any more.
--  5. The inputs get their real names and positions.
--  6. The event gets its name back.
create function public.apply_event_version(p_event uuid, p_steps jsonb, p_changes jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r jsonb;
begin
  -- Two restores of one event are applied one after the other.
  perform 1 from public.events where id = p_event for update;
  if not found then
    raise exception 'event not found';
  end if;

  -- 1.
  for r in select * from jsonb_array_elements(coalesce(p_steps -> 'upsertInputs', '[]')) loop
    insert into public.inputs (id, event_id, name, sort_order)
    values ((r ->> 'id')::uuid, p_event, 'restoring ' || (r ->> 'id'), (r ->> 'position')::integer)
    on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order
      where public.inputs.event_id = p_event;
  end loop;

  -- 2.
  for r in select * from jsonb_array_elements(coalesce(p_steps -> 'upsertKeys', '[]')) loop
    insert into public.keys (
      id, event_id, name, input_id, platform, stream_key, backup_platform, backup_stream_key,
      link, remarks, updated_by, updated_action, updated_at
    ) values (
      (r ->> 'id')::uuid, p_event, r ->> 'name', (r ->> 'input')::uuid, r ->> 'platform',
      r ->> 'streamKey', r ->> 'backupPlatform', r ->> 'backupStreamKey', r ->> 'link',
      r ->> 'remarks', r ->> 'updatedBy', r ->> 'updatedAction',
      coalesce(nullif(r ->> 'updatedAt', '')::timestamptz, now())
    )
    on conflict (id) do update set
      name = excluded.name, input_id = excluded.input_id, platform = excluded.platform,
      stream_key = excluded.stream_key, backup_platform = excluded.backup_platform,
      backup_stream_key = excluded.backup_stream_key, link = excluded.link,
      remarks = excluded.remarks, updated_by = excluded.updated_by,
      updated_action = excluded.updated_action, updated_at = excluded.updated_at
      where public.keys.event_id = p_event;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p_steps -> 'upsertRoles', '[]')) loop
    insert into public.roles (id, event_id, email, type, input_id)
    values (
      (r ->> 'id')::uuid, p_event, r ->> 'email', r ->> 'type', nullif(r ->> 'input', '')::uuid
    )
    on conflict (id) do update set
      email = excluded.email, type = excluded.type, input_id = excluded.input_id
      where public.roles.event_id = p_event;
  end loop;

  -- 3.
  delete from public.keys
  where event_id = p_event
    and id in (select (v)::uuid from jsonb_array_elements_text(coalesce(p_steps -> 'deleteKeys', '[]')) v);
  delete from public.roles
  where event_id = p_event
    and id in (select (v)::uuid from jsonb_array_elements_text(coalesce(p_steps -> 'deleteRoles', '[]')) v);

  -- 4.
  delete from public.inputs
  where event_id = p_event
    and id in (select (v)::uuid from jsonb_array_elements_text(coalesce(p_steps -> 'deleteInputs', '[]')) v);

  -- 5.
  update public.inputs i
  set name = u ->> 'name', sort_order = (u ->> 'position')::integer
  from jsonb_array_elements(coalesce(p_steps -> 'upsertInputs', '[]')) u
  where i.id = (u ->> 'id')::uuid and i.event_id = p_event;

  -- 6.
  if p_steps ->> 'eventName' is not null then
    update public.events set name = p_steps ->> 'eventName' where id = p_event;
  end if;

  insert into public.changes (at, by, event_id, kind, row_id, action, before, after, batch, restored_to)
  select
    (c ->> 'at')::timestamptz, c ->> 'by', nullif(c ->> 'event', '')::uuid, c ->> 'kind',
    (c ->> 'rowId')::uuid, c ->> 'action', c -> 'before', c -> 'after',
    nullif(c ->> 'batch', '')::uuid, nullif(c ->> 'restoredTo', '')::bigint
  from jsonb_array_elements(coalesce(p_changes, '[]')) c;
end;
$$;

alter table public.changes enable row level security;

do $$
declare
  api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('revoke all on public.changes from %I', api_role);
      execute format('revoke all on sequence public.changes_id_seq from %I', api_role);
      execute format('revoke execute on function public.apply_event_version(uuid, jsonb, jsonb) from %I', api_role);
    end if;
  end loop;
end;
$$;

revoke execute on function public.apply_event_version(uuid, jsonb, jsonb) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.apply_event_version(uuid, jsonb, jsonb) to service_role;
  end if;
end;
$$;
