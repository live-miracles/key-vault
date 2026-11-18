// The dev site: the demo on http://localhost:2837 with live reload. The page reloads when
// any source, the stylesheet or index.html changes.

import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import * as esbuild from 'esbuild';
import {
    buildCss,
    copyStatic,
    cssArguments,
    esbuildOptions,
    outdir,
    root,
    tailwindCommand,
} from './build.mjs';

const PORT = Number(process.env.PORT) || 2837;

await rm(outdir, { recursive: true, force: true });
buildCss({ minify: false });

// esbuild tells the page about every rebuild over /esbuild; the page reloads itself.
const reload = "new EventSource('/esbuild').addEventListener('change', () => location.reload());";
const context = await esbuild.context(
    esbuildOptions({
        mode: 'demo',
        minify: false,
        // A cached page would hide the edits the reload is there to show.
        serviceWorker: false,
        extra: {
            sourcemap: true,
            banner: { js: reload },
            plugins: [{ name: 'static', setup: (build) => build.onEnd(copyStatic) }],
        },
    }),
);
await context.watch();
await context.serve({ servedir: outdir, port: PORT, host: '127.0.0.1' });

// tailwind rewrites frontend/output.css as the markup changes, which esbuild is watching.
const [node, script] = tailwindCommand();
const tailwind = spawn(node, [script, ...cssArguments, '--watch'], { stdio: 'inherit', cwd: root });

// index.html is not bundled, so a change to it asks for a rebuild by hand.
const htmlWatcher = watch(path.join(root, 'frontend', 'index.html'), () => void context.rebuild());

console.log(`Key Vault demo: http://localhost:${PORT}`);

const stop = async () => {
    htmlWatcher.close();
    tailwind.kill();
    await context.dispose();
    process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
