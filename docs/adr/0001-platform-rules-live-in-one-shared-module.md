# 1. Platform rules live in one module shared by the browser and the server

Status: accepted (2026-11-18)

## Context

The rules for where a destination can go (the platforms, how a platform and a stream key become an address, what a pasted key must look like, which platforms have a backup) were written in the browser form. The server had a hand-written mirror of the address builder so it could hash addresses, and checked nothing else, so anything that skipped the form could store a wrong link. That is the failure Key Vault exists to stop.

## Decision

`supabase/functions/_shared/platforms.ts` owns every platform rule. It is plain TypeScript with no dependencies, imported by the form and by the `addKey`/`editKey` operations. The server rejects a destination the form would have rejected, and the address it hashes is built by the same function the form shows.

## Consequences

- A rule changes in one place; there is no mirror test to keep two copies equal.
- The backup of a destination is derived from its platform: YouTube's is the same key on YouTube's backup address and is never stored, Instagram has none, Facebook's is always Facebook with its own key. Only the other platforms store a backup.
- The browser form keeps only the words it shows (platform guides, notes).
- Do not copy these rules back into the frontend or into another function.
