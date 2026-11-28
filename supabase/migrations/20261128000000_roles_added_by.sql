-- Who gave each person access to an event, so the Share list can say so. It is the email of the
-- admin, owner or editor who added them. Empty for a person added before this was recorded.
-- Changing someone's role later does not change it: it stays the person who first gave access.
--
-- No new table, so the access rules are unchanged: row level security with no policy still
-- covers it, and the API (service role) is the only one that reads or writes it.

alter table public.roles add column added_by text not null default '';
