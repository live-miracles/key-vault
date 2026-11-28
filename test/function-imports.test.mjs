import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// The Edge Functions hold the service-role key, so the packages they load are pinned to an exact
// version, the one package-lock.json has. Dependabot updates package-lock.json only; when it
// does, this fails until the functions' imports are moved to the same version.

const root = path.resolve(import.meta.dirname, '..');
const functions = path.join(root, 'supabase', 'functions');
const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

function sources(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return sources(full);
        return entry.name.endsWith('.ts') ? [full] : [];
    });
}

test('every npm package the Edge Functions load is pinned to the locked version', () => {
    const imports = sources(functions).flatMap((file) =>
        [
            ...readFileSync(file, 'utf8').matchAll(
                /['"]npm:((?:@[^/'"]+\/)?[^@'"]+)(?:@([^'"/]*))?/g,
            ),
        ].map(([, name, version]) => ({ file: path.relative(root, file), name, version })),
    );
    assert.ok(imports.length > 0);
    for (const { file, name, version } of imports) {
        const locked = lock.packages[`node_modules/${name}`]?.version;
        assert.ok(locked, `${name} (in ${file}) is not in package-lock.json`);
        assert.equal(version, locked, `${file} must import ${name}@${locked}`);
    }
});
