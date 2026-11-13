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

Tints are **opaque** (mixed over `base-200`), so the waves can never show through a row. A color set by hand by an owner or admin wins over the reported status.

## Shape and type

- Radii: 6 px menu items and tabs, 8 px controls (`--radius-field`), 12 px cards and dialogs (`--radius-box`).
- Type: 14 px body, 13 px small controls, 12 px labels and column headers. Weights 400, 500 and 600 only.
- Focus: a 2 px `primary-hover` outline on `:focus-visible`; fields also get a 3 px translucent `primary` ring.

## Waves

- An inline SVG (`.wave-bg` in `frontend/index.html`) fixed behind the page, tiled from a 96 × 48 seigaiha pattern: scales of radius 48, rows half a scale apart, each row covering the one before.
- Cells are filled with the canvas color and outlined in `--wave-line`; they must stay opaque, because that is what hides the lower half of each scale.
- A mask fades the layer from the bottom (visible) to 62% of the height (gone), so tables and forms sit on calm canvas.
- No animation. Keep contrast at the level of a watermark: `--wave-line` is only slightly lighter than the canvas.

## Components

`frontend/input.css` defines the component classes the templates use: `btn` (`-xs -sm -square -ghost -primary -accent -error`), `input`, `select`, `fieldset`, `fieldset-legend`, `label`, `modal` (`-box -action -backdrop`), `alert`, `card`, `menu`, `tabs`/`tab`, `table`, `loading`, `swap`, `link`. They are plain CSS in the `components` layer, so a Tailwind utility on the element (`w-full`, `hidden`) overrides them. Rules written outside a layer beat every utility; keep new component rules inside `@layer components`.
