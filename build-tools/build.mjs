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
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const outdir = path.join(root, 'dist');

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
    if (publishableKey.startsWith('sb_secret_') || publishableKey.includes('service_role')) {
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

// What the page needs beside the bundle.
const STATIC_FILES = ['index.html', 'logo.png', 'logo.svg'];

export async function copyStatic() {
    await mkdir(outdir, { recursive: true });
    for (const file of STATIC_FILES) {
        await copyFile(path.join(root, 'frontend', file), path.join(outdir, file));
    }
}

export function esbuildOptions({ mode, env = process.env, minify = true, extra = {} }) {
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
