import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as esbuild from 'esbuild';

const root = process.cwd();
const sourceFiles = [
    'utils.ts',
    'access.ts',
    'events.ts',
    'languages.ts',
    'roles.ts',
    'keys.ts',
    'script.ts',
];

function escapeInlineScript(source) {
    return source
        .replace(/<\/script/gi, '<\\/script')
        .replace(/<!--/g, '<\\!--')
        .replace(/-->/g, '--\\>');
}

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

const shell = await readFile(path.join(root, 'frontend', 'index.html'), 'utf8');
const css = await readFile(path.join(root, 'frontend', 'output.css'), 'utf8');
const assetBlockPattern =
    /\s*<link rel="icon" type="image\/png" href="\.\/logo\.png" \/>\s*<link rel="stylesheet" href="\.\/output\.css" \/>\s*<script src="\.\/bundle\.umd\.min\.js"><\/script>\s*<script src="\.\/utils\.js"><\/script>\s*<script src="\.\/access\.js"><\/script>\s*<script src="\.\/events\.js"><\/script>\s*<script src="\.\/languages\.js"><\/script>\s*<script src="\.\/roles\.js"><\/script>\s*<script src="\.\/keys\.js"><\/script>\s*<script src="\.\/test-utils\.js" defer><\/script>\s*<script src="\.\/script\.js" defer><\/script>/;
const logoUrl = process.env.LOGO_URL || 'https://live-miracles.github.io/key-vault/logo.png';
const replaced = shell.replace(
    assetBlockPattern,
    `\n    <link rel="icon" type="image/png" href="${logoUrl}" />\n    <style>${css}</style>`,
);

if (replaced === shell) {
    throw new Error('Could not find the frontend asset block in frontend/index.html.');
}

const output = replaced
    .replace(/<title>.*?<\/title>/, '<title>Key Vault</title>')
    .replace('</body>', () => `<script>${escapeInlineScript(code)}</script>\n  </body>`);
await writeFile(path.join(root, 'src', 'Index.html'), output);
console.log('Frontend build complete: src/Index.html (bundled inline assets)');
