---
name: screenshots
description: Screenshots of the Key Vault demo in the dark and light themes, whole page, one element or a zoomed crop. Use when asked to show, preview or screenshot how a UI change looks, or to refresh the images in docs/images.
---

# Screenshots of the demo

`shoot.mjs` (beside this file) starts the demo (`npm run dev`) on its own port, opens it in Chrome with Playwright, saves one PNG per theme, and stops the server. The demo's data holds every status (Live, Unstable, Problem, grey, Not set up yet), so most changes can be seen in it.

## Steps

1. **Playwright.** `playwright-core` is not a dependency of the repo, so install it outside the repo: `mkdir -p <scratchpad>/pw && cd <scratchpad>/pw && npm init -y && npm i playwright-core`. Done when `<scratchpad>/pw/node_modules/playwright-core/index.mjs` exists. Skip this when it is already there.
2. **Shoot.** From the repo root:

    ```
    PLAYWRIGHT_CORE_DIR=<scratchpad>/pw node .claude/skills/screenshots/shoot.mjs --out <scratchpad>/shots --name dashboard
    ```

    It prints the path of each PNG. Done when both themes are written.

3. **Look.** Read each PNG yourself and check that the change you want to show is visible and nothing is cut off. A change that is not visible gets a closer crop (see Options), not a longer description.
4. **Report** the full absolute paths. The scratchpad is cleared by a reboot, so say so and offer a durable copy.

## Options

| Option                | Meaning                                                                                                  | Default      |
| --------------------- | -------------------------------------------------------------------------------------------------------- | ------------ |
| `--out DIR`           | Where the PNGs go. Required.                                                                             |              |
| `--name NAME`         | File names are `NAME-dark.png` and `NAME-light.png`.                                                     | `screenshot` |
| `--themes dark,light` | Which themes to shoot.                                                                                   | both         |
| `--width` `--height`  | Window size in CSS pixels. 400 wide shows the phone layout.                                              | 1400 × 900   |
| `--scale 2`           | Pixel density. Use 2 for a zoomed crop.                                                                  | 1            |
| `--clip x,y,w,h`      | Crop to a box of the page, in CSS pixels. A row of cards is about `270,60,1130,340` at the default size. |              |
| `--selector CSS`      | Shoot one element instead, such as `.dest-card`.                                                         | whole window |
| `--click CSS`         | Click before shooting; repeat for several. `[data-action="add-key"]` opens the Add destination form.     |              |
| `--wait CSS`          | Wait for this element before shooting.                                                                   | `.dest-card` |
| `--route PATH`        | Page to open, with its query string.                                                                     | `/`          |
| `--port N`            | Port for the demo server.                                                                                | 2838         |

`CHROME_PATH` names the browser when it is not at a usual place.

## Gotchas

- **The status dots take a moment.** The demo reports its statuses after loading, so wait for `.dest-link .input-dot` when the shot is about the dots (`--wait ".dest-link .input-dot"`).
- **Headless Chrome's own `--screenshot` flag hangs** on the demo, because the dev page holds a live-reload connection open. Use `shoot.mjs`.
- **The images in `docs/images` are `.webp`.** `shoot.mjs` writes PNG. Convert with `cwebp` or `sharp` when refreshing those, and keep their file names so the README and docs links stay valid.
