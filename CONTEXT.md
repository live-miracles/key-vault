# Key Vault

Where the media team gives the streaming team every destination an event is sent to, and where everyone can then see whether each one is really working.

## Why it exists

Before Key Vault, the media team sent destinations and credentials in a Google Sheet. That went wrong in four ways:

- **Wrong thing in the wrong box.** The people filling it in are not technical. They pasted a stream key where the server URL belonged, or the other way round. In the backup column they put the main link, or a server link.
- **No check.** Nobody could tell whether a pasted link was valid until a stream failed on air.
- **Changes were invisible.** During an event a destination's link is often replaced. "We updated it" could not be confirmed: the old link might still be the one configured.
- **No feedback.** When a vendor or channel said they were not receiving the stream, nobody on the media team could see which output was down or why.

Key Vault fixes both ends. The media team adds destinations through a guided form that cleans up and checks what they paste. The streaming team's server, **bunryu**, reports the live status of every output back, and each destination shows it.

## Glossary

- **bunryu**: the streaming server that takes the feed and sends it to each destination (YouTube, Facebook, Instagram, TV channels, and others). It is configured with the links stored here. It is a separate project.
- **Input**: one feed of an event, such as "Hindi" (it used to be called a language). Each stream belongs to one. It is matched to a bunryu pipeline **by name** (ignoring case and spaces), so the two must be spelled the same. The word is the same in the screens, the API and the database (`inputs`, and `input` on a key and a role).
- **Event**: one occasion being streamed. Owns its keys, its roles and its own list of inputs, in its own order. Two events can both have a "Hindi"; they are separate inputs. Admins add, rename, delete and reorder them in the list on the left of the event.
- **Destination** (screen) / **key** (data): one place an input goes live: a platform, a stream key (or an SRT link), an optional backup, a name, a watch link and notes. The screens say "destination" (not "stream", which is also what an input carries); the code, API and database say `key`. A key has a `platform`, a `streamKey` (the whole address for "something else" and SRT), an optional backup (`backupPlatform`, `backupStreamKey`), a `link` (the watch link) and `remarks` (notes).
- **Platform** (`platform` in the code): YouTube (`yt`), Facebook (`fb`), Instagram (`ig`), VdoCipher (`vc`), something else with an `rtmp://` address (`rtmp`), or an SRT link (`srt`). Third parties such as TV channels use "something else" or SRT.
- **Stream key**: the secret part a platform gives out. It is not the address. Putting a key where an address belongs, or an address where a key belongs, was the commonest mistake, so the form takes only the key for the known platforms and cuts a pasted full address down to it.
- **Main / backup**: a destination can have a second, backup link. YouTube sets its backup up itself, Facebook's is fixed, and Instagram has none, so the form hides or locks the box where it does not apply.
- **Status**: what bunryu reports for a key, matched by a hash of its link (see `docs/5-bunryu-contract.md`): running, warning, error, configured but not running, or not configured in bunryu at all. It colors the key's row and nobody sets it by hand. When bunryu has been silent for 3 minutes (`FRESH_MS`) it is off: every key it knew shows as not running, and which keys it knew is remembered from its last report.
- **Not configured**: Key Vault has the link, bunryu has no output with it. This is how you tell an update has not reached bunryu: the key stays "not configured" or keeps its old status until the output with the new link appears.
- **Roles**: `editor` and `viewer`, given per event (see the README). Editors, who are usually the media team, add and fix their destinations. A viewer or editor can be limited to one input. The server decides what each person may do and sends the answer with the data (`docs/adr/0003-the-server-decides-who-may-do-what.md`); the screens never work a permission out.
- **Admin**: not a role. An admin has every event, and does everything: creates, renames, deletes and restores events, reads History and restores versions, manages inputs and who has access, and adds and removes other admins in the Admins dialog (bottom right). Admins are listed once for the whole app, not per event.
- **Owner**: an admin named in the server's `KEY_VAULT_OWNER_EMAILS`. Owners cannot be added or removed in the app. They also open the bunryu settings and read bunryu's technical report.
- **Trash**: a deleted event is kept whole for 30 days (`TRASH_DAYS`), out of sight. An admin brings it back from **History** (bottom right, "Deleted events"). After 30 days it is removed for good, with its stream keys.
- **History**: the log of every change to events, inputs, destinations, people and admins in the last 30 days (`HISTORY_DAYS`): who, when, and the row before and after. Admins only. It is the History button (bottom right) for every event, and the History button on an event's card for that event. It only starts when recording does: nothing before that can be restored.
- **Version**: one event as it was right after one change, like a commit. It is worked out from the log by undoing the newer changes, and shown against the event as it is now with every difference marked. An admin can **restore** a version: the event's name, inputs and their order, and destinations go back to it in one step (who has access is logged but stays as it is), other events are never touched, and the restore is itself a change that can be undone the same way. One row cannot be restored alone.

## Who uses it

- **Media team and other editors**: not technical. They add and update destinations, and later look at the page to see which of theirs are live. Everything they see is in plain words.
- **Streaming team (owners and admins)**: technical. They configure bunryu, manage who has access, and read status for the whole event. Only owners also see bunryu's own technical report when hovering a card; admins get the same plain-words note as editors.

## What the page must answer

For every destination, during an event, without asking anyone:

1. **Is it set up?** Is this link in bunryu, and is it the new link or the old one?
2. **Is it working?** Green when the output is live.
3. **If not, whose problem is it?** bunryu also reports each input's signal. If an output is red and its input is not arriving, the platform is not the problem and nobody needs to chase the vendor. A link that runs in a different pipeline than its stream's input is flagged "Check input".
4. **If not, what do I do?** A red or amber row says, in plain words, what is probably wrong and what to try ("Could not connect. Check that the stream key is right and the stream is started on the platform."), not the encoder's own error text. When the fix is outside Key Vault, say who to ask ("Ask the channel for a new stream key").

## Rules that follow

- Editor screens never show FFmpeg or other raw output. bunryu's redacted message is only the hover detail for owners and admins.
- The advice on a failing stream is written in Key Vault for the media team (`ADVICE_PATTERNS` in `status-wording.ts`), not taken from bunryu: bunryu's own hints are for the streaming team. An unknown error gets one generic line; the technical text is never shown to editors.
- A status is only ever derived from bunryu's report. No manual color (`docs/adr/0002-a-status-is-never-set-by-hand.md`).
- The rules for where a destination can go are one module used by the form and the server, so a wrong link cannot be stored by anything that skips the form (`docs/adr/0001-platform-rules-live-in-one-shared-module.md`).
- Row ids are random UUIDs made by the database; nobody types or checks one.
- Stream keys are secrets: a key never goes to bunryu's heartbeat or into a URL, and only hashes cross from bunryu to Key Vault.
