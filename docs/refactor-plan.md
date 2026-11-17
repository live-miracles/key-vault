# Key Vault refactor plan

Three changes that land together because they all touch the same frontend and data model:

1. **Platform**: Apps Script + Google Sheet → Vercel (static frontend) + Supabase (Postgres, Auth, Edge Function), the same shape as `../setu`.
2. **bunryu link**: bunryu reports every output's status once a minute; Key Vault derives key colors from it instead of people setting them by hand.
3. **UI**: remove DaisyUI, adopt a DESIGN.md theme from `../awesome-design-md`, add a Japanese wave (seigaiha) background.

## Decisions to confirm

| #   | Decision     | Recommendation                                                                                                                                                                                                                                                                     |
| --- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Theme        | **Linear** (`design-md/linear.app`): near-black canvas, hairline borders, one indigo accent (#5e6ad2). Indigo is close to traditional Japanese ai-iro, so waves look native, and a dark UI suits control rooms. Alternative: **Claude** (warm cream, light) with ink-stroke waves. |
| 2   | UI stack     | Keep vanilla TypeScript + Tailwind v4, drop DaisyUI. Do not copy setu's React + antd: antd's own look fights a custom theme and the app is small.                                                                                                                                  |
| 3   | Hash         | HMAC-SHA256 of the normalised full URL with a secret shared by bunryu and Key Vault, hex, first 32 chars.                                                                                                                                                                          |
| 4   | Manual color | Keep as an optional override (column `color_override`, owners/admins only). Automatic status wins unless an override is set.                                                                                                                                                       |
| 5   | Auth         | Supabase Auth with Google OAuth. Roles stay email-based (owner/admin/editor/viewer, input restriction) and move into Postgres tables with row-level security.                                                                                                                      |

## Target architecture

```text
bunryu ──POST /functions/v1/ingest (every 60 s, bearer token)──► Supabase Edge Function
                                                                   └─► table stream_status (upsert latest)
Browser → Vercel static app → Supabase Auth
                           ├→ Edge Function: api (events, roles, inputs, keys)
                           └→ Postgres (no direct browser access)
```

Free-tier fit (same limits as setu's AGENTS.md): one bunryu sending every minute is about 43,000 invocations per month against 500,000 free. Only the latest state is stored (upsert, no history), and the steady traffic keeps the free project from pausing.

## Heartbeat contract (platform independent)

Sent by bunryu every 60 s, and immediately on a status change (rate-limited to once per 10 s).

```json
{
    "version": 1,
    "instance": "prod",
    "sentAt": "2026-11-01T10:00:00Z",
    "outputs": [
        {
            "hash": "9f2c…",
            "pipeline": "Hindi",
            "output": "YouTube main",
            "status": "running",
            "message": "",
            "failures": 0,
            "stoppedAfterFailures": false,
            "sinceMs": 1730455200000
        }
    ],
    "inputs": [
        {
            "pipeline": "Hindi",
            "status": "running",
            "message": "",
            "sinceMs": 1730451600000
        }
    ]
}
```

- `status` is one of `running`, `warning`, `error`, `stopped`. A stop after repeated failures is `error` with `stoppedAfterFailures: true`; a stop the operator chose is plain `stopped`.
- Bunryu computes `status` on the server. Today that logic lives only in the dashboard (`public/ts/features/render.ts`, `outputSeverity` in `output-card.ts`), so it moves to a shared server module that the dashboard and the reporter both use.
- **`message` must be redacted.** Bunryu logs contain destination URLs and stream keys (its AGENTS.md says so). The reporter strips `rtmp(s)://`, `srt://` URLs and `key=`/`passphrase=` values, and truncates to 300 characters.
- **Advice is written in Key Vault, not sent by bunryu.** bunryu's own hints (`public/ts/core/hints.ts`) are for the streaming team and name hosts, ports and FFmpeg. Key Vault matches the redacted `message` against a short list of known errors (`ADVICE_PATTERNS` in `keys.ts`) and answers in the media team's words. It stays a lookup on the message, so an unknown message gets one generic line and the heartbeat needs no new field.
- **Hash input** is the full URL, trimmed, with lowercase scheme and host and no trailing `/`. Key Vault builds the same string from server + key (`getRtmpValue`, including the Instagram `${s_prp}` substitution and the YouTube backup `?backup=1/` form). A shared file of test vectors (URL → hash) lives in both repos so the two implementations cannot drift.
- **`inputs` (optional) says whether each pipeline's signal is arriving.** One entry per pipeline, with the same four statuses: `running` the signal arrives normally, `warning` it arrives with an alert (low bitrate, packet loss), `error` the pipeline is meant to be live but nothing arrives, `stopped` the pipeline is off or not expected. `message` is redacted like an output's. bunryu decides the status, as it does for outputs. An older bunryu sends no `inputs`.
- **A pipeline is matched to a Key Vault input by name**, ignoring case and extra spaces (`normalizeInputName` in `_shared/status.ts`). So the name of an input in Key Vault must be the pipeline's name in bunryu. This gives two things: the input's status (`report.inputs`, by input id), and a check that each output runs in the pipeline its stream is for (`inputMismatch` on a key's status, from the output's `pipeline` name). With no pipeline of that name reported the input has no status, and nothing is claimed.
- Key Vault matches by hash, so main and backup URLs are looked up independently. When one URL appears in several outputs, the worst status wins.

Key Vault's view of a key:

| Condition                           | Meaning              | Color                                     |
| ----------------------------------- | -------------------- | ----------------------------------------- |
| No hash match                       | Not configured       | none                                      |
| Match, `running`                    | Live                 | green                                     |
| Match, `warning`                    | Degraded             | amber                                     |
| Match, `error`                      | Failing or gave up   | red (stop icon if `stoppedAfterFailures`) |
| Match, `stopped`                    | Configured, not sent | indigo                                    |
| Last heartbeat older than 3 minutes | bunryu offline       | all colors muted (no warning)             |

## Phases

Each phase ends in something working and is a separate commit series. Phase 1 can run in its own session in parallel with phase 2.

### Phase 1 — bunryu reporter (repo `../bunryu`)

- Shared server-side output status module; dashboard switches to it, so behavior stays identical.
- `src/services/keyVaultReporter.ts`: 60 s timer, redaction, hashing, bounded timeout and retry with backoff, never throws into the control plane, logs each failure once per episode.
- Config is the **Settings > Key Vault** page (not `bunryu.json`): `{ url, secret }`, checked when it is typed. An empty link means disabled. The instance is bunryu's Server Name.
- Tests: status mapping, redaction (URLs, keys, passphrases), hash vectors, failure isolation.
- Docs per its AGENTS.md: configuration page, reliability page, API reference if routes change, design-decisions entry (why a push model, why HMAC). Run lint, format check and the full test suite. Nothing real is committed (public repo).

### Phase 2 — Supabase backend for Key Vault (built, not yet deployed)

Code is in `supabase/`. Decisions made while building it, which differ from the first draft of this plan:

- **No direct database access from the browser.** Every table has row-level security with no policy; the browser reaches data only through the `api` function, which checks the roles and then uses the service role (as setu does). So there is no Realtime on `stream_outputs`: the page asks `getStatus` on a timer instead. Realtime can be added later with a read policy if polling is not fresh enough.
- **The hash is computed in the `api` function, not in SQL.** Edge secrets are not visible to Postgres, and the function already has every key in memory. The secret never reaches the browser.
- **Same RPC contract.** `getAllData`, `addEvent`, `editKey` and the rest keep their names, arguments and `{success, data|error}` answers, plus a new `getStatus`. Ids are random UUIDs made by the database (migration `20261116000000_random_ids.sql`); rows that existed before keep their `E1`, `K1`, `L1`, `R1` ids. An input is added by name alone. The sheet's "language" became "input" everywhere (migration `20261117000100_rename_language_to_input.sql`): table `inputs`, `input` on keys and roles, `addInput` and the other operations.
- **The rules are one module, tested against the browser's.** `supabase/functions/_shared/access.ts` ports `frontend/src/access.ts`; `test/supabase-access.test.mjs` runs both over every combination of roles and requires identical answers. `_shared/operations.ts` ports `Code.ts` over a `Store` interface, tested with an in-memory store; `_shared/supabase-store.ts` is the Postgres one.
- **Heartbeat storage keeps only the latest beat per bunryu.** `ingest_heartbeat()` replaces an instance's rows in one transaction. An instance silent for 30 days is deleted.
- **App owners** come from the `KEY_VAULT_OWNER_EMAILS` secret (comma separated), replacing "the Apps Script deployer".
- **Sheet migration** is `build-tools/sheet-to-sql.mjs` (CSV per tab in, SQL out). It refuses data that would not load (roles of an unknown event, unknown inputs (the sheet's Language tab), duplicate ids) and lists every problem; `--skip-orphans` drops rows of a missing event. Apps Script keeps running untouched until cutover.
- **Deploy** is `.github/workflows/deploy-supabase.yml` (one project): tests, `db push`, deploy `api`, deploy `ingest --no-verify-jwt`.

Secrets to set (Supabase `secrets set`, never committed):

| Secret                   | Used by     | Meaning                                                                                                                      |
| ------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `KEY_VAULT_APP_ORIGIN`   | api         | The frontend origin, for CORS                                                                                                |
| `KEY_VAULT_OWNER_EMAILS` | api         | App owners                                                                                                                   |
| `KEY_VAULT_SECRET`       | api, ingest | One random secret (at least 32 characters). The bearer token and the HMAC secret are derived from it (`_shared/secrets.ts`). |

bunryu takes the same `KEY_VAULT_SECRET` (owners copy it, with the link, from the bunryu dialog in the app) and derives the same two values itself; both repositories pin them in tests. Each is HMAC-SHA256 of the secret under its own label, so the token (sent in a header every minute) reveals nothing about the hash secret.

Checks: `npm test` (56 tests, no database), `npm run typecheck`, and `npm run test:db`, which applies the migrations to a throwaway Postgres in Docker and exercises the SQL functions and constraints. The last one needs Docker Desktop running.

### Phase 3 — Frontend on Vercel (built)

- `frontend/src/supabase.ts` (its own bundle, `auth.js`) signs in with Google and calls the `api` function through `api-client.ts`; the app's `api()` goes through it, or through the demo mock when the site has no backend config. The demo (GitHub Pages) keeps its sample data and now shows sample statuses.
- `npm run build:vercel` writes `web/` and refuses to build without `KEY_VAULT_SUPABASE_URL` and the **publishable** key (a secret key is rejected). `vercel.json` sets the headers.
- **Not done: ES modules.** The first draft planned them. The app is still plain scripts sharing globals because the existing tests load them that way; the inline Apps Script bundle and its escaping are gone, which was the part that mattered. Converting file by file (and dropping `// @ts-nocheck`) is a separate, optional piece of work.
- `getStatus` is polled every 30 s; rows and cards are colored from it unless an owner or admin set a color by hand, and the colors clear when no bunryu has reported for 3 minutes (no warning, since bunryu only runs during events).
- Apps Script is removed from the repository (`Code.ts`, the inline build, clasp, their tests). The deployed script keeps running, untouched, until it is archived.

### Phase 4 — Design system and wave background (built)

- `DESIGN.md` (root) records the theme; tokens are in `frontend/input.css` (`@theme`). Theme: Linear, plus four status colors.
- DaisyUI is gone. The component classes the templates use (`btn`, `input`, `modal`, …) are defined in `input.css` under the same names, so the markup did not change. Dialogs are still native `<dialog>`.
- Waves: an inline SVG seigaiha pattern fixed behind the page, masked so it fades out toward the top, with no animation.
- Status tints are opaque (`tint-*` classes mixed over the surface) so the waves never show through a row.
- Checked in the browser at 1280 px and 375 px (table, cards, key dialog, sign-in panel). Not checked: contrast ratios with a tool, a real touch device, and the role/share, language and settings dialogs.

### Phase 5 — Cutover

A runbook is in [docs/cutover.md](cutover.md). It needs the Supabase, Google and Vercel accounts, so it is done by a person.

## Risks

- **Auth change**: users must sign in with Google through Supabase, and the owner's email must be seeded as owner before anyone else can administer.
- **Hash mismatches** from URL spelling differences: mitigated by normalisation plus shared vectors, and by showing "not matched" distinctly from "not running" in the UI.
- **Stale status**: a dead bunryu must not leave keys looking green; the 3-minute rule handles it.
- **Secrets**: `KEY_VAULT_SECRET` lives only in Supabase secrets; the two values derived from it live there and in bunryu's local config.
- **Scope**: phase 3 and 4 both rewrite the same templates; doing them in order avoids reworking markup twice.
