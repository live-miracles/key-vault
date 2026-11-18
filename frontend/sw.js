// Key Vault's service worker. It exists so the browser can install the site as an app and open it
// fast; it is not an offline mode, because what the app shows (destinations, live status) is only
// worth anything fresh.
//
// What it keeps: the page shell (HTML, script, stylesheet, icons), nothing else. It leaves alone
// every request that is not a same-origin GET, so the calls to Supabase (sign-in tokens, stream
// keys, status) are never cached, and neither is anything a person typed.
//
//   chunks/*  cache first. Their names carry a hash of their content, so a cached one is current.
//   the rest  network first, falling back to the cache when offline, so a deploy shows up on the
//             next visit and an offline visit still opens the shell.
//
// build.mjs replaces __BUILD_ID__ on every build. A new id is a new cache name, and the old
// caches are deleted when the new worker activates.

const BUILD_ID = '__BUILD_ID__';
const CACHE = `key-vault-${BUILD_ID}`;
const SHELL = ['./', './app.js', './app.css', './manifest.webmanifest', './icons/icon-192.png'];
const CHUNKS = new URL('chunks/', self.registration.scope).pathname;

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(CACHE)
            .then((cache) => cache.addAll(SHELL))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((names) =>
                Promise.all(
                    names
                        .filter((name) => name.startsWith('key-vault-') && name !== CACHE)
                        .map((name) => caches.delete(name)),
                ),
            )
            .then(() => self.clients.claim()),
    );
});

async function cacheFirst(request) {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
}

async function networkFirst(request) {
    const cache = await caches.open(CACHE);
    try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
    } catch (error) {
        const hit =
            (await cache.match(request, { ignoreSearch: true })) ||
            (request.mode === 'navigate' ? await cache.match('./') : undefined);
        if (hit) return hit;
        throw error;
    }
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    event.respondWith(
        url.pathname.startsWith(CHUNKS) ? cacheFirst(request) : networkFirst(request),
    );
});
