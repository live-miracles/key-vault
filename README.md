# key-vault

A safer way to store and manage stream keys for big events.

This is a Google Apps Script web app backed by a Google Sheet. After creating and configuring the
Apps Script project, you will be able to:

- Create events.
- Add stream keys for an event.
- Add role-based access controls to restrict which keys each user can access.

## Project structure

```text
├── Code.js              # Google Apps Script backend
├── frontend/
│   ├── index.html       # Main HTML page
│   ├── script.js        # UI logic
│   ├── access.js        # Access control rules
│   ├── events.js        # Event management UI
│   ├── languages.js     # Language settings UI
│   ├── roles.js         # Role management UI
│   ├── keys.js          # Key management UI
│   ├── utils.js         # Shared browser helpers
│   ├── test-utils.js    # Local test/demo helpers
│   └── input.css        # Tailwind CSS source
└── build-tools/         # Local dev and release scripts
```

## Local development

```bash
npm install
npm run dev
```

This does an initial CSS compile, then serves the app locally at `http://localhost:3000` with live
reload.

To only compile CSS:

```bash
npm run css
```

`frontend/output.css` is generated from `frontend/input.css` and is intentionally ignored by git.
Local development and release builds create it as needed.

## Releases

This repo now follows the same release pattern as `multi-lang-qa`.

Pushing a git tag publishes a versioned frontend snapshot to GitHub Pages at
`https://live-miracles.github.io/key-vault/v/x.y.z/`. The Apps Script deployment is then rebuilt to
load that pinned asset version, so future frontend changes do not affect older releases.

```bash
npm version 0.3.2 --no-git-tag-version
git add package.json package-lock.json
git commit -m "Release v0.3.2"
git tag v0.3.2
git push origin master --tags
```

The release tag must match `package.json`. GitHub Actions checks this before deploying.

To preview the generated Apps Script project locally:

```bash
npm run apps-script:build -- v0.3.2
```

The generated Apps Script files are written to `dist/apps-script/`.

### One-time Apps Script deployment setup

Create these GitHub repository secrets before expecting tag releases to update the live Apps Script
deployment:

- `APPS_SCRIPT_ID`: the script ID from the Apps Script project settings.
- `APPS_SCRIPT_DEPLOYMENT_ID`: the deployment ID of the existing web app deployment that should keep
  the same public URL.
- `CLASPRC_JSON`: the contents of the `.clasprc.json` file created by `npx clasp login`.

Once these are set, a tag like `v0.3.2` will:

- publish `https://live-miracles.github.io/key-vault/v/0.3.2/`
- generate the Apps Script project in `dist/apps-script/`
- push the generated project with `clasp`
- create a new Apps Script version and update the existing deployment to point at it

## Deploying to Google Apps Script manually

If you want to collaborate with others in real time, you will need to create a Google Apps Script
project.

1. Create a spreadsheet with these tabs and columns:
   `Role`: `id`, `event`, `email`, `type`, `language`, `remarks`
   `Event`: `id`, `name`, `status`
   `Language`: `id`, `name`, `order` (`id` should be a string from `01` to `99`)
   `Key`: `id`, `event`, `name`, `language`, `server`, `key`, `server2`, `key2`, `link`, `color`,
   `remarks`
2. Create an Apps Script project and add a script property named `SPREADSHEET_ID`.
3. Run `npm run apps-script:build -- v0.3.2`.
4. Add the generated files from `dist/apps-script/` to the Apps Script project.
5. Deploy the project as a web app.

## Roles

- Owner: can edit or delete events, lock or unlock events, and assign event admins.
- Admin: can lock or unlock an event and add viewers and editors.
- Editor: can edit keys for an event and can be restricted to languages.
- Viewer: can only view an event's keys and can be restricted to languages.
