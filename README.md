# Key Vault

A safer way to store and manage stream keys for big events.

The media team adds every destination for an event (YouTube, Instagram, Facebook, TV channels and
other third parties) through a guided form that cleans up and checks what they paste. The streaming
server, bunryu, is configured from these links and reports each output's live status back, so every
destination shows whether it is set up, whether it is running, and what to try when it is not.
`CONTEXT.md` has the background and the terms.

You can:

- Create events, each with its own inputs.
- Add destinations (platform, stream key, optional backup) for an input.
- Give people a role to restrict which destinations each of them can see or change.

It runs on Vercel and Supabase.

## Project structure

```text
├── frontend/
│   ├── src/             # Browser code: ES modules, one entry (main.ts)
│   │   ├── demo/        # The demo's seed data and its in-browser backend
│   │   └── *.ts         # Pure modules (status wording, search, cards, model) and the screens
│   ├── index.html       # HTML shell
│   └── input.css        # Tailwind CSS source and the theme
├── supabase/
│   ├── migrations/      # The database schema
│   └── functions/
│       ├── api/         # One Edge Function: POST /api/<operation>
│       ├── ingest/      # Where bunryu reports its heartbeats
│       └── _shared/     # The rules, shared with the browser where it makes sense:
│                        #   platforms.ts (where a destination can go), access.ts (who may do what),
│                        #   operations.ts (the operations, over a Store), status.ts, types.ts
├── build-tools/         # build.mjs (esbuild, demo and real modes) and dev.mjs (dev server)
├── docs/                # setup.md, bunryu-contract.md, adr/ (decisions)
└── test/                # Unit tests; migrations-db-check.mjs needs Docker
```

## How it fits together

```text
Browser → Vercel static site → Supabase Auth (Google)
                            └→ Edge Function `api` → Postgres
bunryu ──every minute──► Edge Function `ingest` → Postgres
```

The browser never reads the database directly: every table has row-level security with no policy.
Every call goes to the `api` function, which decides what the signed-in user may do
(`supabase/functions/_shared/access.ts`), checks the destination against the platform rules
(`platforms.ts`, the same module the form uses) and only then uses the service role. The data it
returns says what the user may do with each item, so the screens hold no rules of their own.

bunryu reports the status of each output once a minute. It sends a hash of each destination address,
never the address. Key Vault hashes its own main and backup addresses and matches them, so a
destination shows as running, warning, error or configured-but-stopped without anyone setting a
colour. See `docs/bunryu-contract.md`.

The demo site runs the same operations in the browser against an in-memory store, with sample data
and statuses.

## Local development

```bash
npm install
npm run dev
```

This serves the demo at `http://localhost:2837` with live reload (set `PORT` to use another port).

```bash
npm test              # unit tests, no database needed
npm run typecheck     # frontend and server
npm run format:check
npm run test:db       # applies the migration to a throwaway Postgres in Docker
```

To build the real site locally, set the project URL and the **publishable** key (never a secret key;
the build refuses one) and run `npm run build`; the result is in `dist/`. `npm run build:demo` builds
the demo instead.

```bash
KEY_VAULT_SUPABASE_URL=https://<project-ref>.supabase.co KEY_VAULT_SUPABASE_PUBLISHABLE_KEY=<publishable key> npm run build
```

## Setting up Supabase and Vercel

The step-by-step order, with checks and fixes for the usual errors, is in `docs/setup.md`. In short:

1. Create a Supabase project. Under Authentication → Providers enable Google, and set the Site URL
   and a Redirect URL to the site's address (the default sends sign-in back to `http://localhost:3000`).
2. Set the function secrets `KEY_VAULT_APP_ORIGIN`, `KEY_VAULT_OWNER_EMAILS` and `KEY_VAULT_SECRET`
   (what each is: `docs/bunryu-contract.md`).
3. Add the repository secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`;
   `.github/workflows/deploy-supabase.yml` then applies the migration and deploys both functions on
   every change under `supabase/`.
4. Import the repository in Vercel and set `KEY_VAULT_SUPABASE_URL` and
   `KEY_VAULT_SUPABASE_PUBLISHABLE_KEY`; `vercel.json` does the rest.

## Roles

- Owner: can edit or delete events and assign event admins. An owner anywhere is an owner everywhere.
- Admin: manages an event's inputs and can add viewers, editors and other admins.
- Editor: can add and edit destinations, and can be limited to one input.
- Viewer: can only view destinations, and can be limited to one input.

Anyone listed in `KEY_VAULT_OWNER_EMAILS` is an owner without a role.
