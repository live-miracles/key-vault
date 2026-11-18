-- Who last changed a destination, what they did, and when (updated_at, which already existed).
-- The API fills these in from the signed-in email on every add and edit. Destinations that
-- existed before this keep '' and show nothing: nobody knows who made them.

alter table public.keys add column updated_by text not null default '';
alter table public.keys add column updated_action text not null default ''
  check (updated_action in ('', 'added', 'edited'));
