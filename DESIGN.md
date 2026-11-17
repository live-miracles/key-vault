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

## Shape and type

- Radii: 6 px menu items and tabs, 8 px controls (`--radius-field`), 12 px cards and dialogs (`--radius-box`).
- Type: 14 px body, 13 px small controls, 12 px labels and column headers. Weights 400, 500 and 600 only.
- Focus: a 2 px `primary-hover` outline on `:focus-visible`; fields also get a 3 px translucent `primary` ring.

## Layout

- **Overview** is the first tab and the landing page: totals, one row per event, and the keys that need attention (`overview.ts`).
- **Event view** is bunryu's list-and-detail layout: on the left the event's own card (its name, rename and delete, Add destination, Share) above its input list (`All` first, then the event's inputs in its own order, each with status counts, and a `+` for its admins to add one; they also rename, delete and drag to reorder there). The selected input's destinations are on the right as a grid of cards (`.dest-card`; one column on a phone, more as the window widens), each starting with its status label, then the name and actions, what the status means, and its links. Under `All` each input is a heading across the grid with its cards beneath. There is no table. Below 768 px the list becomes a row of chips above the cards. The choice is kept in the `input` URL parameter.
- Status counts use the `status-pill` classes, which share the status colors above.

## Waves

- An inline SVG (`.wave-bg` in `frontend/index.html`) fixed behind the page, tiled from a 96 × 48 seigaiha pattern: scales of radius 48, rows half a scale apart, each row covering the one before.
- Cells are filled with the canvas color and outlined in `--wave-line`; they must stay opaque, because that is what hides the lower half of each scale.
- A mask fades the layer from the bottom (visible) to 62% of the height (gone), so cards and forms sit on calm canvas.
- No animation. Keep contrast at the level of a watermark: `--wave-line` is only slightly lighter than the canvas.

## Who it is for

Two audiences, two standards:

- **People who add and edit destinations** (editors, and anyone adding a key) may never have seen a stream key. Their screens (the Add a destination form, the cards, the input picker) use plain words, say what to do next, and explain errors in terms of the fix. No jargon without a one-line explanation.
- **Owners and admins** (sharing, event settings, bunryu settings, the overview) are technical and keep the compact, terse style.

Why the editors matter: the media team used to send links in a Google Sheet and often put a stream key where an address belonged, or the main link in the backup box. The form exists to make that mistake impossible, and the status colors exist so they can see for themselves whether an update reached bunryu and whether each output is live. See `CONTEXT.md`.

## Status feedback

A row's color is only half the message. For an editor, a red or amber row must also say **what is probably wrong and what to try**, in plain words:

- The advice is Key Vault's own (`ADVICE_PATTERNS` in `keys.ts`), because bunryu's hints are for the streaming team. Say what to check in terms of the key and the platform, and who to tell. Never show FFmpeg or other encoder text: a Copy button on the note puts the technical details (stream name, pipeline, bunryu's redacted message) on the clipboard instead, to paste to the streaming team.
- Show it on the card itself (`.dest-card`: the status label first, then the words under the name). A hover title does not exist on a phone, so it can only be extra.
- Hovering a row gives owners and admins bunryu's own (redacted) report; everyone else gets the note.
- **Inputs.** A dot before each input in the list says whether its signal is arriving (`INPUT_LABELS` in `keys.ts`). An input in trouble gets a banner above its streams, and a failing stream under it says the platform is probably not the cause. A link in the wrong input is "Check input" and is said first, even when the stream runs. This depends on the input and pipeline having the same name.
- "Not set up yet" means bunryu does not have this link. Say so; it is how an editor learns an update has not landed. Say nothing at all while bunryu is offline: it only runs during events.

## Add a destination

A guided form in four steps, numbered by CSS counters so a hidden step never leaves a gap:

1. **Where are you streaming to?** Big platform tiles (`platform-tile`), not a dropdown. The hidden `#key-server-input` select still holds the value, so the save and validation code is unchanged.
2. **Get your stream key.** Shown once a platform is chosen: a folded-away numbered guide for finding the key on that platform (`PLATFORM_GUIDES` in `keys.ts`), then the key box with a Paste button. A pasted full address is cut down to the key (`cleanStreamKeyInput`).
3. **Name this stream.** Input, name (suggested from the platform), watch link, notes.
4. **Backup** (optional, folded away). A note above it says what each platform does, because the backup was a common confusion: YouTube's backup uses the same key with a different server (added for you, nothing to fill in); Facebook's uses the same server with a different key (the box is shown); Instagram has none (nothing to fill in). The box is hidden for YouTube and Instagram.

Errors (`getStreamKeyProblem` and the checks in `saveKeyFormBtn`) say what to do, mark the field, and scroll to it. The platform guides name each platform's screens loosely and tell people they may look different, because those screens change; recheck the wording now and then.

## Components

`frontend/input.css` defines the component classes the templates use: `btn` (`-xs -sm -square -ghost -primary -accent -error`), `input`, `select`, `fieldset`, `fieldset-legend`, `label`, `modal` (`-box -action -backdrop`), `alert`, `card`, `menu`, `tabs`/`tab`, `table`, `loading`, `swap`, `link`. They are plain CSS in the `components` layer, so a Tailwind utility on the element (`w-full`, `hidden`) overrides them. Rules written outside a layer beat every utility; keep new component rules inside `@layer components`.
