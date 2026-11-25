# The bunryu link

How bunryu, the streaming server, tells Key Vault what each output is doing, and how Key Vault turns that into the status of a destination. It is the contract both repositories keep. `CONTEXT.md` says why it exists.

```text
bunryu ──POST /functions/v1/ingest (every 60 s, bearer token)──► Edge Function `ingest`
                                                                  └─► tables ingest_instances, stream_outputs, stream_inputs
Browser → Vercel static app → Supabase Auth
                           ├→ Edge Function `api` (reads the tables above as getStatus)
                           └→ Postgres (no direct browser access)
```

Free-tier fit: one bunryu sending every minute is about 43,000 invocations a month against 500,000 free. Only the latest state is stored, with no history, and the steady traffic keeps the free project from pausing.

## Heartbeat

Sent by bunryu every 60 s, and immediately on a status change (rate-limited to once per 10 s). Parsed and validated by `parseHeartbeat` in `supabase/functions/_shared/status.ts`.

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

- `instance` is bunryu's Server Name as typed (its default is "Bunryu"): 1-80 characters, no control characters, and distinct per server. Any name bunryu accepts is accepted here.
- `status` is one of `running`, `warning`, `error`, `stopped`. A stop after repeated failures is `error` with `stoppedAfterFailures: true`; a stop the operator chose is plain `stopped`. bunryu decides the status.
- **`message` is redacted by bunryu.** Its logs contain destination URLs and stream keys, so the reporter strips `rtmp(s)://` and `srt://` URLs and `key=`/`passphrase=` values and truncates to 300 characters. Key Vault replaces any URL that still got through before it stores the message.
- **Advice is written in Key Vault, not sent by bunryu.** bunryu's own hints are for the streaming team and name hosts, ports and FFmpeg. Key Vault matches the redacted `message` against a short list of known errors and answers in the media team's words. An unknown message gets one generic line, and the heartbeat needs no extra field.
- **`inputs` is optional** and says whether each pipeline's signal is arriving, with the same four statuses: `running` the signal arrives normally, `warning` it arrives with an alert (low bitrate, packet loss), `error` the pipeline is meant to be live but nothing arrives, `stopped` the pipeline is off or not expected. An older bunryu sends none.
- **One unusable entry does not fail the report.** An output with a malformed `hash` or an unknown `status`, or an input with a blank `pipeline` or an unknown `status`, is left out and the rest is stored. `ingest` answers `{ ok, stored, skipped }` and logs what it left out (Supabase function logs). A wrong `version`, an invalid `sentAt`, an `outputs` or `inputs` that is not a list, or more than 1000 entries still refuses the whole report with HTTP 400. Long names and messages are cut, not refused.
- Only the latest heartbeat of each bunryu is kept (`ingest_heartbeat()` replaces an instance's rows in one transaction). An instance silent for 30 days is deleted.

## Matching

- **Destinations are matched by hash, never by address.** The hash is HMAC-SHA256 of the normalised address with a secret shared by bunryu and Key Vault, hex, first 32 characters. The address is trimmed, with lowercase scheme and host and no trailing `/`. Key Vault builds the same address from a destination's platform and stream key (`mainUrl` and `backupUrl` in `_shared/platforms.ts`, including the Instagram `${s_prp}` substitution and YouTube's `?backup=1/` backup address), then hashes it (`_shared/link-hash.ts`). A shared file of test vectors (`test/fixtures/key-vault-hash-vectors.json`) lives in both repositories so the two implementations cannot drift.
- Main and backup are looked up independently. When one address appears in several outputs, the worst status wins, and a destination's status is the worse of its main and backup (`side` says which). The report also keeps each stream's own state in `sides` (`main` and `backup`: a status, `not_configured` when bunryu has no output with that address, or `null` when the destination has no link on that side), so a card can show a dot for each. bunryu sends nothing extra: it only needs to run the backup as an output of its own.
- **A pipeline is matched to an Input by name**, ignoring case and extra spaces (`normalizeInputName`). So the name of an input in Key Vault must be the pipeline's name in bunryu. That gives the input's status, and a check that each output runs in the pipeline its destination is for (`inputMismatch`). With no pipeline of that name reported, the input has no status and nothing is claimed. An input bunryu reports as `error` for 10 minutes or more (`INPUT_OFF_AFTER_MS`, from its `sinceMs`) is shown as off (Idle), not failing: its destinations that are not live say "Not started yet" in neutral colors and no banner is raised. A shorter silence is still an alarm.

## What a destination shows

`getStatus` returns one status per destination. The browser only words it; it ranks nothing.

| Condition                           | `state`           | Meaning              | Shown as              |
| ----------------------------------- | ----------------- | -------------------- | --------------------- |
| No hash match                       | `not_configured`  | Not set up yet       | no color              |
| Match, `running`                    | `running`         | Live                 | green                 |
| Match, `warning`                    | `warning`         | Unstable             | amber                 |
| Match, `error`                      | `error`           | Failing or gave up   | red                   |
| Match, `stopped`                    | `stopped`         | Configured, not sent | indigo                |
| Last heartbeat older than 3 minutes | `stopped` (`off`) | bunryu is off        | indigo, "Not sending" |
| Same, but the link was not in it    | `not_configured`  | Not set up yet       | no color              |

bunryu only runs during events, so silence is normal and never shown as a problem.

**A silent bunryu is not shown as running.** Once every bunryu that has reported has been silent for `FRESH_MS` (3 minutes), the report says `off: true`. A destination's last status can no longer be trusted, so each destination whose link was in bunryu's last report is `stopped` (the output is off) with no message or failure count, and each that was not is `not_configured`, exactly as the last report said. Which links bunryu has is remembered from the stored last heartbeat (kept for 30 days); what it was doing is not. Inputs are not remembered: no pipeline has a status while bunryu is off. Before any bunryu has ever reported, `off` is false and nothing is claimed. A live bunryu always wins: `off` is false while any bunryu is reporting.

## Secrets

One secret, `KEY_VAULT_SECRET` (at least 32 characters). Two values are derived from it, each by HMAC-SHA256 under its own label (`_shared/secrets.ts`): the **ingest token**, which travels in a header on every heartbeat, and the **hash secret**, which never leaves bunryu and the server. Knowing the token reveals nothing about the hash secret. bunryu takes the same `KEY_VAULT_SECRET` (owners copy it, with the link, from the bunryu dialog in the app) and derives both itself; both repositories pin the derivation in tests.

| Secret                   | Used by     | Meaning                        |
| ------------------------ | ----------- | ------------------------------ |
| `KEY_VAULT_APP_ORIGIN`   | api         | The frontend origin, for CORS  |
| `KEY_VAULT_OWNER_EMAILS` | api         | Fixed owners (comma separated) |
| `KEY_VAULT_SECRET`       | api, ingest | The one secret above           |

## bunryu's side

bunryu is configured on **Settings > Key Vault** with `{ url, secret }`, checked when it is typed; an empty link disables it. It reports under its Server Name (Settings > General), so give each server its own. Its reporter keeps a 60 s timer, redacts, hashes, uses a bounded timeout and retry with backoff, never throws into its control plane and logs each failure once per episode.
