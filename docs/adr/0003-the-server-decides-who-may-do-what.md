# 3. The server decides who may do what, and tells the browser

Status: accepted (2026-11-18)

## Context

The role rules (who may create or change events, inputs, roles and destinations) existed twice: in the browser, to hide buttons, and as a line-for-line port on the server, to enforce them. A test compared the two. The rules were written for a spreadsheet: roles were the strings `'0'` to `'3'`, `'*'` meant "every event" and "every input", and an owner anywhere was pushed into a pseudo-event.

## Decision

`supabase/functions/_shared/access.ts` is the only place the rules live. `getAllData` sends the result with the data: `can` flags on each event, `canChange` on roles and destinations, `canAddKeys` on inputs, `canCreateEvents`, `canRestoreEvents`, `canManageAdmins` and `everyEvent` (who has every event, for Share to list) for the app. The screens show or hide what they are told and work nothing out. Roles are the strings `viewer` and `editor`; a role covers every input when its input is null.

## Consequences

- There is no parity test and no browser copy of the rules.
- A new permission is a new flag on what the server sends.
- Admin is not a role. An admin has every event, and is in the `app_admins` table, which any admin adds to and removes from. An owner is an admin named in `KEY_VAULT_OWNER_EMAILS` (fixed, no row), who also opens the bunryu settings and reads bunryu's technical report. Migration `20261118200000_global_admins.sql` moved everyone who was an admin or an owner of an event into `app_admins`, which widens each of them from their events to every event.
