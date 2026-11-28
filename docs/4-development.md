# Development

For people changing Key Vault itself. To run it for a team, see [Setting up Key Vault](3-setup.md).

## Run it locally

```bash
npm install
npm run dev
```

This serves the demo at `http://localhost:2837` with live reload (set `PORT` to use another port). The demo runs the server's own operations in the browser against an in-memory store with sample events, destinations and statuses, so no account or network is needed.

## Checks

```bash
npm test              # unit tests, no database needed
npm run typecheck     # frontend and server
npm run format:check
npm run test:db       # applies the migrations to a throwaway Postgres in Docker (CI runs it too)
```

CI (`.github/workflows/deploy.yml`) runs the first three, builds both the demo and the real site, and fails on any of them. Run `npm run format` before you commit.

Use Node 26, the version in `.nvmrc` (CI reads the same file). With [fnm](https://github.com/Schniz/fnm), run `fnm use` in the repository, or `fnm install` the first time. Tests need a Node that can load `.ts` files; some Linux distributions ship a Node without TypeScript support, and the tests fail on the first import.

## Build the real site

Set the project URL and the **publishable** key (never a secret key; the build refuses one) and run `npm run build`. The result is in `dist/`. `npm run build:demo` builds the demo instead.

```bash
KEY_VAULT_SUPABASE_URL=https://<project-ref>.supabase.co KEY_VAULT_SUPABASE_PUBLISHABLE_KEY=<publishable key> npm run build
```

## Project structure

```text
├── frontend/
│   ├── src/             # Browser code: ES modules, one entry (main.ts)
│   │   ├── demo/        # The demo's seed data and its in-browser backend
│   │   └── *.ts         # Pure modules (status wording, search, cards, model) and the screens
│   ├── icons/           # App icons for the install (PWA) and the iOS home screen
│   ├── index.html       # HTML shell
│   ├── input.css        # Tailwind CSS source and the theme
│   ├── manifest.webmanifest  # What makes the site installable as an app
│   └── sw.js            # The service worker (see "Install Key Vault as an app")
├── supabase/
│   ├── migrations/      # The database schema
│   └── functions/
│       ├── api/         # One Edge Function: POST /api/<operation>
│       ├── ingest/      # Where bunryu reports its heartbeats
│       └── _shared/     # The rules, shared with the browser where it makes sense:
│                        #   platforms.ts (where a destination can go), access.ts (who may do what),
│                        #   operations.ts (the operations, over a Store), status.ts, types.ts
├── build-tools/         # build.mjs (esbuild, demo and real modes) and dev.mjs (dev server)
├── docs/                # These pages, plus adr/ (decisions) and images/
└── test/                # Unit tests; migrations-db-check.mjs needs Docker
```

## Where the rules live

The rules are written once and used by both the form and the server, so a wrong link cannot be stored by anything that skips the form. The reasons are recorded as decisions in the repository (`docs/adr/`):

1. Platform rules live in one shared module (`0001`).
2. A status is never set by hand: it is derived from bunryu's report (`0002`).
3. The server decides who may do what, and sends the answer with the data (`0003`).
4. The demo runs the real operations, not a copy of them (`0004`).

`CONTEXT.md` explains why the app exists and defines its terms (input, destination, status). `DESIGN.md` covers the look and the wording rules for each audience.

## Contributing

Issues and ideas are tracked in [GitHub Issues](https://github.com/live-miracles/key-vault/issues). The screens are for a non-technical team, so a change to wording or a message should read in plain words and say what to do next.
