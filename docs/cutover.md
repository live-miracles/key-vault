# Cutover runbook

Moving from the Apps Script app to Supabase + Vercel, and turning on the bunryu link. Do it in this order; each step says how to tell it worked. The Apps Script deployment is not touched until the end, so you can stop at any step and nothing is lost.

You need: owner access to a Supabase project, a Google Cloud project for the OAuth client, a Vercel account, admin access to this GitHub repository, and shell access to the machine running bunryu.

## 1. Create the Supabase project

1. Create a project. Note the project ref (the `abcdefgh` in `https://abcdefgh.supabase.co`).
2. When Supabase offers to connect the project to GitHub, **skip it**. The **Deploy Supabase** workflow already applies the migrations and deploys the functions; the integration would overlap with it and does not deploy functions with the flags `ingest` needs.
3. Generate two random secrets, each different: `openssl rand -hex 32` once for **hashing** and once for the **ingest token**. Keep them in a password manager; you paste each in two places (Supabase here, bunryu in step 6). They do different jobs: the token proves a sender may post statuses, the hash secret lets Key Vault match a key to its status without bunryu ever sending the key. Keeping them separate means one leak does not expose the other.

The order below avoids a loop: the database and functions need no site URL, the site needs only the Supabase URL and key, and the secrets and sign-in settings need the site URL, so they come last.

## 2. Deploy the database and functions

1. Create a Supabase access token (supabase.com/dashboard/account/tokens) and add the repository secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`. No database password is needed.
2. Run `npm run test:db` once with Docker running; it proves the migrations and SQL functions on a real Postgres.
3. Run the **Deploy Supabase** workflow (Actions → Run workflow), or locally `npx supabase db push` and `npx supabase functions deploy api` / `deploy ingest --no-verify-jwt`.

Check: the Supabase dashboard shows the tables `events`, `languages`, `roles`, `keys`, `ingest_instances`, `stream_outputs`, and both functions.

## 3. Deploy the site

Import the repository in Vercel. Set these environment variables **before the first build** (a build without them fails with "Set KEY_VAULT_SUPABASE_URL and KEY_VAULT_SUPABASE_PUBLISHABLE_KEY"; after adding them, redeploy, since they only apply to new builds):

- `KEY_VAULT_SUPABASE_URL`: `https://<project-ref>.supabase.co`
- `KEY_VAULT_SUPABASE_PUBLISHABLE_KEY`: the **publishable** key (`sb_publishable_…`) from Project Settings → API Keys. The build refuses a secret key.

Note the site's URL (for example `https://your-site.vercel.app`) for the next two steps.

## 4. Google sign-in and function secrets

1. In Google Cloud → APIs & Credentials create an OAuth client (Web application). Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
2. In Supabase → Authentication → Providers → Google, paste the client id and secret and enable it.
3. Authentication → URL Configuration: set the **Site URL** to the site's URL and add `https://<your-site>/**` under **Redirect URLs** (and `http://localhost:2837/**` if you want to sign in during local development). Until you do, Supabase's default Site URL sends you back to `http://localhost:3000` after signing in.
4. Set the function secrets. Run this from this repository, with the project ref given explicitly (`supabase link` is remembered per directory):

    ```bash
    read -rs HASH; echo     # paste the hash secret
    read -rs TOKEN; echo    # paste the ingest token
    npx supabase secrets set \
      KEY_VAULT_APP_ORIGIN=https://<your-site> \
      KEY_VAULT_HASH_SECRET="$HASH" \
      KEY_VAULT_INGEST_TOKEN="$TOKEN" \
      KEY_VAULT_OWNER_EMAILS="you@example.com,other@example.com" \
      --project-ref <project-ref>
    unset HASH TOKEN
    npx supabase secrets list --project-ref <project-ref>
    ```

    - `KEY_VAULT_APP_ORIGIN` is exactly the site's origin: no trailing slash, no path.
    - `KEY_VAULT_OWNER_EMAILS` is a comma-separated list of Google sign-in addresses. Owners can do everything in every event; for anyone who needs less, grant a role in the app. The first owner is how the first event and roles get created.
    - The `list` should show all four `KEY_VAULT_*` names. Values are not shown afterwards, so keep your copies.

Check: opening the site shows "Sign in with Google"; signing in with an owner email shows an empty app (no events yet) and no error.

If something is off:

| What you see                                    | Cause                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Sign-in returns to `http://localhost:3000`      | The Supabase Site URL is still the default (step 4.3).                                                                   |
| `getAllData: Failed to fetch`                   | `KEY_VAULT_APP_ORIGIN` is not set, or does not match the site's origin exactly, so the browser blocks the call.          |
| `getAllData: The server is not configured.`     | One of the `KEY_VAULT_*` secrets (usually the hash secret) is missing; compare `secrets list` with the four names above. |
| Build fails with "Set KEY_VAULT_SUPABASE_URL …" | The Vercel environment variables are missing; add them and redeploy.                                                     |

## 5. Move the data

1. Freeze edits: tell everyone to stop changing keys in the Apps Script app.
2. In the Google Sheet download each tab as CSV into one folder: `Event.csv`, `Role.csv`, `Language.csv`, `Key.csv`.
3. Convert:

    ```bash
    npm run sheet:sql -- <folder> > .migration/data.sql
    ```

    It prints the counts (compare them with the sheet) and refuses anything that would not load, listing every problem. Fix the sheet and run it again; `--skip-orphans` drops roles and keys of an event that no longer exists.

4. Run `.migration/data.sql` against the database (Supabase SQL editor, or `psql` with the session pooler connection string).
5. **Delete `.migration/data.sql` and the CSV files**: they contain every stream key.

Check: sign in as the owner; each event shows the same keys as the sheet. Sign in as an editor and a viewer (ask them) and confirm they see only their languages.

## 6. Turn on bunryu

The reporter is on the bunryu branch `claude/key-vault-reporter-a77a29` (committed locally, not pushed or merged). After it is merged and deployed, add to `bunryu.json` (signed in as an owner, click the bunryu indicator in the Key Vault header: it lists every value below, with copy buttons and a ready-to-paste block):

```json
"key_vault": {
    "url": "https://<project-ref>.supabase.co/functions/v1/ingest",
    "token": "<ingest token>",
    "hash_secret": "<hash secret>",
    "instance": "prod"
}
```

and restart bunryu. Use the **same** hash secret and token as in step 4.

Check, within two minutes:

- `ingest_instances` has a row `prod` and `stream_outputs` has one row per configured output.
- In Key Vault a key whose main or backup URL is configured in bunryu is colored by its status; hovering shows the pipeline, output and message. A key not configured in bunryu has no color.
- Stop an output in bunryu: its key turns indigo ("configured, not running"). Make one fail until bunryu gives up: red, with "stopped after N failed attempts".
- The header shows "bunryu connected" with a green dot.
- Stop bunryu: after about three minutes the colors clear and the header says "bunryu last seen N min ago" (there is no warning: bunryu is only on during events).

If a key you know is configured shows no color, the URL differs between the two systems (a trailing path, a different server, a changed key). Compare them; the hash is of the whole URL.

## 7. Rehearse, then switch

Run one real event (or a rehearsal) on the new system while the Apps Script app stays untouched as a fallback. When it has gone well, tell everyone the new URL, then in Apps Script set the web app to "no access" or archive the project. Keep the Sheet as a backup for a release.

## Rollback

- Before step 7: nothing changed for users, so stop. Delete the project or just do not announce it.
- After step 7: re-enable the Apps Script web app. Edits made in the new system are not copied back; export the `keys` table to the sheet by hand if you need them.

## Backups

The free Supabase plan has no managed backups and pauses a project after a week without activity (bunryu's heartbeat prevents the pause while it runs). Take a dump before and after an event, for example with `npx supabase db dump --data-only -f backup.sql` (the file contains stream keys: store it like a secret).
