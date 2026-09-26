import { mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import * as esbuild from 'esbuild';

const root = process.cwd();
const siteDir = path.join(root, 'site');
const sourceFiles = [
    'utils.ts',
    'access.ts',
    'events.ts',
    'languages.ts',
    'roles.ts',
    'keys.ts',
    'test-utils.ts',
    'script.ts',
];

await rm(siteDir, { recursive: true, force: true });
await mkdir(siteDir, { recursive: true });

const source = (
    await Promise.all(
        sourceFiles.map((filename) =>
            readFile(path.join(root, 'frontend', 'src', filename), 'utf8'),
        ),
    )
).join('\n');
const { code } = await esbuild.transform(source, {
    loader: 'ts',
    format: 'iife',
    target: 'es2019',
    minify: true,
    keepNames: true,
});

await writeFile(path.join(siteDir, 'app.js'), code);
await copyFile(path.join(root, 'frontend', 'output.css'), path.join(siteDir, 'app.css'));
await copyFile(path.join(root, 'frontend', 'logo.png'), path.join(siteDir, 'logo.png'));

const shell = await readFile(path.join(root, 'frontend', 'index.html'), 'utf8');
const assetBlockPattern =
    /\s*<link rel="icon" type="image\/png" href="\.\/logo\.png" \/>\s*<link rel="stylesheet" href="\.\/output\.css" \/>\s*<script src="\.\/bundle\.umd\.min\.js"><\/script>\s*<script src="\.\/utils\.js"><\/script>\s*<script src="\.\/access\.js"><\/script>\s*<script src="\.\/events\.js"><\/script>\s*<script src="\.\/languages\.js"><\/script>\s*<script src="\.\/roles\.js"><\/script>\s*<script src="\.\/keys\.js"><\/script>\s*<script src="\.\/test-utils\.js" defer><\/script>\s*<script src="\.\/script\.js" defer><\/script>/;
const page = shell.replace(
    assetBlockPattern,
    '\n    <link rel="icon" type="image/png" href="logo.png" />\n    <link rel="stylesheet" href="app.css" />\n    <script src="app.js" defer></script>',
);

if (page === shell) {
    throw new Error('Could not find the frontend asset block in frontend/index.html.');
}

await writeFile(path.join(siteDir, 'index.html'), page);
console.log('Demo site built in site/');
