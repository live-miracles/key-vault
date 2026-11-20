# Security

For the people who deploy Key Vault, and for anyone changing its code. It says what Key Vault protects, what you must set up yourself, what it does not do, and the rules for changing it safely.

## What it protects

Stream keys and SRT links: credentials that let someone publish to a YouTube, Facebook or Instagram channel, or to a TV or CDN ingest point. They are not personal data. A leaked key lets an outsider broadcast on that channel until the key is replaced on the platform. Key Vault also holds the email addresses of the people who have access.

## How it protects them

- **The browser never reaches the database.** Every call goes to one server function (`api`), which checks the Google sign-in, applies the access rules in `supabase/functions/_shared/access.ts`, validates the input, and only then uses the database. Every table has row-level security with no policy, and the browser's database roles hold no privileges.
- **Access is per event, and can be limited to one input.** A person with a role limited to one input never receives the other inputs' destinations, keys or statuses: the server filters them out. Roles are read from the database on every request, so removing someone takes effect on their next call.
- **Roles are matched on a verified email.** Sign-in is Google only, and the server refuses an email the provider has not verified.
- **bunryu never receives a stream key.** It reports a keyed hash of each output's address. Its token and the hash secret are derived from one server secret under separate labels, and the token is compared in constant time. See [The bunryu link](5-bunryu-contract.md#secrets).
- **The browser app is hardened.** All dynamic text is HTML-escaped, links open only if they are `http` or `https`, and the page has a strict Content-Security-Policy (no inline script, no `eval`, no third-party script), HSTS, frame denial and `nosniff` (`vercel.json`). API answers are sent with `Cache-Control: no-store`, and the service worker never caches them.
- **Changes are recorded.** Every change to an event, input, destination, person or admin is logged with who, when, and the row before and after, for 30 days (admins only).

## Who can do what

Access is granted per event, and can be narrowed to one input. "Granted scope" is the event, or the one input within it, named in the person's role. The server enforces every row of this table (`access.ts`); the browser only shows or hides buttons.

| Capability                                                  | Owner      | Admin                | Editor               | Viewer             |
| ----------------------------------------------------------- | ---------- | -------------------- | -------------------- | ------------------ |
| See events, inputs and destinations                         | All events | All events           | Granted scope only   | Granted scope only |
| See and copy full stream keys                               | Yes        | Yes                  | Granted scope only   | Granted scope only |
| Add, edit and delete destinations                           | All        | All                  | Granted scope only   | No                 |
| See who has access to an event                              | Yes        | Yes                  | Yes, in their events | No                 |
| Create, rename and delete events; manage inputs; share      | Yes        | Yes                  | No                   | No                 |
| Add or remove admins                                        | Yes        | Yes (not themselves) | No                   | No                 |
| Read the history, restore a version, restore deleted events | Yes        | Yes                  | No                   | No                 |
| Open the bunryu settings and secret                         | Yes        | No                   | No                   | No                 |

Owners are named in `KEY_VAULT_OWNER_EMAILS` and cannot be added or removed in the app. Admins are managed in the app by other admins.

## Before you go live

Some protections are settings in the Google, Supabase, Vercel and GitHub dashboards, not code. Check each one for your deployment.

- [ ] **Limit who can sign in.** If everyone who uses Key Vault has an account in your organisation's Google Workspace, set the OAuth consent screen's user type to **Internal** (Google Cloud → APIs & Services → OAuth consent screen). Only your organisation can then sign in at all. Use External only if people sign in with outside addresses; they still see nothing until someone gives them a role.
- [ ] **Require two-step verification.** Key Vault trusts Google to prove who someone is, so enforce 2-Step Verification in your Google Workspace admin console. Turn it on for the GitHub accounts of everyone who can push to the repository too.
- [ ] **Allow only Google in Supabase.** In Authentication → Providers, enable Google and switch the Email provider off, so nobody can register an address they do not own.
- [ ] **Set the redirect addresses.** In Authentication → URL Configuration, list only your site (and `http://localhost:2837` for local development).
- [ ] **Set the function secrets exactly.** `KEY_VAULT_APP_ORIGIN` is your site's origin with no trailing slash. `KEY_VAULT_SECRET` is at least 32 random characters (`openssl rand -hex 32`) kept in a password manager, never in the repository. `KEY_VAULT_OWNER_EMAILS` lists only the people who run the streaming side.
- [ ] **Give the site the publishable key only.** The Vercel build takes the Supabase **publishable** key. The service-role key lives only in the Supabase function environment, and the build refuses a secret-style key.
- [ ] **Keep the repository clean.** Turn on secret scanning and push protection, and Dependabot alerts and security updates. If more than one person can push, protect the main branch (require a pull request and the build check), because a change to it deploys the database and the functions.
- [ ] **Keep your deployment's address private.** Do not put it in the repository, its description or its Website field, in issues, or on public pages. Anyone who clones the repository deploys their own.
- [ ] **Offboard people.** When someone leaves, remove their roles (or their admin entry) in Key Vault as well as suspending their Google account.
- [ ] **Treat backups like the keys.** A database dump contains every stream key. Store it as a secret and delete it when it is not needed.
- [ ] **Replace a key that may have leaked.** Make a new stream key on the platform and update the destination. Changing `KEY_VAULT_SECRET` means entering the new value in bunryu too; until both match, statuses show "Not set up yet".

## Design decisions and why

A scanner or a reviewer may flag the points below. Each is deliberate, with the reason and what limits the risk. Decide whether they fit your needs.

- **Stream keys are stored unencrypted by the application.** The server has to return a key in clear to the people allowed to use it, and match it to bunryu's hashes, so it cannot be stored as a one-way hash. Supabase encrypts the disk and the connection. The browser has no database access (row-level security with no policy, privileges revoked), and only the server's service role can read the tables. The spreadsheet this replaces held the same keys in plain text for every editor. Encrypting them in the application, with a key only the server holds, would also protect dumps and backups; it is not built yet.
- **Everyone with access to an input sees and can copy its full stream keys**, viewers included. Editors must read a key to check and fix it, and the viewer role exists so someone can verify a destination without being able to change it. Scope is per input and filtered on the server, so a team never receives another team's keys. A key exposed by mistake is replaced on its platform in seconds. Give access to the smallest scope that works.
- **Admins and owners see every event.** A small streaming team runs every event. Owners are fixed in a server setting and cannot be changed in the app, admin changes are recorded, an admin cannot remove themselves, and only admins read the history.
- **History and the trash keep earlier stream keys for 30 days.** This lets an accidental deletion during a live event be undone. Only admins can restore, and the data is removed automatically when the 30 days end.
- **Owners can reveal the server secret** in the bunryu dialog. bunryu needs it to derive its token and hash secret, and owners are the people who set bunryu up. The server allows owners only. The secret is fetched when the dialog opens, masked until revealed, and cleared from the page when it closes.
- **The `ingest` function skips Supabase's user-token check** and uses a shared bearer token, because bunryu is a server and has no Google account. The token is derived from a secret of at least 32 characters and compared in constant time. The body is capped at 1 MB and 1,000 entries, and the function can only write status rows and returns no data. Whoever holds the token can post false statuses, but cannot read anything or learn a stream key.
- **Supabase's Data API is on and reachable with the publishable key.** The server function uses the service role through that same API, so it has to stay on. A direct call with the publishable key gets nothing, because every table has row-level security with no policy and the public roles hold no privileges. A table added later starts closed.
- **Editors see who else has access to their events**, admins and owners included. Everyone is a colleague and needs to know who to ask. Viewers do not receive the list.
- **The duplicate check can say an address is "already added in this event"** when the match is in an input the person cannot open. It has to look across the event, because the same address in two inputs would break the stream. It confirms only that an address identical to the one just typed exists, and returns no name, input or key.
- **bunryu's redacted status text reaches the browser.** bunryu redacts URLs and secrets and the server redacts them again. The text is needed to write the plain-language advice that editors see. The technical text itself is available only through a Copy button meant for the streaming team, and as a hover detail for owners.
- **Reading a key is not logged**, only changes are, for 30 days. The change history covers every write, reading is limited to people with a role, and the hosting platform's function logs record each API call.
- **There is no application-level rate limit.** Every call needs a valid token for a verified Google account, the app has no password to guess, and the hosting platform applies its own limits.
- **The session token is kept in the browser's local storage**, as is usual for Supabase Auth. The risk is script injection, which the Content-Security-Policy (no inline script, no `eval`, no third-party script) and output escaping prevent. Access tokens are short-lived and refreshed, and sign-in uses PKCE.
- **The Content-Security-Policy allows any `*.supabase.co` host** for connections, because the project address is set at build time and the header file is static. Using it would first need script injection, which the policy prevents. Pinning the exact host is a configuration change.
- **Multi-factor sign-in is Google's, not the app's.** Identity is delegated to Google, so your Workspace policy (2-Step Verification, session control, suspending leavers) applies. See the checklist above.
- **The repository is public.** Security does not depend on the code being secret. No secret or key belongs in the repository or its history, and secrets live in the Supabase and Vercel settings.
- **A build-time development dependency may carry an advisory.** The stylesheet build runs only on a developer or CI machine, on the project's own CSS, and is not shipped to users. The production dependencies are kept at no known vulnerabilities, and Dependabot tracks the rest.
- **Changes may be pushed straight to the main branch** when one person maintains the project. Every push runs the tests, type checks and both builds, and the database deploy runs the tests again before it applies anything. When a second person can push, protect the branch (see the checklist).

## How to verify

Run these against your own deployment and checkout. Replace the placeholders.

- **The database is closed to the browser's key.** This call, with the publishable key, should return a permission error and no rows:

    ```bash
    curl -s "https://<project-ref>.supabase.co/rest/v1/keys?select=*"       -H "apikey: <publishable key>" -H "Authorization: Bearer <publishable key>"
    ```

- **No public privileges.** In the Supabase SQL editor, `select has_table_privilege('anon', 'public.keys', 'select'), has_table_privilege('authenticated', 'public.keys', 'select');` should return `false, false`. Repeat for each table in `public`.
- **The security headers are served.** `curl -sI https://your-app.vercel.app/` should show `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and `Cross-Origin-Opener-Policy`.
- **The rules hold.** `npm test` runs the access, validation, history, status, hashing and rendering tests, `npm run typecheck` checks the types, and `npm run test:db` (needs Docker) applies every migration to a fresh Postgres and checks the schema and SQL functions.
- **The dependencies are clean.** `npm audit --omit=dev` should report no vulnerabilities in what ships to users.
- **No secret is in the history.** Search the whole history for key patterns, for example `git log -p --all -S"sb_secret_"`, and rely on the repository's secret scanning for the rest.
- **Sign-in is limited.** Sign in with an account outside your organisation. If the consent screen is Internal, Google refuses it. With any other account, the app shows nothing until you give it a role.

## Rules for changing the code

These keep the properties above true. Follow them in every change.

- **Decide who may do what in `access.ts` and in the operations, on the server.** The browser only shows what the server tells it. Never add a permission check that exists only in the browser.
- **A new table** turns on row level security, adds no policy for `anon` or `authenticated`, and revokes their privileges. A new function revokes `execute` from `public`. `npm run test:db` must still pass.
- **Never send a service-role or secret key to the browser**, and never put a stream key in a URL, a log line or bunryu's report.
- **Escape all dynamic text** with `escapeHtml` and open links only through `safeUrl`. Add no inline script, inline style, `eval` or third-party script: the Content-Security-Policy forbids them. A new external host needs a deliberate change to `vercel.json`.
- **Validate every field on the server** with a length limit, and take roles, platforms and kinds from fixed lists. Keep the destination rules in the shared module, so the form and the server cannot disagree.
- **Record every write** in the change history, and keep it out of the browser's reach.
- **Run the checks** (`npm test`, `npm run typecheck`, `npm run format:check`, and `npm run test:db` for database changes) before you push.

## Reporting a problem

Do not open a public issue for a vulnerability. Tell the maintainers of the deployment, or the repository owners, privately.
