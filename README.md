# Key Vault

A safer way to store and manage stream keys for big events.

This is a Google Apps Script web app backed by a Google Sheet. After creating and configuring the
Apps Script project, you will be able to:

- Create events.
- Add stream keys for an event.
- Add role-based access controls to restrict which keys each user can access.

## Project structure

```text
├── frontend/
│   ├── src/*.ts         # Browser code (plain scripts sharing globals, as the tests load them)
│   ├── src/supabase.ts  # Google sign-in and the call to the api function (own bundle)
│   ├── index.html       # HTML shell
│   └── input.css        # Tailwind CSS source
├── supabase/
│   ├── migrations/      # Database schema
│   └── functions/       # api (the app's operations) and ingest (bunryu heartbeats)
├── build-tools/         # Site builds and the Sheet-to-SQL export
└── docs/refactor-plan.md
```

## How it fits together

```text
Browser → Vercel static site → Supabase Auth (Google)
                            └→ Edge Function `api` → Postgres
bunryu ──every minute──► Edge Function `ingest` → Postgres
```

The browser never reads the database directly: every table has row-level security with no policy,
and the `api` function checks the user's role (the rules in `frontend/src/access.ts` and
`supabase/functions/_shared/access.ts`, which a test keeps identical) before using the service role.

bunryu reports the status of each output once a minute. It sends a hash of each destination URL,
never the URL. Key Vault hashes its own main and backup URLs and matches them, so a key shows
as running, warning, error or configured-but-stopped without anyone setting a color. A color set
by hand by an owner or admin still wins. See `docs/refactor-plan.md` for the heartbeat contract.

## Local development

```bash
npm install
npm run dev
```

This serves the demo (a built-in mock backend with sample data and statuses) at
`http://localhost:3000` with live reload.

```bash
npm test              # unit tests, no database needed
npm run typecheck
npm run test:db       # applies the migrations to a throwaway Postgres in Docker
```

To build the real site locally, set the project URL and the **publishable** key (never a secret key;
the build refuses one) and run `npm run build:vercel`; the result is in `web/`.

```bash
KEY_VAULT_SUPABASE_URL=https://<project-ref>.supabase.co KEY_VAULT_SUPABASE_PUBLISHABLE_KEY=<publishable key> npm run build:vercel
```

## Setting up Supabase and Vercel

1. Create a Supabase project. Under Authentication → Providers enable Google (client id and secret
   from a Google Cloud OAuth client whose redirect URI is
   `https://<project-ref>.supabase.co/auth/v1/callback`), and add the site's URL to Authentication →
   URL Configuration.
2. Set the function secrets (see `docs/refactor-plan.md` for what each is):
   `KEY_VAULT_APP_ORIGIN`, `KEY_VAULT_HASH_SECRET`, `KEY_VAULT_OWNER_EMAILS`, `KEY_VAULT_INGEST_TOKEN`.
3. Add the repository secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`;
   `.github/workflows/deploy-supabase.yml` then applies the migrations and deploys both functions on every
   change under `supabase/`.
4. Import the repository in Vercel and set `KEY_VAULT_SUPABASE_URL` and
   `KEY_VAULT_SUPABASE_PUBLISHABLE_KEY`; `vercel.json` does the rest.
5. To bring over the existing Google Sheet, download its four tabs as CSV
   (`Event`, `Role`, `Language`, `Key`) into one folder and run
   `npm run sheet:sql -- <folder> > .migration/data.sql`, then run that file against the database. It lists
   anything that cannot be migrated instead of guessing. The file holds real keys: delete it afterwards.

The GitHub Pages workflow still publishes the mock-backed demo from `master`.

## Roles

- Owner: can edit or delete events and assign event admins.
- Admin: can add viewers and editors.
- Editor: can edit keys for an event and can be restricted to languages.
- Viewer: can only view an event's keys and can be restricted to languages.
