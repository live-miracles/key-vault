// Builds the site into dist/, in one of two modes:
//
//   real  the site Vercel serves: Google sign-in and the Edge Function. Needs
//         KEY_VAULT_SUPABASE_URL and KEY_VAULT_SUPABASE_PUBLISHABLE_KEY in the environment.
//   demo  the same screens running the server's own operations on made-up data in the page,
//         with no sign-in and no network.
//
// The mode is a compile-time constant, so each build leaves out the other's code (the demo
// build has no Supabase client, the real build has none of the demo). `npm run dev` uses the
// same options (see dev.mjs).

import { spawnSync } from 'node:child_process';
import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const outdir = path.join(root, 'dist');

// A legacy Supabase key is a JWT whose payload names its role, base64-encoded, so the word
// "service_role" never appears in it as text. Only the "anon" one is safe in the browser.
function isPrivilegedLegacyKey(key) {
    const parts = key.split('.');
    if (parts.length !== 3 || !parts[0].startsWith('eyJ')) return false;
    try {
        return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))?.role !== 'anon';
    } catch {
        return true;
    }
}

// Only the publishable key may reach the browser: a secret or service-role key here would give
// every visitor the whole database.
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
    if (
        publishableKey.startsWith('sb_secret_') ||
        publishableKey.includes('service_role') ||
        isPrivilegedLegacyKey(publishableKey)
    ) {
        throw new Error(
            'KEY_VAULT_SUPABASE_PUBLISHABLE_KEY must be the publishable key, not a secret.',
        );
    }
    return { supabaseUrl, publishableKey };
}

// The tailwind command line, found through its package so it runs the same everywhere.
export function tailwindCommand() {
    const require = createRequire(import.meta.url);
    const packageJson = require('@tailwindcss/cli/package.json');
    const bin = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin.tailwindcss;
    const script = path.join(path.dirname(require.resolve('@tailwindcss/cli/package.json')), bin);
    return [process.execPath, script];
}

// The stylesheet is built into frontend/output.css and imported by main.ts, so esbuild bundles
// it and watches it like any other source.
export const cssArguments = [
    '-i',
    path.join(root, 'frontend', 'input.css'),
    '-o',
    path.join(root, 'frontend', 'output.css'),
];

export function buildCss({ minify }) {
    const [node, script] = tailwindCommand();
    const result = spawnSync(node, [script, ...cssArguments, ...(minify ? ['--minify'] : [])], {
        stdio: 'inherit',
        cwd: root,
    });
    if (result.status !== 0) throw new Error('Building the stylesheet failed.');
}

// What the page needs beside the bundle. sw.js is copied separately (see copyStatic).
const STATIC_FILES = [
    'index.html',
    'theme-init.js',
    'logo.png',
    'logo.svg',
    'manifest.webmanifest',
];

// A new id for every deploy, so the service worker's cache is replaced instead of growing.
export function buildId(env = process.env) {
    return String(env.VERCEL_GIT_COMMIT_SHA || Date.now().toString(36)).slice(0, 12);
}

// The service worker carries the build id, which makes it a different file on every deploy, so
// browsers fetch it again and replace the old one.
export function stampServiceWorker(source, id) {
    if (!source.includes('__BUILD_ID__')) throw new Error('sw.js has no __BUILD_ID__ to replace.');
    return source.replaceAll('__BUILD_ID__', id);
}

export async function copyStatic() {
    await mkdir(outdir, { recursive: true });
    for (const file of STATIC_FILES) {
        await copyFile(path.join(root, 'frontend', file), path.join(outdir, file));
    }
    await cp(path.join(root, 'frontend', 'icons'), path.join(outdir, 'icons'), { recursive: true });
    await copyFile(
        path.join(root, 'frontend', 'icons', 'apple-touch-icon.png'),
        path.join(outdir, 'apple-touch-icon.png'),
    );
    const worker = await readFile(path.join(root, 'frontend', 'sw.js'), 'utf8');
    await writeFile(path.join(outdir, 'sw.js'), stampServiceWorker(worker, buildId()));
}

export function esbuildOptions({
    mode,
    env = process.env,
    minify = true,
    serviceWorker = true,
    extra = {},
}) {
    const config = mode === 'real' ? backendConfigFromEnv(env) : null;
    return {
        entryPoints: { app: path.join(root, 'frontend', 'src', 'main.ts') },
        bundle: true,
        format: 'esm',
        splitting: true,
        outdir,
        chunkNames: 'chunks/[name]-[hash]',
        platform: 'browser',
        target: 'es2022',
        minify,
        legalComments: 'none',
        // The other mode's code sits in a branch the build removes; esbuild would still bundle
        // what that branch imports unless told it is external.
        external: [mode === 'real' ? './demo/demo-backend.ts' : './auth.ts'],
        define: {
            __KEY_VAULT_MODE__: JSON.stringify(mode),
            __KEY_VAULT_CONFIG__: JSON.stringify(config),
            __KEY_VAULT_SERVICE_WORKER__: JSON.stringify(serviceWorker),
        },
        logLevel: 'info',
        ...extra,
    };
}

export async function build({ mode, env = process.env }) {
    if (mode !== 'real' && mode !== 'demo') throw new Error('The mode is "real" or "demo".');
    const options = esbuildOptions({ mode, env });
    await rm(outdir, { recursive: true, force: true });
    buildCss({ minify: true });
    await esbuild.build(options);
    await copyStatic();
    console.log(`Built the ${mode} site in ${path.relative(root, outdir)}/.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    build({ mode: process.argv[2] ?? 'real' }).catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}
