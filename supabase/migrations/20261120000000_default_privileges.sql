-- Defence in depth for the rule "nothing in the database is reachable from the browser".
--
-- Every earlier migration takes the default grants away from `anon` and `authenticated` on the
-- table or function it creates, and turns on row level security. Supabase hands those two roles
-- access to every NEW object in `public` unless told otherwise, so a future migration that forgot
-- the revoke would quietly open that object to anyone holding the publishable key. This stops
-- the grants being made in the first place: from now on a new table or sequence in `public` is
-- closed to both roles until a migration grants access on purpose.
--
-- A function is the exception to remember: Postgres itself lets PUBLIC execute every new
-- function, and that default can only be removed globally, so each function still needs its own
-- `revoke execute ... from public`, as the functions in the earlier migrations have.
--
-- Objects that exist already are untouched (they were closed by their own migrations). The guard
-- lets the file run on a plain Postgres (the migration test), where the two roles do not exist.

do $$
declare
  api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('alter default privileges in schema public revoke all on tables from %I', api_role);
      execute format('alter default privileges in schema public revoke all on sequences from %I', api_role);
      execute format('alter default privileges in schema public revoke all on functions from %I', api_role);
    end if;
  end loop;
end;
$$;
