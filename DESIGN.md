# Key Vault design

The visual language of Key Vault. It is adapted from the Linear analysis in
[awesome-design-md](https://github.com/VoltAgent/awesome-design-md) (`design-md/linear.app`): a near-black canvas, hairline borders, one indigo accent, tight radii. The tokens live in `frontend/input.css` (`@theme`); change them there, not in templates.

## Where it differs from Linear

- **Density.** This is a control-room tool used on a phone as often as a desktop, so controls are compact (32 px buttons, 36 px inputs) and rows are tight.
- **Status colors.** Linear has one chromatic accent. Key Vault shows stream status, so it adds four, used only for that and for errors.
- **Waves.** A seigaiha (blue ocean wave) pattern sits behind the page. It is decoration and is never allowed to reduce legibility.
- **System fonts.** Inter is first in the stack but not downloaded: the app must load fast on a venue network.

## Colors

| Token                      | Value                 | Use                                    |
| -------------------------- | --------------------- | -------------------------------------- |
| `base-100`                 | `#010102`             | Canvas                                 |
| `base-200`                 | `#0f1011`             | Surface: table, cards, menus, inputs   |
| `surface-2` / `surface-3`  | `#141516` / `#1b1c1e` | Dialogs, tab bar / hover and selected  |
| `base-300`                 | `#23252a`             | Hairline borders, inset panels         |
| `hairline-strong`          | `#34343a`             | Control borders                        |
| `base-content`             | `#f7f8f8`             | Text                                   |
| `ink-muted` / `ink-subtle` | `#d0d6e0` / `#8a8f98` | Secondary text, column headers         |
| `primary`                  | `#5e6ad2`             | Primary buttons, focus border          |
| `accent`                   | `#828fff`             | Accent text and icons, configured tint |

Status (the color of a key row and card, from bunryu's heartbeat):

| Status                           | Token               | Tint class        |
| -------------------------------- | ------------------- | ----------------- |
| Running                          | `success` `#4cb782` | `tint-running`    |
| Warning                          | `warning` `#e5a23c` | `tint-warning`    |
| Error, or stopped after failures | `error` `#f0616d`   | `tint-error`      |
| Configured, not running          | `accent`            | `tint-configured` |
| Not configured in bunryu         | none                | none              |

Tints are **opaque** (mixed over `base-200`), so the waves can never show through a row. Only bunryu's report colors a row; there is no manual color.

## Light theme

Dark is the default. A sun / moon button in the app controls (`#theme-btn`, beside Refresh) switches to light and back, and the last choice is kept in `localStorage` under `key-vault-theme` (`theme.ts`). The theme is the `data-theme` attribute on `<html>`; a few lines in the page `<head>` apply a saved "light" before the first paint so it never flashes dark. A person who has never chosen gets dark, whatever the operating system prefers. `theme.ts` also keeps `<meta name="theme-color">` in step (the manifest stays dark, since it is read before any choice).

Linear ships no light theme, so the values are Key Vault's own, in the same family: a cool near-white canvas, white surfaces, hairlines in cool grey, and the same indigo. They are overrides of the same token names under `:root[data-theme='light']` in `frontend/input.css`, so no template knows which theme is on. Rules:

| Token                          | Light                         | Note                                                                                         |
| ------------------------------ | ----------------------------- | -------------------------------------------------------------------------------------------- |
| `base-100` / `base-200`        | `#f4f5f7` / `#ffffff`         | Canvas / surfaces (cards, dialogs, inputs)                                                   |
| `surface-3`                    | `#eceef2`                     | Hover and selected                                                                           |
| `base-300` / `hairline-strong` | `#e3e5ea` / `#cdd1d9`         | Hairlines / control borders                                                                  |
| `base-content`                 | `#16181d`                     | Text                                                                                         |
| `ink-muted` / `ink-subtle`     | `#3f4450` / `#5f6573`         | Secondary text, column headers (both pass 4.5:1 on white)                                    |
| `primary` / `accent`           | `#5e6ad2` / `#4a56bd`         | Buttons (white text) / accent text and icons, darker than in dark mode so they read on white |
| `success` `warning` `error`    | `#17794d` `#9a5b06` `#c9303e` | Darker than in dark mode, so status text reads on a tinted card                              |

- Status tints stay **opaque** and are gentler (`--tint-soft`, `--tint-strong`, `--pill-soft`, `--pill-strong` hold the percentages per theme), so the red note on a red card keeps its contrast.
- The waves stay a watermark: `--wave-fill` is the canvas, `--wave-line` only slightly darker.
- Anything that is an image or a shadow cannot read a text color, so it has a variable (`--backdrop`, `--shadow-dialog`) or a light twin (the select's arrow). New components must use tokens, never a hex value, to work in both themes. Platform brand tiles (YouTube red, Facebook blue) are the same in both.

## Shape and type

- Radii: 6 px menu items and tabs, 8 px controls (`--radius-field`), 12 px cards and dialogs (`--radius-box`).
- Type: 14 px body, 13 px small controls, 12 px labels and column headers. Weights 400, 500 and 600 only.
- Focus: a 2 px `primary-hover` outline on `:focus-visible`; fields also get a 3 px translucent `primary` ring.

## Layout

- **Event view** is the landing page (the first event; there is no separate overview page). It uses bunryu's list-and-detail layout: on the left the event's own card (its name, rename and delete, Add destination, Share) above its input list (`All` first, which counts every destination of the event by state, then the event's inputs in its own order, each with status counts, and a `+` for its admins to add one; they also rename, delete and drag to reorder there; the pen and bin show only when the pointer is over an input, and the bin asks for confirmation; the server refuses an input still in use, in plain words). The selected input's destinations are on the right as a grid of cards (`.dest-card`; one column on a phone, more as the window widens; a card is never narrower than 21 rem, the least its links and buttons need to fit on one line, and on a very narrow phone the buttons wrap under the links instead of running out of the card), each starting with its status label, then the name and actions, what the status means, and one line of links: `Main` and `Backup` as plain words, each with a status dot before it (the input dot's colors: green running, amber unstable, red problem, grey off, not set up or not started yet; `describeSide` in `status-wording.ts`; hover the dot for its words, hover the word for the address; no dot without a fresh report or where there is no such link), and a copy button right after and a `Watch` button that opens the watch link in a new tab. The addresses themselves are never printed on a card. A link another destination of the event also uses turns its word red and adds an amber warning line on the card (`describeLinkClashes` in `search.ts`): "Main link is also used by “Channel 3” (Hindi). Each destination needs its own link." It checks the whole event, so a filter never hides a clash. One item is always chosen: the input in the URL, else `All`. Under `All` the cards are split into one section per input, in input order, each with a heading (status dot, input name, status counts, total) and, when that input is in trouble, its banner; an input with no destinations has no section. There is no table. Below 768 px the list becomes a row of chips above the cards. The choice is kept in the `input` URL parameter (none means `All`).
- **App controls.** There is no header. Refresh, bunryu's state (dot and text; owners click it for bunryu settings) and the account button (`#app-controls`) sit at the right of the bottom bar beside the event tabs. The account button opens a small menu with the signed-in email and Sign out (always shown; in the demo, which has no sign-in, it does nothing); any click elsewhere or Escape closes it. Up to 640 px wide the bottom bar is only the event tabs, so `placeAppControls` in `controls.ts` moves the controls into a slim bar at the top, where the menu opens downward and bunryu's state shows as its dot only.
- **Search.** A box above the cards (`#destination-search`, shown once the event has a destination) filters by anything a destination holds: name, input, notes, watch link, and the platform, stream key and full address of the main and the backup; every word typed must match, so pasting a stream key finds who uses it. It looks through the whole event, not just the chosen input, so a destination is found without knowing its input: while it is in use the results are grouped into input sections as under `All`, the input banner is hidden, and a line under the box says how many matched. Escape or the cross clears it, and it is cleared when another event is opened.
- Status counts use the `status-pill` classes, which share the status colors above.

## Waves

- An inline SVG (`.wave-bg` in `frontend/index.html`) fixed behind the page, tiled from a 96 × 48 seigaiha pattern: scales of radius 48, rows half a scale apart, each row covering the one before.
- Cells are filled with the canvas color and outlined in `--wave-line`; they must stay opaque, because that is what hides the lower half of each scale.
- A mask fades the layer from the bottom (visible) to 62% of the height (gone), so cards and forms sit on calm canvas.
- No animation. Keep contrast at the level of a watermark: `--wave-line` is only slightly lighter than the canvas.

## Who it is for

Two audiences, two standards:

- **People who add and edit destinations** (editors, and anyone adding a key) may never have seen a stream key. Their screens (the Add a destination form, the cards, the input picker) use plain words, say what to do next, and explain errors in terms of the fix. No jargon without a one-line explanation.
- **Owners and admins** (sharing, event settings, bunryu settings) are technical and keep the compact, terse style.

Why the editors matter: the media team used to send links in a Google Sheet and often put a stream key where an address belonged, or the main link in the backup box. The form exists to make that mistake impossible, and the status colors exist so they can see for themselves whether an update reached bunryu and whether each output is live. See `CONTEXT.md`.

## Status feedback

A row's color is only half the message. For an editor, a red or amber row must also say **what is probably wrong and what to try**, in plain words:

- The advice is Key Vault's own (`ADVICE_PATTERNS` in `status-wording.ts`), because bunryu's hints are for the streaming team. Say what to check in terms of the key and the platform, and who to tell. Never show FFmpeg or other encoder text: a Copy button on the note puts the technical details (stream name, pipeline, bunryu's redacted message) on the clipboard instead, to paste to the streaming team.
- An error note is red with a cross icon, a warning note amber with a triangle, so trouble never reads as plain text (`keyNoteTextHtml`).
- Only trouble (red or amber) is written out on the card. Calm states (Live, Not set up yet, Not sending) put their explanation in the status label's hover text, so cards stay short. A label with hover text, the same for everyone, carries a small "i" and a help cursor so people know there is more to read. A trouble label has neither, since the card already says it.
- Show trouble on the card itself (`.dest-card`: the status label first, then the words under the name). A hover title does not exist on a phone, so it can only be extra.
- Hovering a row gives owners and admins bunryu's own (redacted) report; everyone else gets the note.
- **Inputs.** A dot before each input in the list says whether its signal is arriving (`INPUT_LABELS` in `status-wording.ts`). An input in trouble gets a banner above its streams, and a failing stream under it says the platform is probably not the cause. A link in the wrong input is "Check input" and is said first, even when the stream runs. This depends on the input and pipeline having the same name.
- "Not set up yet" means bunryu does not have this link. Say so; it is how an editor learns an update has not landed. Say nothing at all while bunryu is offline: it only runs during events.

## Who changed what

Each destination records who last **added** or **edited** it and when (`updated_by`, `updated_action`, `updated_at` on `keys`). The API writes them from the signed-in email and the server's clock on every add and edit (`lastEdit` in `operations.ts`); the browser cannot set them. A card does not print it: a small info icon in the card head (`renderLastEdit` in `cards.ts`) shows it on hover, as "Edited by ann@example.org, 18 Nov, 3:42 pm". Destinations made before this was recorded show nothing. That stamp is only the last change. The full history (who changed what, and earlier versions of the event) is the admin-only **History**, below; editors and viewers do not see it. Everyone who can see a destination sees the email.

## History

Admin screens, so the wording is technical but clear. Two views over one log of changes (`changes` table; `history.ts` works a version out; see ADR 5):

- **History dialog** (`history.ts`, the clock button at the bottom right; `history-format.ts` has the words and grouping). A filter (all events, one event, deleted events, admins) over rows grouped under a heading for each day ("Today", "Yesterday", "Tue 17 Nov"). One row is one request: a person's initial in the avatar, their name (the part of the email before the @, the full address on hover), what they did in plain words, and the time. A change in an event that still exists is a button that opens that event's compare view; a change in a deleted event or to the admins is only text. Several changes by one person in one event within ten minutes fold into one row that opens to show each; a version restore is always a row of its own. "Deleted events" is the old trash list, with **Bring back event**. **Load older** pages by change id.
- **Compare view** (`compare.ts`; the clock icon in the event card). It takes the place of the event's main area, and Close brings it back. A bar says whose change the version is after and what has changed since ("2 added, 1 deleted, 3 changed since"), with **Restore this version**. The version's destinations are the normal cards (`renderCard`) with no buttons and no bunryu colours, since how an output was doing then is not known. Marked: `Added since` (dashed), `Deleted since` (faded), `Changed since` with a list of the fields, old value beside the current one. An input or event name that changed says "now ...". Stream keys are dots with an eye button. **Only show differences** is on by default once a version has more than eight destinations. The timeline is on the right (under the bar on a phone): "Now", then the event's changes by day, then "Start of history", unless the event was created inside the history.
- A restore asks first, saying what will change, and its refusal (a rule has changed since) is shown in the view itself as a list, because a toast disappears too soon to read one.

## Add a destination

A guided form in four steps, numbered by CSS counters so a hidden step never leaves a gap:

1. **Where are you streaming to?** Big platform tiles (`platform-tile`), not a dropdown. The hidden `#key-server-input` select still holds the value, so the save and validation code is unchanged.
2. **Get your stream key.** Shown once a platform is chosen: a folded-away numbered guide for finding the key on that platform (`PLATFORM_GUIDES` in `platform-guides.ts`), then the key box with a Paste button. A pasted full address is cut down to the key (`cleanStreamKeyInput` in the shared `platforms.ts`, which the server uses too).
3. **Name this stream.** Input, name (left empty on purpose, so the editor has to type one and it is never left as a generic "YouTube"), watch link, notes.
4. **Backup** (optional, folded away). A note above it says what each platform does, because the backup was a common confusion: YouTube's backup uses the same key with a different server (added for you, nothing to fill in); Facebook's uses the same server with a different key (the box is shown); Instagram has none (nothing to fill in). The box is hidden for YouTube and Instagram.

Errors (`getStreamKeyProblem` and the checks in `saveKeyFormBtn`) say what to do, mark the field, and scroll to it. The platform guides name each platform's screens loosely and tell people they may look different, because those screens change; recheck the wording now and then.

## Share dialog

An owners-and-admins screen (`roles.ts`), so it stays terse, but it must work on a phone. It is a list, not a table: a table has fixed columns and pushed the role and the buttons off a phone's screen.

- One row per person (`.role-row`): an avatar with the email's first letter, the email, a role pill (`.role-pill-*`: owner and admin in the accent, editor plain, viewer outlined; the admins and owners come first, read only, with "see Admins") and what they can see ("All inputs" or "Only English"), then change and remove buttons. On a wide screen the email and the role line up as columns; on a phone the role sits under the email.
- **Add person** is a labelled button in the header. The new person's panel opens at the top of the list, so it is seen without scrolling. Changing a role opens the same panel in the row's place.
- The panel (`.role-edit`) has labelled fields (Email, Role, Can see), one line on what the chosen role can do (`ROLE_HINTS`, which restates the user guide's "Who can do what"; the server still decides, see ADR 0003), and Cancel / Save. A bad or empty email says so under the fields. Enter in the email box saves.

## Components

`frontend/input.css` defines the component classes the templates use: `btn` (`-xs -sm -square -ghost -primary -accent -error`), `input`, `select`, `fieldset`, `fieldset-legend`, `label`, `modal` (`-box -action -backdrop`), `alert`, `card`, `menu`, `tabs`/`tab`, `table`, `loading`, `swap`, `link`. They are plain CSS in the `components` layer, so a Tailwind utility on the element (`w-full`, `hidden`) overrides them. Rules written outside a layer beat every utility; keep new component rules inside `@layer components`.
