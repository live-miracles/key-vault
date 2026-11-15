# Cutover runbook

Moving from the Apps Script app to Supabase + Vercel, and turning on the bunryu link. Do it in this order; each step says how to tell it worked. The Apps Script deployment is not touched until the end, so you can stop at any step and nothing is lost.

You need: owner access to a Supabase project, a Google Cloud project for the OAuth client, a Vercel account, admin access to this GitHub repository, and shell access to the machine running bunryu.

## 1. Create the Supabase project

1. Create a project. Note the project ref (the `abcdefgh` in `https://abcdefgh.supabase.co`).
2. Generate two random secrets (for example `openssl rand -hex 32`): one for **hashing**, one for the **ingest token**. Keep them in a password manager; you will paste each in two places.

## 2. Google sign-in

1. In Google Cloud → APIs & Credentials create an OAuth client (Web application). Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
2. In Supabase → Authentication → Providers → Google, paste the client id and secret and enable it.
3. Authentication → URL Configuration: set the Site URL to the Vercel URL (you can add it after step 4).

## 3. Deploy the database and functions

Set the repository secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`, then set the function secrets:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase secrets set KEY_VAULT_APP_ORIGIN=https://<your-site> \
  KEY_VAULT_HASH_SECRET=<hash secret> \
  KEY_VAULT_INGEST_TOKEN=<ingest token> \
  KEY_VAULT_OWNER_EMAILS=<your email>
```

Then run the **Deploy Supabase** workflow (Actions → Run workflow), or locally `npx supabase db push` and `npx supabase functions deploy api` / `deploy ingest --no-verify-jwt`.

Check: the Supabase dashboard shows the tables `events`, `languages`, `roles`, `keys`, `ingest_instances`, `stream_outputs`, and both functions. Before this, run `npm run test:db` once with Docker running; it proves the migrations and SQL functions on a real Postgres.

## 4. Deploy the site

Import the repository in Vercel. Environment variables: `KEY_VAULT_SUPABASE_URL` and `KEY_VAULT_SUPABASE_PUBLISHABLE_KEY` (the **publishable** key from Project Settings → API Keys; the build fails on a secret key). Deploy, then put the Vercel URL in `KEY_VAULT_APP_ORIGIN` (step 3) and in the Supabase Site URL (step 2).

Check: opening the site shows "Sign in with Google"; signing in with the owner email shows an empty app (no events yet).

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

The reporter is on the bunryu branch `claude/key-vault-reporter-a77a29` (committed locally, not pushed or merged). After it is merged and deployed, add to `bunryu.json`:

```json
"key_vault": {
    "url": "https://<project-ref>.supabase.co/functions/v1/ingest",
    "token": "<ingest token>",
    "hash_secret": "<hash secret>",
    "instance": "prod"
}
```

and restart bunryu. Use the **same** hash secret and token as in step 3.

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
