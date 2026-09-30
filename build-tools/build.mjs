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

// Apps Script's HTML service is fragile with non-ASCII text and ES2015 code point escapes in
// inline assets, so keep the generated output plain ASCII with legacy escapes.
function toLegacyEscapes(source) {
    return source
        .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex) => {
            const n = parseInt(hex, 16) - 0x10000;
            const high = (0xd800 + (n >> 10)).toString(16);
            const low = (0xdc00 + (n & 0x3ff)).toString(16);
            return n < 0 ? `\\u${hex.padStart(4, '0')}` : `\\u${high}\\u${low}`;
        })
        .replace(/[^\x00-\x7f]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

function toCssEscapes(source) {
    return source.replace(/[^\x00-\x7f]/gu, (ch) => `\\${ch.codePointAt(0).toString(16)} `);
}

function escapeInlineScript(source) {
    return toLegacyEscapes(source)
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
    () =>
        `\n    <link rel="icon" type="image/png" href="${logoUrl}" />\n    <style>${toCssEscapes(css)}</style>`,
);

if (replaced === shell) {
    throw new Error('Could not find the frontend asset block in frontend/index.html.');
}

const output = replaced
    .replace(/<title>.*?<\/title>/, '<title>Key Vault</title>')
    .replace('</body>', () => `<script>${escapeInlineScript(code)}</script>\n  </body>`);
await writeFile(path.join(root, 'src', 'Index.html'), output);
console.log('Frontend build complete: src/Index.html (bundled inline assets)');
