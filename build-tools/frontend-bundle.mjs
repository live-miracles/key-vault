import { mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import * as esbuild from 'esbuild';

const root = process.cwd();

// The app is a set of plain scripts that share globals (the tests load them the same way),
// concatenated in this order. test-utils.ts is the demo's mock backend and is left out of
// the real site.
const APP_FILES = ['utils.ts', 'access.ts', 'events.ts', 'languages.ts', 'roles.ts', 'keys.ts'];
const DEMO_FILES = ['test-utils.ts'];
const ENTRY_FILE = 'script.ts';

async function bundleApp({ demo }) {
    const files = [...APP_FILES, ...(demo ? DEMO_FILES : []), ENTRY_FILE];
    const source = (
        await Promise.all(
            files.map((filename) => readFile(path.join(root, 'frontend', 'src', filename), 'utf8')),
        )
    ).join('\n');
    const { code } = await esbuild.transform(source, {
        loader: 'ts',
        format: 'iife',
        target: 'es2020',
        minify: true,
        keepNames: true,
    });
    return code;
}

// Sign-in and the transport to Supabase (frontend/src/supabase.ts) with supabase-js.
async function bundleAuth() {
    const result = await esbuild.build({
        entryPoints: [path.join(root, 'frontend', 'src', 'supabase.ts')],
        bundle: true,
        write: false,
        format: 'iife',
        target: 'es2020',
        minify: true,
        platform: 'browser',
    });
    return result.outputFiles[0].text;
}

// The shell lists its assets between two markers so each build can swap in its own.
async function renderShell(assets) {
    const shell = await readFile(path.join(root, 'frontend', 'index.html'), 'utf8');
    const pattern = /[ \t]*<!-- assets:start -->[\s\S]*?<!-- assets:end -->/;
    if (!pattern.test(shell)) {
        throw new Error('Could not find the asset markers in frontend/index.html.');
    }
    return shell.replace(pattern, () => assets.map((line) => `    ${line}`).join('\n'));
}

async function resetDir(directory) {
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
}

export async function buildDemoSite(directory = path.join(root, 'site')) {
    await resetDir(directory);
    await writeFile(path.join(directory, 'app.js'), await bundleApp({ demo: true }));
    await copyFile(path.join(root, 'frontend', 'output.css'), path.join(directory, 'app.css'));
    await copyFile(path.join(root, 'frontend', 'logo.png'), path.join(directory, 'logo.png'));
    await writeFile(
        path.join(directory, 'index.html'),
        await renderShell([
            '<link rel="icon" type="image/png" href="logo.png" />',
            '<link rel="stylesheet" href="app.css" />',
            '<script src="app.js" defer></script>',
        ]),
    );
}

// Only the publishable key may reach the browser: a secret or service-role key here would
// give every visitor the whole database.
export function backendConfigFromEnv(env) {
    const supabaseUrl = String(env.KEY_VAULT_SUPABASE_URL || '')
        .trim()
        .replace(/\/+$/, '');
    const publishableKey = String(env.KEY_VAULT_SUPABASE_PUBLISHABLE_KEY || '').trim();
    if (!supabaseUrl || !publishableKey) {
        throw new Error(
            'Set KEY_VAULT_SUPABASE_URL and KEY_VAULT_SUPABASE_PUBLISHABLE_KEY to build the site.',
        );
    }
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl)) {
        throw new Error('KEY_VAULT_SUPABASE_URL must look like https://<project-ref>.supabase.co.');
    }
    if (publishableKey.startsWith('sb_secret_') || publishableKey.includes('service_role')) {
        throw new Error(
            'KEY_VAULT_SUPABASE_PUBLISHABLE_KEY must be the publishable key, not a secret.',
        );
    }
    return { supabaseUrl, publishableKey };
}

export async function buildWebSite(env = process.env, directory = path.join(root, 'web')) {
    const config = backendConfigFromEnv(env);
    await resetDir(directory);
    await writeFile(path.join(directory, 'app.js'), await bundleApp({ demo: false }));
    await writeFile(path.join(directory, 'auth.js'), await bundleAuth());
    await writeFile(
        path.join(directory, 'config.js'),
        `window.KEY_VAULT_CONFIG = ${JSON.stringify(config)};\n`,
    );
    await copyFile(path.join(root, 'frontend', 'output.css'), path.join(directory, 'app.css'));
    await copyFile(path.join(root, 'frontend', 'logo.png'), path.join(directory, 'logo.png'));
    await writeFile(
        path.join(directory, 'index.html'),
        await renderShell([
            '<link rel="icon" type="image/png" href="logo.png" />',
            '<link rel="stylesheet" href="app.css" />',
            '<script src="config.js"></script>',
            '<script src="auth.js" defer></script>',
            '<script src="app.js" defer></script>',
        ]),
    );
}
