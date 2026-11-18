# 3. The server decides who may do what, and tells the browser

Status: accepted (2026-11-18)

## Context

The role rules (who may create or change events, inputs, roles and destinations) existed twice: in the browser, to hide buttons, and as a line-for-line port on the server, to enforce them. A test compared the two. The rules were written for a spreadsheet: roles were the strings `'0'` to `'3'`, `'*'` meant "every event" and "every input", and an owner anywhere was pushed into a pseudo-event.

## Decision

`supabase/functions/_shared/access.ts` is the only place the rules live. `getAllData` sends the result with the data: `can` flags on each event, `canChange` on roles and destinations, `canAddKeys` on inputs, `canCreateEvents` for the app. The screens show or hide what they are told and work nothing out. Roles are the strings `viewer`, `editor`, `admin`, `owner`; a role covers every input when its input is null.

## Consequences

- There is no parity test and no browser copy of the rules.
- A new permission is a new flag on what the server sends.
- An owner anywhere is an owner of every event, and so is anyone in `KEY_VAULT_OWNER_EMAILS`; that behaviour is deliberate and unchanged.
