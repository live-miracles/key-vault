# Repository Instructions

## Production link stays private

- Never add the production URL of this app (our own Vercel deployment) anywhere on GitHub: not in the README, docs, issues, pull requests, commit messages or the repository's "Website" (homepage) setting. It is the media team's private link; anyone who clones this repository deploys their own and must not be pointed at ours. Use placeholders such as `https://your-app.vercel.app`.
- Do not add a production link to the live-miracles.github.io project directory either.

## Security

- Read `docs/6-security.md` before changing sign-in, access rules, secrets, database tables or functions, or the headers in `vercel.json`. Its "Rules for changing the code" apply to every change.
- When asked to deploy, set up or review a deployment, walk through its "Before you go live" checklist and report which items you could not check.
- Keep the doc true: when a change alters a control or a limit it describes, update it in the same change.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `live-miracles/key-vault` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

`CONTEXT.md` says why the app exists and who uses it. In short: a non-technical media team adds every stream destination here, and bunryu reports each output's live status back. Editor-facing screens must stop wrong links being entered and must show, in plain words, whether each destination is working and what to try if not. Admin screens can stay technical (see `DESIGN.md`, "Who it is for").
