# Install Key Vault as an app

Key Vault is a progressive web app (PWA). Chrome, Edge and most phone browsers can install it, so it opens in its own window with its own icon, from the taskbar, the dock or the home screen, without a browser's tabs and address bar. There is nothing to download and no store.

An installed Key Vault is the same site: you sign in with Google as usual, and it always shows live data.

## Install it

**Chrome or Edge on a computer**

1. Open Key Vault in the browser and sign in.
2. Click the install icon at the right end of the address bar (a screen with a down arrow). If you do not see it, open the browser menu (⋮) and choose **Cast, save and share → Install page as app** in Chrome, or **Apps → Install this site as an app** in Edge.
3. Confirm. Key Vault opens in its own window and is added to your apps. Right-click its taskbar or dock icon to pin it.

**Chrome on Android**

Open the menu (⋮) and choose **Install app** (or **Add to Home screen**).

**Safari on iPhone or iPad**

Tap **Share**, then **Add to Home Screen**.

To remove it, uninstall it like any other app, or open the app's window menu (⋮) and choose **Uninstall**.

## What it does, and what it does not

- It opens in its own window, with the Key Vault icon and a title bar that matches the page (dark by default).
- It opens quickly, because the page's code is kept on your device between visits.
- It is **not an offline tool.** Destinations and their status are fetched live every time, and are never stored on your device. Without a connection the window opens but cannot load events, and shows an error. This is on purpose: a stale "Live" is worse than no answer.
- Updates need nothing from you. The newest version is fetched the next time you open it online.

## If the install button does not appear

- Use `https://` (or `http://localhost`). Browsers only offer installation on a secure address.
- Reload the page once. The install offer appears after the page has loaded and registered its service worker.
- If you have installed it before and removed it, Chrome waits a while before offering again. Use the menu path above instead.
- In Chrome's developer tools, **Application → Manifest** lists what is missing (the manifest, its icons, the service worker).

## For developers

The pieces, all under `frontend/`:

| File                   | What it does                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `manifest.webmanifest` | Name, icons, colours, `display: standalone`. Paths are relative, so it works under any address.                    |
| `sw.js`                | The service worker. Caches only the page shell and the hashed code chunks of the site's own origin.                |
| `src/pwa.ts`           | Registers the service worker. The build turns it off for `npm run dev`, where a cached page would hide your edits. |
| `icons/`               | 192 and 512 px icons, a maskable 512 px icon (full-bleed, for Android's shapes) and the iOS touch icon.            |

What the service worker will not touch is the part that matters for a site that handles stream keys. It ignores everything that is not a same-origin `GET`. The calls to Supabase go to another origin, and the save and sign-in calls are not `GET`s, so tokens, keys, status and anything typed are never cached. `test/pwa.test.mjs` runs the real worker and checks this.

`build-tools/build.mjs` writes the build id (the Vercel commit, or the time) into `sw.js`, so every deploy has its own cache and the old one is deleted when the new worker takes over. `vercel.json` serves `sw.js` and the manifest with `Cache-Control: no-cache`, so a deploy reaches browsers promptly.

To check it, run `npm run build:demo`, serve `dist/` over `http://localhost`, and open **Application** in Chrome's developer tools: **Manifest** should show no errors and **Service workers** should show the worker as activated.
