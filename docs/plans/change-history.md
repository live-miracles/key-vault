# Plan: change history and restoring an event to an earlier version (admins only)

Status: implemented (2026-11-19). The decisions and design below are as agreed; where the
implementation differs, `docs/adr/0005-history-is-a-change-log.md` says how and why.

## Goal

Like version history in Google Sheets, or checking out a commit in git, for each event:

- Admins can see every change of the last 30 days: who, when, what.
- They pick a point in an event's timeline and see the whole event as it was right after that
  change, with every difference from now marked. This is the net effect of all the changes made
  since.
- They restore the whole event to that point. Everything in that event goes back to how it was
  then: name, inputs and their order, destinations and people. Other events are never touched.

Restoring one row and keeping the rest is out of scope. An admin who wants only one thing back
can copy it by hand from the compare view.

Editors and viewers see nothing new.

What is recorded: destinations (keys) most of all, plus inputs, people (roles), events (added,
renamed, deleted, restored) and the admin list. Expected volume: a few thousand changes a month.

## Decisions already made

1. **A change log, not snapshots.** One row per changed row, with who, when, and the row before
   and after as JSON. Any earlier version of an event is computed from it: start from the event
   as it is now and undo every newer change, newest first. Daily snapshots were rejected
   because they miss a change made and fixed within a day, and do not say who made it.
2. **Restore a whole version, not single changes.** Each change in an event's timeline is a
   version: the event as it was right after that change, like a commit. A restore makes the
   event equal to that version. Undoing one change in the middle is not offered, because later
   changes may depend on it.
3. **One history for all events; restore is per event.** The History dialog lists changes in
   every event, including deleted ones and admin changes. Compare and Restore always work on a
   single event.
4. **Admins only** (owners included). History holds old stream keys, which admins can already
   see, so nothing is masked on the server. The browser hides key values until clicked.
5. **Kept 30 days**, then deleted, like the trash. The timeline begins when recording starts.
   Nothing before that can be restored.
6. **Recorded in `operations.ts`, not in database triggers.**
    - The API writes with the service role, so a trigger cannot know who made the change.
    - With triggers, the demo's memory store would get no history (ADR 0004: the demo runs the
      real operations).
    - Each operation already loads the old row, so "before" costs nothing.
7. **A restore is one transaction and is itself recorded.** It applies completely or not at
   all. It appears in the timeline as one entry ("Asha restored Winter Event to 18 Nov 18:05"),
   which is itself a version, so it can be reverted the same way.
8. **The trash keeps its storage, loses its own dialog.** See "The trash" below.

## The trash

Keep the soft delete (`events.deleted_at`, `deleted_by`, `trashEvent`, `restoreEvent`,
`purgeTrash`). It already works and is tested, it keeps the original ids, and bringing a whole
event back is one update. Rebuilding it on the change log would need a migration for the events
already in the trash, and nobody would see a difference.

What changes:

- Deleting an event records a change (`kind: 'event'`, `action: 'deleted'`). Bringing it back
  from the trash records `action: 'restored'`.
- The **Trash** button and dialog (`frontend/src/trash.ts`, `#trash-modal`, `#trash-btn`) are
  replaced by the **History** dialog.
    - Its "Deleted events" filter shows what the trash showed.
    - Each deleted event's entry has **Bring back event**, which calls the existing `restoreEvent`
      operation.
    - Once the event is back, its timeline and version restore work as usual.
- `getTrash` can be removed once the dialog no longer uses it. Only the frontend calls it.
- `TRASH_DAYS = HISTORY_DAYS` (one constant, 30), so a deleted event and its history disappear
  together.
- Compare and version restore are refused for an event in the trash: "Bring the event back
  first."

## Data

New migration `supabase/migrations/20261119000000_changes.sql`, in the style of the existing
ones: a comment at the top, RLS on with no policy, and revoke from anon and authenticated.

```sql
create table public.changes (
  id bigint generated always as identity primary key,  -- also the order of changes
  at timestamptz not null default now(),
  by text not null,                       -- email of whoever did it
  event_id uuid,                          -- no foreign key: history outlives the row. null for admins
  kind text not null check (kind in ('event', 'input', 'key', 'role', 'admin')),
  row_id uuid not null,                   -- id of the event / input / key / role / admin
  action text not null check (action in ('added', 'edited', 'deleted', 'restored')),
  before jsonb,                           -- null when added
  after jsonb,                            -- null when deleted
  batch uuid,                             -- same value for every row of one version restore
  restored_to bigint                      -- for a version restore: the change it went back to
);
create index changes_event_id_idx on public.changes (event_id, id desc);
create index changes_at_idx on public.changes (at);
```

- `before` and `after` hold the row in the shape of `types.ts` (`KeyRow`, `RoleRow`, `InputRow`,
  `EventRow`, `AdminRow`), in camelCase, so the code reads them without mapping.
- For an event deleted or brought back from the trash, store `{ name, destinations, inputs }`.
  The rows themselves stay in their tables.
- Input order: record `reorderInputs` as one `kind: 'input'` change for each input whose
  `position` changed. The order is then part of a version and comes back with it.

Extend `test/migrations-db-check.mjs` for the new table.

## Server

### `types.ts`

- `export const HISTORY_DAYS = 30;` and `TRASH_DAYS = HISTORY_DAYS`.
- `ChangeRow`: `{ id: number; at: string; by: string; event: string | null; kind; rowId; action; before; after; batch: string | null; restoredTo: number | null }`.
- `ChangeView extends ChangeRow`, adding:
    - `eventName`: the current name, or the last one known;
    - `rowName`: the destination, input or event name, or the person's email, taken from
      `after ?? before`.
- `EventState`: `{ event: EventRow; inputs: InputRow[]; keys: KeyRow[]; roles: RoleRow[] }`.
- `RowDiff`: `{ kind: 'event' | 'input' | 'key' | 'role'; rowId; status: 'added' | 'deleted' | 'changed'; then: row | null; now: row | null; fields: string[] }`.
    - `status` is relative to now: `added` means added since then, so a restore removes it.
    - `fields` lists the fields that changed.
- `AppData.canSeeHistory: boolean`, true for admins and owners.

### Operations

All of these are for admins only, checked with a new `access.canSeeHistory()`.

- `getHistory({ event?, before?, limit? }) → ChangeView[]`
    - Newest first, paged by id: `before` is the smallest id already shown. Default limit 200.
    - Without `event`, it returns every event plus admin changes.
    - The rows of one restore share a `batch`, so the browser can fold them into one entry.
- `compareEvent({ event, atChange }) → { then: EventState; diff: RowDiff[] }`
    - Returns the event as it was right after change `atChange` (this event's later changes
      undone) and its differences from now.
    - `atChange: 0` means "start of history": the event as it was before its oldest recorded
      change.
    - The change must belong to this event and be within 30 days.
- `restoreEventVersion({ event, atChange }) → { changed: number }`
    - Recomputes `then` on the server, validates it, makes the event equal to it in one
      transaction, and records that as one batch.
    - If `then` already equals now, it does nothing and says so.

### A new pure module: `supabase/functions/_shared/history.ts`

Unit-test it on its own, with no store.

- `stateAt(now: EventState, changes: ChangeRow[], atChange: number): EventState`
    - Walk this event's changes with `id > atChange`, newest first.
    - `added`: remove the row. `edited`, `deleted` or `restored`: put `before` back.
    - Event `deleted`/`restored` entries do not apply here, because compare is refused while the
      event is in the trash.
    - `stateAt` works when the event itself was added after `atChange`: the result is an empty
      event. Refuse to restore to a point before the event existed ("This event did not exist
      yet"). Deleting the event is done with Delete.
- `diffStates(then, now): RowDiff[]`
    - Match rows by id across inputs, keys and roles, and compare the event's name.
    - Ignore `updatedBy`, `updatedAction` and `updatedAt` when deciding whether a key changed.
- `restoreSteps(then, now)`: the upserts and deletes that turn now into then. See the order
  under "Store".

### Validation

`then` was valid when it was current, but check it again, because the rules in
`platforms.ts` may have changed since. Reuse the existing checks on the whole `then` event:

- `destinationNameProblem`, `destinationProblem` and `findClash` for every key against the
  other keys;
- input names unique within the event;
- role emails valid.

If anything fails, refuse the restore with the list of problems and change nothing.

### Store (both `supabase-store.ts` and `memory-store.ts`)

- `recordChanges(changes: Omit<ChangeRow, 'id' | 'at'>[], at: string): Promise<void>`
- `loadChanges(filter: { event?: string; before?: number; after?: number; limit?: number }): Promise<ChangeRow[]>`
- `purgeChanges(before: string): Promise<void>`
- `applyEventVersion(event: string, steps: Step[], changes: Omit<ChangeRow, 'id' | 'at'>[], at: string): Promise<void>`
  writes the rows and records the changes in one transaction.
    - A step upserts or deletes an event, input, key or role, using its original id, so history
      keeps pointing at the same rows.
    - Supabase: a new RPC `apply_event_version(p_event uuid, p_steps jsonb, p_changes jsonb)` in
      the migration, granted to `service_role` only.
    - Steps run in this order:
        1. Upsert inputs, giving changed ones a temporary unique name first.
           `inputs_event_name_idx` is not deferrable, and two inputs may have swapped names.
        2. Upsert keys and roles.
        3. Delete keys and roles.
        4. Delete inputs.
        5. Set the final input names and positions.
        6. Update the event name.
    - Memory store: the same steps on its arrays, keeping the rules it already follows
      (cascading deletes, and an input that is still in use cannot be deleted).

### Recording ordinary changes, in `operations.ts`

Every write operation calls this helper after its store write succeeds:

```ts
async function record(store, ctx, changes) {
    try {
        await store.recordChanges(
            changes.map((c) => ({ ...c, by: ctx.email })),
            new Date(ctx.nowMs).toISOString(),
        );
    } catch (error) {
        console.error('Could not record the change:', error); // the change itself stands
    }
}
```

- Wire it into `addEvent`, `editEvent`, `deleteEvent`, `restoreEvent`, `addAdmin`,
  `removeAdmin`, `addRole`, `editRole`, `deleteRole`, `addInput`, `editInput`, `reorderInputs`,
  `deleteInput`, `addKey`, `editKey` and `deleteKey`.
- "Before" is the row from `load()`; "after" is what was written.
- Skip an edit that changed nothing.

Known gap: an ordinary change and its record are two calls, so a failure between them loses the
record. That is acceptable for now. A version restore does not have this gap, because its
transaction includes the record.

Purge: in `getAllData`, next to `purgeTrash`, call `purgeChanges(now - HISTORY_DAYS)` inside the
same try/catch.

## Frontend

These are admin screens, so wording can be technical but must be clear (`DESIGN.md`, "Who it is
for"). Follow the existing patterns:

- `actions.ts` for calls;
- `api-client.ts` (add the new operations to its list);
- `main.ts` for `data-action` handlers;
- `index.html` for dialogs;
- `html.ts` for icons.

### 1. History dialog for all events

`frontend/src/history.ts` replaces `trash.ts`, and the Trash button at the bottom right becomes
History.

- Filter: All events, one event, Deleted events, Admins.
- Changes are grouped by day ("Today", "Yesterday", "Tue 18 Nov").
- Changes by the same person to the same event within 10 minutes fold into one line ("Priya
  changed 4 destinations in Winter Event"), which opens to show each change.
- Each line says what happened in plain words, for example "Ravi deleted Instagram English" or
  "Priya changed the stream key of YouTube Hindi".
- A version restore is one line: "Asha restored Winter Event to 18 Nov 18:05".
- Clicking any change in a live event opens the compare view of that event at that change.
- Deleted events show **Bring back event** and how many days are left.
- **Load older** at the bottom pages by id.

### 2. History button on each event

In the event header, next to Share and Rename, shown when `canSeeHistory`. It opens the compare
view at the newest change.

### 3. Compare view

This is the Google Sheets "version history" screen. It replaces the event's main area until it
is closed.

- **Right side, the timeline:**
    - this event's changes, newest first, grouped and folded as in the History dialog;
    - "Now" at the top and "Start of history (date)" at the bottom;
    - the selected version highlighted.
- **Top bar:**
    - what is shown, for example "Version after Ravi deleted Instagram English · Tue 18 Nov
      18:05";
    - a summary of what changed since then, for example "2 added, 1 deleted, 3 changed since";
    - the buttons **Restore this version** and **Close**.
- **Main area:** the event's normal cards and table, read only.
    - Render it from `then` with the existing renderers, with every `canChange` false.
    - "Only show differences" is a toggle, on by default for big events.
    - A row added since is marked "added since".
    - A row deleted since is shown faded with "deleted since".
    - A changed row highlights its changed fields and shows the current value next to the old
      one.
    - Stream keys are shown as dots with a reveal button.
- **Confirm before restoring:** "Restore Winter Event to how it was on Tue 18 Nov 18:05? 2
  destinations will be removed, 1 brought back and 3 changed. You can undo this from History."
- **If the server refuses,** show its list of problems.
- **After a restore,** reload the data and show the new restore entry at the top of the
  timeline.

## Docs to update

- `CONTEXT.md`: add **History** and **Version** to the glossary. Change **Trash** to say that
  deleted events are brought back from History.
- `docs/1-user-guide.md` and `README.md`: replace the "Deleted events (bin)" text with History.
- New ADR `docs/adr/0005-history-is-a-change-log.md`, recording:
    - a log rather than snapshots;
    - restoring whole versions rather than single changes;
    - recording in operations rather than triggers;
    - a restore being one transaction;
    - the soft delete being kept.

## Tests

- `history.ts`:
    - `stateAt` for add, edit and delete sequences of each kind, input order, an event rename,
      and `atChange: 0`;
    - `diffStates` ignoring the `updated*` fields;
    - `restoreSteps` swapping two input names.
- `test/operations.test.mjs`:
    - each write records the right before and after, and reorder records positions;
    - non-admins are denied `getHistory`, `compareEvent` and `restoreEventVersion`;
    - a restore makes the event equal to `then`, including a destination deleted since and one
      added since;
    - a restore never touches another event;
    - a restore that fails validation is refused and changes nothing;
    - a restore is recorded as one batch, and restoring to the version before it reverts it;
    - compare is refused for an event in the trash, for a change of another event, and for a
      change older than 30 days;
    - old changes are purged;
    - a recording failure does not fail the operation.
- `test/actions.test.mjs` and `test/demo.test.mjs`: the trash tests move to History. Seed some
  history in `frontend/src/demo/demo-data.ts` so the demo shows a timeline.
- `test/migrations-db-check.mjs`:
    - the table exists and RLS blocks anon;
    - `apply_event_version` rolls back fully when one step fails;
    - two inputs can swap names.

## Order of work

1. **Recording.** Migration, types, the recording Store methods in both stores, `record()`
   wired into every write, purge, `getHistory`, tests. Ship this first even with no UI: history
   only exists from the day recording starts.
2. **History dialog.** It replaces the Trash dialog, read only, with Bring back event for
   deleted events. Update the docs.
3. **Compare.** `history.ts` (`stateAt`, `diffStates`), `compareEvent`, and the read-only
   compare view with the timeline and differences.
4. **Restore.** Validation, `restoreSteps`, `apply_event_version`, `restoreEventVersion`, and
   the Restore button. Write the ADR.
