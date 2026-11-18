import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import { root, stampServiceWorker } from '../build-tools/build.mjs';

const frontend = path.join(root, 'frontend');
const read = (file) => readFileSync(path.join(frontend, file), 'utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));

// A PNG's width and height are in its first chunk.
function pngSize(file) {
    const bytes = readFileSync(path.join(frontend, file));
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

test('the manifest has what Chrome needs to offer an install', () => {
    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.name && manifest.short_name);
    assert.ok(manifest.start_url && manifest.scope);
    const sizes = manifest.icons.map((icon) => icon.sizes);
    assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
    assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
});

test('every icon in the manifest exists at the size it claims', () => {
    for (const icon of manifest.icons.filter((item) => item.type === 'image/png')) {
        const [width, height] = pngSize(icon.src);
        assert.equal(`${width}x${height}`, icon.sizes, icon.src);
    }
    assert.deepEqual(pngSize('icons/apple-touch-icon.png'), [180, 180]);
});

test('the page links the manifest, the touch icon and a theme color', () => {
    const html = read('index.html');
    assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/);
    assert.match(html, /rel="apple-touch-icon"/);
    assert.match(html, new RegExp(`name="theme-color" content="${manifest.theme_color}"`));
});

test('the build id is written into the service worker, and a missing placeholder fails', () => {
    const stamped = stampServiceWorker(read('sw.js'), 'abc123');
    assert.ok(!stamped.includes('__BUILD_ID__'));
    assert.match(stamped, /const BUILD_ID = 'abc123';/);
    assert.throws(() => stampServiceWorker('nothing to replace', 'abc123'), /__BUILD_ID__/);
});

// Runs sw.js with just enough of a worker around it to collect its listeners.
function loadWorker() {
    const listeners = {};
    const self = {
        location: new URL('https://vault.example/sw.js'),
        registration: { scope: 'https://vault.example/' },
        addEventListener: (type, listener) => (listeners[type] = listener),
        skipWaiting: () => Promise.resolve(),
        clients: { claim: () => Promise.resolve() },
    };
    const cache = {
        match: async () => undefined,
        put: async () => {},
        addAll: async () => {},
    };
    const caches = {
        open: async () => cache,
        keys: async () => [],
        delete: async () => true,
    };
    const fetched = [];
    const fetch = async (request) => {
        fetched.push(request.url);
        return { ok: true, clone: () => ({}) };
    };
    vm.runInNewContext(read('sw.js'), { self, caches, fetch, URL, Promise });
    return { listeners, fetched };
}

function dispatchFetch(listeners, url, method = 'GET') {
    let handled;
    listeners.fetch({
        request: { url, method, mode: 'cors' },
        respondWith: (promise) => (handled = promise),
    });
    return handled;
}

test('the service worker leaves the API and every non-GET request to the network', () => {
    const { listeners } = loadWorker();
    assert.equal(
        dispatchFetch(listeners, 'https://abcdefgh.supabase.co/functions/v1/api/getKeys'),
        undefined,
        'a cross-origin call (Supabase) is never touched',
    );
    assert.equal(
        dispatchFetch(listeners, 'https://vault.example/app.js', 'POST'),
        undefined,
        'only GET is ever handled',
    );
});

test('the service worker serves the app from its own origin', async () => {
    const { listeners, fetched } = loadWorker();
    const handled = dispatchFetch(listeners, 'https://vault.example/app.js');
    assert.ok(handled, 'a same-origin GET is handled');
    await handled;
    assert.deepEqual(fetched, ['https://vault.example/app.js']);
});
