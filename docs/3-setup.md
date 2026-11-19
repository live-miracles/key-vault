# Setting up Key Vault

For the people who deploy Key Vault for their team. Editors who only add destinations need the [user guide](1-user-guide.md) instead.

Do it in this order; each step says how to tell it worked. You need: owner access to a Supabase project, a Google Cloud project for the OAuth client, a Vercel account, admin access to this GitHub repository, and shell access to the machine running bunryu.

## 1. Create the Supabase project

1. Create a project. Note the project ref (the `abcdefgh` in `https://abcdefgh.supabase.co`).
2. When Supabase offers to connect the project to GitHub, **skip it**. The **Deploy Supabase** workflow already applies the migrations and deploys the functions; the integration would overlap with it and does not deploy functions with the flags `ingest` needs.
3. Generate one random secret: `openssl rand -hex 32`. Keep it in a password manager; you paste it into Supabase in step 4. See [The bunryu link](5-bunryu-contract.md#secrets) for what is derived from it.

The order below avoids a loop: the database and functions need no site URL, the site needs only the Supabase URL and key, and the secrets and sign-in settings need the site URL, so they come last.

## 2. Deploy the database and functions

1. Create a Supabase access token (supabase.com/dashboard/account/tokens) and add the repository secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`. No database password is needed.
2. Run `npm run test:db` once with Docker running; it proves the schema and SQL functions on a real Postgres.
3. Run the **Deploy Supabase** workflow (Actions → Run workflow), or locally `npx supabase db push` and `npx supabase functions deploy api` / `deploy ingest --no-verify-jwt`.

The schema is one migration. If you applied an earlier version of this project's migrations to a database that has no data worth keeping, reset it once with `npx supabase db reset --linked` (this deletes everything in it) before deploying.

Check: the Supabase dashboard shows the tables `events`, `inputs`, `roles`, `keys`, `ingest_instances`, `stream_outputs`, `stream_inputs`, and both functions.

## 3. Deploy the site

Import the repository in Vercel. Set these environment variables **before the first build** (a build without them fails with "Set KEY_VAULT_SUPABASE_URL and KEY_VAULT_SUPABASE_PUBLISHABLE_KEY"; after adding them, redeploy, since they only apply to new builds):

- `KEY_VAULT_SUPABASE_URL`: `https://<project-ref>.supabase.co`
- `KEY_VAULT_SUPABASE_PUBLISHABLE_KEY`: the **publishable** key (`sb_publishable_…`) from Project Settings → API Keys. The build refuses a secret key.

Note the site's URL (for example `https://your-site.vercel.app`) for the next step.

## 4. Google sign-in and function secrets

1. In Google Cloud → APIs & Credentials create an OAuth client (Web application). Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
2. In Supabase → Authentication → Providers → Google, paste the client id and secret and enable it.
3. Authentication → URL Configuration: set the **Site URL** to the site's URL and add `https://<your-site>/**` under **Redirect URLs** (and `http://localhost:2837/**` if you want to sign in during local development). Until you do, Supabase's default Site URL sends you back to `http://localhost:3000` after signing in.
4. Set the function secrets. Run this from this repository, with the project ref given explicitly (`supabase link` is remembered per directory):

    ```bash
    read -rs SECRET; echo   # paste the secret
    npx supabase secrets set \
      KEY_VAULT_APP_ORIGIN=https://<your-site> \
      KEY_VAULT_SECRET="$SECRET" \
      KEY_VAULT_OWNER_EMAILS="you@example.com,other@example.com" \
      --project-ref <project-ref>
    unset SECRET
    npx supabase secrets list --project-ref <project-ref>
    ```

    - `KEY_VAULT_APP_ORIGIN` is exactly the site's origin: no trailing slash, no path.
    - `KEY_VAULT_OWNER_EMAILS` is a comma-separated list of Google sign-in addresses. Owners can do everything in every event, and are the only ones who open the bunryu settings; for anyone who needs less, grant a role in the app. These owners are fixed: the app cannot remove them. Once signed in they can add other admins in the **Admins** dialog, who can be removed there and cannot open the bunryu settings. The first owner is how the first event and roles get created.
    - The `list` should show all three `KEY_VAULT_*` names. Values are not shown afterwards, so keep your copies.

Check: opening the site shows "Sign in with Google"; signing in with an owner email shows an empty app (no events yet) and no error.

If something is off:

| What you see                                    | Cause                                                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sign-in returns to `http://localhost:3000`      | The Supabase Site URL is still the default (step 4.3).                                                                                                                   |
| "Failed to fetch" on load                       | `KEY_VAULT_APP_ORIGIN` is not set, or does not match the site's origin exactly, so the browser blocks the call.                                                          |
| "The server is not configured."                 | `KEY_VAULT_SECRET` (or another `KEY_VAULT_*` secret) is missing, or `KEY_VAULT_SECRET` is shorter than 32 characters; compare `secrets list` with the three names above. |
| Build fails with "Set KEY_VAULT_SUPABASE_URL …" | The Vercel environment variables are missing; add them and redeploy.                                                                                                     |

## 5. Turn on bunryu

In bunryu open **Settings > Key Vault** and enter the **Link** and the **Secret**, then **Save** and **Send test report**. Signed in as a Key Vault owner, click the bunryu indicator in the Key Vault header: it shows both values with copy buttons. The secret is the `KEY_VAULT_SECRET` from step 4; bunryu derives the token and the hash secret from it, as Key Vault does. If you ever change `KEY_VAULT_SECRET`, enter the new one in bunryu too. bunryu reports under its **Server Name** (Settings > General); give each server its own.

Check, within two minutes:

- `ingest_instances` has a row named after bunryu's Server Name and `stream_outputs` has one row per configured output.
- In Key Vault a destination whose main or backup address is configured in bunryu shows its status; hovering shows the pipeline, output and message (owners and admins). One not configured in bunryu says "Not set up yet".
- Stop an output in bunryu: its destination turns indigo ("configured, not running"). Make one fail until bunryu gives up: red, with "stopped after N failed attempts".
- The header shows "bunryu connected" with a green dot.
- Stop bunryu: after about three minutes the statuses clear and the header says "bunryu last seen N min ago" (there is no warning: bunryu is only on during events).

If a destination you know is configured shows nothing, the address differs between the two systems (a trailing path, a different server, a changed key). Compare them; the hash is of the whole address.

## 6. Install it as an app (optional)

Key Vault is a progressive web app, so once the site is on HTTPS Chrome and Edge offer to install it, with no store or extra build step. See [Install Key Vault as an app](2-install-as-app.md) for how your team does it and what to check if the install button is missing.

## Backups

The free Supabase plan has no managed backups and pauses a project after a week without activity (bunryu's heartbeat prevents the pause while it runs). Take a dump before and after an event, for example with `npx supabase db dump --data-only -f backup.sql` (the file contains stream keys: store it like a secret).
