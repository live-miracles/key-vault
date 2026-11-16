// A static file server for local development: node build-tools/serve.mjs [directory] [port].
// Nothing is cached, so a manual refresh always shows the latest build. There is no live reload.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'site');
const port = Number(process.argv[3] || 2837);

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

createServer(async (request, response) => {
    const { pathname } = new URL(request.url, 'http://localhost');
    let file = path.join(root, decodeURIComponent(pathname));
    if (file !== root && !file.startsWith(root + path.sep)) {
        response.writeHead(403).end('Forbidden');
        return;
    }
    if (pathname.endsWith('/')) file = path.join(file, 'index.html');

    try {
        const body = await readFile(file);
        response.writeHead(200, {
            'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-store',
        });
        response.end(body);
    } catch {
        response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    }
}).listen(port, () => console.log(`[serve] ${root} on http://localhost:${port}`));
