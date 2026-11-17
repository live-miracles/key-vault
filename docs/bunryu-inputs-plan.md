# Plan: bunryu reports input status to Key Vault

For a reviewer, and for an implementer (human or model) working in the **bunryu** repository. Key Vault's side is already built and committed in this repository; only bunryu's side is missing. This plan was written from reading bunryu's reporter on the branch `claude/key-vault-reporter-a77a29` (`src/services/keyVaultReporter.ts`, `src/utils/keyVaultPayload.ts`, `src/utils/outputStatus.ts`, `public/ts/core/status.ts`). Check it against the current branch before starting.

## Goal

Once a minute bunryu already tells Key Vault the state of every **output**. Add the state of every **input** (each pipeline's incoming signal) to the same heartbeat, so Key Vault can show:

- whether the signal for each input is arriving, in the input list and in a banner above that input's streams;
- on a failing stream, "the input is not arriving, so this is probably not a problem with the platform" instead of sending the media team to chase the vendor;
- a "Check input" warning when an output's link runs in a pipeline whose name differs from the input the stream was filed under in Key Vault. This one needs no new data: it uses the `pipeline` name every output already carries.

## Matching rule (decided)

A Key Vault **input** and a bunryu **pipeline** are the same thing when their **names** are equal, ignoring case, leading and trailing spaces, and runs of spaces ("Hindi", "hindi", " Hindi " are one). Key Vault does this in `normalizeInputName` (`supabase/functions/_shared/status.ts`). No id is shared. So:

- bunryu must send the pipeline's **display name** exactly as the operator typed it, with no decoration.
- If two pipelines have the same normalized name, Key Vault shows the worse of their statuses. This is accepted, not an error.
- Operators must name pipelines the same as the inputs in Key Vault. Key Vault's input form says so.

## Contract: the heartbeat gains `inputs`

The heartbeat (`version: 1`, unchanged) gets one optional field next to `outputs`:

```json
{
    "version": 1,
    "instance": "prod",
    "sentAt": "2026-11-17T10:00:00Z",
    "outputs": [],
    "inputs": [
        {
            "pipeline": "Hindi",
            "status": "running",
            "message": "",
            "sinceMs": 1731837600000
        }
    ]
}
```

| Field      | Rule                                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pipeline` | Required, non-empty, at most 200 characters. The pipeline's name.                                                                                                |
| `status`   | `running`, `warning`, `error` or `stopped` (the same four as outputs).                                                                                           |
| `message`  | One line, **redacted exactly like an output's** (`redactMessage`), at most 300 characters. Empty when the status is `running` or `stopped`.                      |
| `sinceMs`  | When the input entered this status, in milliseconds since the epoch. Survives from one report to the next, like an output's (reuse the `sinceById` map pattern). |

Limits on Key Vault's side: at most 1000 entries; `inputs` that is present but not an array, or an entry with an empty `pipeline` or an unknown `status`, rejects the **whole** heartbeat with a 400. So build it carefully and test it. An older Key Vault ignores the field, and an older bunryu that sends none still works, so the two can be deployed in either order. The reference is `parseHeartbeat` in `supabase/functions/_shared/status.ts` and the contract section of `docs/refactor-plan.md` in the Key Vault repository.

Send an entry for **every pipeline** that exists, including those with no outputs.

## Status mapping

bunryu's dashboard already derives an input verdict in `inputHealth` (`public/ts/core/status.ts`): `good`, `warn`, `error`, `off`, with issues (a failed or pending ffprobe, low bitrate, missing audio, and the pipeline alerts from `PipelineHealth.alerts`). Reuse that logic; do not invent a second one.

| bunryu verdict                                           | Reported `status` | Meaning in Key Vault |
| -------------------------------------------------------- | ----------------- | -------------------- |
| `good`                                                   | `running`         | Receiving            |
| `warn`                                                   | `warning`         | Unstable             |
| `error`                                                  | `error`           | Not arriving         |
| `off` and at least one output of the pipeline should run | `error`           | Not arriving         |
| `off` and no output of the pipeline should run           | `stopped`         | Idle                 |

`message` is the first issue's message for `warning` and `error`, and for the `off`-but-expected case something fixed like "No signal is arriving." Redact it.

**Decision for the reviewer.** The `off` + outputs-should-run row is what makes the feature useful: without it an input with no signal never reads as a problem, and the Key Vault banner and the "not the platform's fault" note never appear. The cost is that before an event starts, with outputs set to run but no encoder connected yet, every input shows as "Not arriving". bunryu only runs during events, so this is probably right and even helpful, but confirm. The alternative is `stopped` for every `off`, which is quieter and defeats the main use.

## Where the change goes in bunryu

bunryu compiles its server (`src/`) and dashboard (`public/ts/`) as two TypeScript projects that cannot import each other. The output status rules are therefore **duplicated on purpose**, and `test/outputStatusParity.test.js` runs both copies on the same data and asserts they agree. Follow that precedent for inputs instead of trying to share code.

1. **`src/utils/inputStatus.ts`** (new), next to `outputStatus.ts`: `reportedInputState(input: InputHealth, alerts: PipelineAlert[], outputsShouldRun: boolean): { status: ReportedStatus; message: string }`. A server copy of the logic of `inputHealth` plus the mapping table above. `InputHealth` and `PipelineHealth` are in `src/services/health.ts`. Note that on the server the alerts are `PipelineHealth.alerts`, while the dashboard merges them into `input.alerts`.
2. **`src/utils/keyVaultPayload.ts`**:
    - add `ReportedInput` and `inputs: ReportedInput[]` to `KeyVaultPayload`;
    - in `buildPayload`, for each pipeline in `source.pipelines`, build one entry from `source.health[String(pipeline.id)]` (`input` and `alerts`); `outputsShouldRun` is "any of the pipeline's outputs has `desiredState !== 'stopped'`" (the data is already in `outputsOf`);
    - keep a second `sinceById`-style map for inputs (key `input:<pipelineId>`), and delete entries of pipelines that no longer exist, as is done for outputs;
    - pass the message through `redactMessage`;
    - include inputs in `payloadSignature` (for example `i:<pipeline>:<status>`), so a change in an input's status is sent at once, within the existing rate limit, instead of waiting for the next minute.
3. **`src/services/keyVaultReporter.ts`**: it calls `buildPayload` with the health snapshot. It should need no change beyond passing what `buildPayload` now needs; check that `PayloadSource` still has everything (pipelines, outputs, health).
4. **Dashboard**: no change needed. The parity test is what keeps the two copies honest.

## Tests

- `test/keyVaultPayload.test.js`: every pipeline gets an entry; each row of the mapping table (including both `off` cases); a pipeline with no outputs; `sinceMs` is stable between two builds with the same status and resets on a change; the message is redacted (an ffprobe error that names a URL or a key); a deleted pipeline's `since` entry is dropped; `payloadSignature` changes when only an input's status changes.
- `test/outputStatusParity.test.js` (or a new `inputStatusParity.test.js`): run `inputHealth` from the dashboard and `reportedInputState` on the same inputs and assert the `good`/`warn`/`error`/`off` verdicts agree.
- `test/keyVaultReporter.test.js`: the heartbeat body that reaches the receiver contains `inputs`, and an input change triggers an early send.
- Run lint, the format check and the full suite, as bunryu's `AGENTS.md` requires. Nothing real is committed (public repository).

## Documentation (bunryu's `AGENTS.md` asks for this)

- `docs/3-operations/3-configuration.md`, "Key Vault status reporting": add `inputs` to the described report, say that pipeline names must match the input names in Key Vault, and give the mapping table.
- `docs/4-reference/3-design-decisions.md`: a new entry. Why inputs are reported, why matching is by name (an id would need configuration on both sides, and a typo-proof link is not worth it), why `off` with running outputs is an error, and why the status rules are duplicated with a parity test. Its existing entry "Hints are a dashboard lookup, not an API field" stays true: Key Vault writes its own advice for the media team, so bunryu sends no `hint`.
- `AGENTS.md`: update the line for `src/services/keyVaultReporter.ts` and mention `src/utils/inputStatus.ts`.

## Rollout order

1. Key Vault first: apply its migrations (`20261117000000_stream_inputs.sql` adds the table and the new `ingest_heartbeat`) and deploy the `api` and `ingest` functions. This is not strictly required, since an old Key Vault ignores `inputs`, but it lets the first real heartbeat be checked.
2. Then deploy bunryu. Send one heartbeat by hand or watch the first minute, and confirm in Key Vault's database that `stream_inputs` has one row per pipeline.
3. In Key Vault, check that each input's dot, the banner and the "Check input" warning behave, for one pipeline in each state.

## Things to check in bunryu before starting

- **The branch is not merged.** `claude/key-vault-reporter-a77a29` holds the whole reporter (`4728023 Add the Key Vault status reporter`). Build on it, not on `main`.
- **Configuration may be out of date.** On that branch the config block has a separate `token` and `hash_secret`. Key Vault now derives both from a single secret (`KEY_VAULT_SECRET`) and exposes `{ url, secret }` to owners for bunryu's `key_vault` setting. Reconcile this with whatever bunryu's Settings > Key Vault page does now. It does not affect this change, but a reviewer should know.
- **Which pipelines count.** The reporter skips shared-encode rows for outputs. Decide that inputs of every real pipeline are reported, and confirm there is no other kind of pipeline to skip.

## Acceptance

- With bunryu connected, Key Vault's input list shows a dot per input, and an input whose encoder is disconnected while its outputs are set to run shows "Not arriving" and the banner.
- A failing stream in that input reads "The input … is not arriving, so this is probably not a problem with the platform."
- A stream whose link is configured in a differently named pipeline shows "Check input".
- A pipeline named differently from every Key Vault input causes nothing to show and nothing to break.
- The heartbeat is still accepted by Key Vault: no 400 for any pipeline name or state.
