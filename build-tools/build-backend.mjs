import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.clasp-build');

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

execFileSync(
    process.execPath,
    [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'src/tsconfig.deploy.json'],
    { cwd: root, stdio: 'inherit' },
);

// Code.ts shares the access-control helpers with the frontend, so ship them as a second script.
const access = await esbuild.transform(
    readFileSync(path.join(root, 'frontend', 'src', 'access.ts'), 'utf8'),
    { loader: 'ts', target: 'es2020' },
);
writeFileSync(path.join(output, 'access.js'), access.code);

cpSync(path.join(root, 'src', 'appsscript.json'), path.join(output, 'appsscript.json'));
for (const filename of readdirSync(path.join(root, 'src'))) {
    if (filename.endsWith('.html')) {
        cpSync(path.join(root, 'src', filename), path.join(output, filename));
    }
}

console.log('Backend build complete: .clasp-build/{Code.js,access.js,*.html,appsscript.json}');
