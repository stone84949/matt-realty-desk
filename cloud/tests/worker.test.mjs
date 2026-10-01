import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../worker.mjs';
import { TestD1 } from './d1-test-adapter.mjs';
import { authFixture } from './auth-fixture.mjs';
const fixture = await authFixture('https://worker-fixture.cloudflareaccess.com');
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => fixture.keys();
after(() => { globalThis.fetch = originalFetch; });
function env() { const DB = new TestD1(); DB.exec(readFileSync(new URL('../migrations/0001-crm.sql', import.meta.url), 'utf8')); return { ...fixture.env, DB, ASSETS: { fetch: async () => new Response('Demo asset') } }; }
const request = (path, method = 'GET', body, headers = {}) => new Request(`https://crm.example.test${path}`, { method, headers: { 'Cf-Access-Jwt-Assertion': fixture.token, Origin: 'https://crm.example.test', 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
test('anonymous callers cannot access static assets, API, exports or backups', async () => {
    const e = env();
    for (const path of ['/', '/app.js', '/quick-start.html', '/api/contacts', '/api/export/contacts.csv', '/api/backup']) {
        const response = await worker.fetch(new Request(`https://crm.example.test${path}`), e);
        assert.equal(response.status, 401, path);
        assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
    e.DB.close();
});
test('authenticated assets run behind the same security gate as data', async () => {
    const e = env();
    const response = await worker.fetch(request('/'), e);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'Demo asset');
    assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
    e.DB.close();
});
test('same-origin authenticated writes work; hostile origins cannot mutate', async () => {
    const e = env();
    assert.equal((await worker.fetch(request('/api/contacts', 'POST', { first_name: 'Alex' }, { Origin: 'https://evil.example' }), e)).status, 403);
    assert.equal((await worker.fetch(request('/api/contacts', 'POST', { first_name: 'Alex' }), e)).status, 201);
    const response = await worker.fetch(request('/api/contacts'), e);
    assert.equal((await response.json()).length, 1);
    e.DB.close();
});
test('unknown routes/methods and unavailable local features do not imply success', async () => {
    const e = env();
    assert.equal((await worker.fetch(request('/api/missing'), e)).status, 404);
    assert.equal((await worker.fetch(request('/api/contacts', 'DELETE'), e)).status, 405);
    assert.equal((await worker.fetch(request('/api/voice/transcribe', 'POST', {}), e)).status, 503);
    e.DB.close();
});
