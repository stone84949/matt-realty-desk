import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker.mjs';
import { TestD1 } from './d1-test-adapter.mjs';
import { authFixture } from './auth-fixture.mjs';
// Loopback-only test harness; never part of the deployed Worker dependency graph.
const fixture = await authFixture('https://preview-fixture.cloudflareaccess.com');
const DB = new TestD1();
DB.exec(await readFile(new URL('../migrations/0001-crm.sql', import.meta.url), 'utf8'));
DB.exec(await readFile(new URL('../demo.sql', import.meta.url), 'utf8'));
const assetsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../static');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const env = { ...fixture.env, DB, ASSETS: { async fetch(request) {
            const path = new URL(request.url).pathname;
            const file = resolve(assetsRoot, `.${path === '/' ? '/index.html' : path}`);
            if (!file.startsWith(`${assetsRoot}/`) && !file.startsWith(`${assetsRoot}\\`))
                return new Response('Not found', { status: 404 });
            try {
                return new Response(await readFile(file), { headers: { 'Content-Type': mime[extname(file)] || 'application/octet-stream' } });
            }
            catch {
                return new Response('Not found', { status: 404 });
            }
        } } };
globalThis.fetch = async () => fixture.keys();
const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req)
        chunks.push(chunk);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers))
        if (v)
            headers.set(k, Array.isArray(v) ? v.join(',') : v);
    headers.set('Cf-Access-Jwt-Assertion', fixture.token);
    const request = new Request(`http://127.0.0.1:5052${req.url}`, { method: req.method, headers, ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Buffer.concat(chunks) }) });
    const response = await worker.fetch(request, env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
});
server.listen(5052, '127.0.0.1', () => console.log('Synthetic local preview: http://127.0.0.1:5052'));
process.on('SIGINT', () => server.close(() => { DB.close(); process.exit(0); }));
