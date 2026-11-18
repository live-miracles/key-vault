# 4. The demo runs the real operations on an in-memory store

Status: accepted (2026-11-18)

## Context

The demo site had its own mock of every operation, written to imitate the Apps Script calls. It had already drifted from the server (it returned inputs the user could not see) and held code from an unrelated app.

## Decision

The demo runs `operations.ts` in the browser against the in-memory `Store` (`memory-store.ts`) that the tests also use, with seed data in its own module. Postgres and the in-memory store are the two adapters of the `Store` seam.

## Consequences

- Demo and server cannot disagree about a rule, and the demo shows real validation messages and permissions.
- The seed data is also a test fixture, including status rows made by really hashing the demo destinations.
- Do not write operation logic for the demo. If the demo needs something, it belongs in the operation or the store.
