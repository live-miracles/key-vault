# 2. A destination's status is never set by hand

Status: accepted (2026-11-18)

## Context

The first plan for the bunryu link kept a manual colour as an optional override (owners and admins, a `color_override` column). `CONTEXT.md`, `DESIGN.md` and the README later said there was no manual colour, but the column, the server checks, the form code and tests stayed behind, and the plan still listed the override as a decision.

## Decision

There is no manual colour or status. A status is only ever derived from bunryu's report. The column, the codes (`'1'`, `'3'`, `'6'`, which were spreadsheet cell colours) and the permission to set one are gone.

## Consequences

- The only way a destination turns green is bunryu running its output.
- A destination whose link changes simply stays "not set up yet" or keeps its old status until bunryu has the new link, which is the signal the media team needs.
- Do not add an override. If a status looks wrong, fix what bunryu reports.
