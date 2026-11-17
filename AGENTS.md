## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `live-miracles/key-vault` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

`CONTEXT.md` says why the app exists and who uses it. In short: a non-technical media team adds every stream destination here, and bunryu reports each output's live status back. Editor-facing screens must stop wrong links being entered and must show, in plain words, whether each destination is working and what to try if not. Admin screens can stay technical (see `DESIGN.md`, "Who it is for").
