// Screenshots of the Key Vault demo, in the dark and light themes.
// Starts `npm run dev` on its own port, waits for the page, shoots, and stops the server.
// See SKILL.md for how to run it.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = parseArgs(process.argv.slice(2));
const out = args.out;
if (!out)
    fail('Pass --out <directory> (use the session scratchpad unless the user named a place).');
mkdirSync(out, { recursive: true });

const themes = (args.themes ?? 'dark,light').split(',').filter(Boolean);
const width = Number(args.width ?? 1400);
const height = Number(args.height ?? 900);
const scale = Number(args.scale ?? 1);
const name = args.name ?? 'screenshot';
const waitFor = args.wait ?? '.dest-card';
const port = Number(args.port ?? 2838);
const clip = args.clip ? parseClip(args.clip) : undefined;
const clicks = [].concat(args.click ?? []);

const { chromium } = await loadPlaywright();
const server = await startDemo(port);
try {
    const browser = await chromium.launch({
        executablePath: findChrome(),
        args: ['--no-sandbox'],
    });
    for (const theme of themes) {
        const context = await browser.newContext({
            viewport: { width, height },
            deviceScaleFactor: scale,
        });
        // The app reads its theme from here before the first paint.
        await context.addInitScript((t) => {
            try {
                localStorage.setItem('key-vault-theme', t);
            } catch {
                // Without storage the app opens dark.
            }
        }, theme);
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${port}${args.route ?? '/'}`, {
            waitUntil: 'domcontentloaded',
        });
        await page.waitForSelector(waitFor, { timeout: 20000 });
        for (const selector of clicks) await page.click(selector);
        // Let the status dots and any dialog animation settle.
        await page.waitForTimeout(800);
        const file = path.join(out, `${name}-${theme}.png`);
        if (args.selector) await page.locator(args.selector).first().screenshot({ path: file });
        else await page.screenshot({ path: file, clip });
        console.log(file);
        await context.close();
    }
    await browser.close();
} finally {
    stopServer(server);
}

// ---- helpers ----

function parseArgs(list) {
    const result = {};
    for (let i = 0; i < list.length; i++) {
        if (!list[i].startsWith('--')) continue;
        const key = list[i].slice(2);
        const value = list[++i];
        if (key in result) result[key] = [].concat(result[key], value);
        else result[key] = value;
    }
    return result;
}

function parseClip(text) {
    const [x, y, w, h] = text.split(',').map(Number);
    if ([x, y, w, h].some(Number.isNaN)) fail('--clip is x,y,width,height in CSS pixels.');
    return { x, y, width: w, height: h };
}

function fail(message) {
    console.error(message);
    process.exit(1);
}

// playwright-core is not a dependency of the repo. Point PLAYWRIGHT_CORE_DIR at a folder that
// holds node_modules/playwright-core (SKILL.md says how to make one).
async function loadPlaywright() {
    const dir = process.env.PLAYWRIGHT_CORE_DIR;
    const entry = dir && path.join(dir, 'node_modules', 'playwright-core', 'index.mjs');
    if (!entry || !existsSync(entry)) {
        fail(
            'playwright-core not found. Set PLAYWRIGHT_CORE_DIR to a folder where you ran ' +
                '`npm i playwright-core` (see SKILL.md).',
        );
    }
    return import(pathToFileURL(entry).href);
}

function findChrome() {
    if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
    const known = [
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ];
    // undefined lets Playwright use its own downloaded Chromium, if there is one.
    return known.find((p) => existsSync(p));
}

// The demo dev server, in its own process group so the whole tree stops together.
async function startDemo(port) {
    const repo = path.resolve(import.meta.dirname, '..', '..', '..');
    const child = spawn('npm', ['run', 'dev'], {
        cwd: repo,
        env: { ...process.env, PORT: String(port) },
        detached: true,
        stdio: 'ignore',
    });
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/`);
            if (response.ok) return child;
        } catch {
            // Not up yet.
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    stopServer(child);
    fail(`The demo did not start on port ${port} within 45 seconds.`);
}

function stopServer(child) {
    try {
        process.kill(-child.pid);
    } catch {
        // Already gone.
    }
}
