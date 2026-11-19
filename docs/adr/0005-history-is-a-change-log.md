# 5. History is a change log, and a restore goes back to a whole version

Status: accepted (2026-11-19)

## Context

Admins need to see who changed what and to put an event back the way it was after a mistake, like version history in a Google Sheet. Before this, a destination kept only its last editor (`updated_by`), a deleted destination left no trace, and an event could only be recovered whole from the trash.

## Decision

- **A log of changes, not snapshots.** The `changes` table has one row per row that was added, edited or deleted: who, when, and the row before and after as JSON. Any earlier version of an event is worked out by starting from the event as it is and undoing every newer change, newest first (`stateAt` in `history.ts`). Daily snapshots would miss a change made and fixed within a day, and say nothing about who made it. Changes are kept `HISTORY_DAYS` (30), as long as the trash, so a deleted event and its history go together.
- **Restore a whole version, not single changes.** A version is the event right after one change, like a commit. A restore makes the event equal to it: name, inputs and their order, destinations and people, with their original ids. Undoing one change in the middle is not offered, because later changes may depend on it. Other events are never touched.
- **Recorded in `operations.ts`, not by triggers.** The API writes with the service role, so a trigger cannot know who made the change; a trigger would give the demo's memory store no history (ADR 4); and every operation already loads the old row. The cost is that an ordinary change and its record are two calls, so a failure between them loses the record (it is logged, and the change stands).
- **A restore is one transaction and is itself recorded.** `apply_event_version` writes the rows and the record together: all of it or none. Its rows share a `batch`, so it is one entry in the timeline, and it is a version like any other, so it can be undone by restoring the version before it. The steps run in an order that lets two inputs swap names (the unique index is not deferrable): inputs under a temporary name, then destinations and people, then the deletes, then the real names.
- **The soft delete stays.** `events.deleted_at`, `trashEvent` and `restoreEvent` already work and keep the original ids. Deleting records `deleted`, bringing back records `restored`, and the History dialog's "Deleted events" filter replaces the trash dialog. Such a change has no rows of its own to undo (its rows never moved), so versions skip it.
- **Admins only.** History holds old stream keys, which admins can already see, so nothing is hidden on the server. The browser shows keys as dots until asked.

## How the implementation differs from the first plan

- **`getTrash` stays.** The first plan removed it. The "Deleted events" filter still reads it: an event deleted before recording began has no change to show, and a lost record would otherwise leave an event nobody can bring back. The change log only adds the "deleted" and "restored" lines.
- **A restore is checked only where it writes.** The rules in `platforms.ts` may have changed since a version was current, so the rows a restore writes are checked again (name, platform, address, clashes against the rest of that version, input names, emails). A row it leaves alone is not, so an unrelated old row cannot block a restore.
- **The steps are one object** (`VersionSteps`: what to write and what to delete, per table), not a list, so the SQL function can apply them in its fixed order.
- **`getHistory` takes a `kind`** so the Admins filter pages correctly, and returns `restoredToAt` so a restore can say "to 18 Nov, 3:42 pm" even when that change is not on the page.
- **A version is "right after an operation".** A reorder is one change per input that moved, recorded together, so the screens group the rows of one request (same `batch`, or same person, moment and event) and the version of a line is its last row. A half-done reorder is never offered.
- **A restored destination is stamped** as added or edited by whoever restored it, since its old "last edited by" would be misleading.

## Consequences

- History starts when recording starts. Nothing before that can be restored, and an event cannot be restored to before it was created ("did not exist yet"): delete it instead.
- A restored destination is put back under its own id, so links in the log and anything that pointed at it still work. It sorts after the others of its input, since its creation time is new.
- Do not add triggers to fill the log, and do not let the browser decide what a version contains: the server works it out (`compareEvent`) and checks it again when restoring (`restoreEventVersion`).
- Restoring one row on its own is out of scope. An admin who wants one destination back copies it by hand from the compare view.
