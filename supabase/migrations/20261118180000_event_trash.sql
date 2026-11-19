-- A deleted event goes to the trash instead of disappearing. It keeps its inputs, destinations
-- and roles, which nothing reads while `deleted_at` is set. Owners can restore it for 30 days
-- (TRASH_DAYS in supabase/functions/_shared/types.ts); after that the API removes it for good,
-- and the foreign keys take its inputs, destinations and roles with it.
--
-- `deleted_at` is null for an event that is in use. `deleted_by` is the email of whoever
-- deleted it, filled in by the API.

alter table public.events
  add column deleted_at timestamptz,
  add column deleted_by text not null default '';

create index events_deleted_at_idx on public.events (deleted_at) where deleted_at is not null;
