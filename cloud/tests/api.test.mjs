import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TestD1 } from './d1-test-adapter.mjs';
const api = await import('../api.mjs');
function setup(t) { const DB = new TestD1(); const schema = readFileSync(new URL('../migrations/0001-crm.sql', import.meta.url), 'utf8'); DB.exec(schema); t.after(() => DB.close()); return { DB }; }
async function call(env, path, method = 'GET', body) { return api.handleApi(new Request('https://demo.example' + path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }) }), env); }
test('runtime exposes hosted capabilities', async () => { assert.deepEqual(await (await call({}, '/api/runtime')).json(), { hosted: true, assistant: false, voice: false, backup: 'download' }); });
test('imports skip exact records while keeping shared households and notes', async (t) => {
    const env = setup(t);
    const a = { first_name: 'Alex', email: 'HOUSE@example.test', phone: '555', notes: 'Secondary address retained' };
    const body = { contacts: [a, a, { ...a, first_name: 'Jamie' }, { ...a, notes: 'Different notes' }] };
    const results = await Promise.all([call(env, '/api/import/contacts', 'POST', body), call(env, '/api/import/contacts', 'POST', body)]);
    const values = await Promise.all(results.map(r => r.json()));
    assert.equal(values.reduce((n, r) => n + r.imported, 0), 3);
    assert.equal(values.reduce((n, r) => n + r.duplicates_skipped, 0), 5);
    const rows = await (await call(env, '/api/contacts')).json();
    assert.equal(rows.length, 3);
    assert.ok(rows.every(r => r.email_permission === 'Not asked'));
    assert.equal(rows[0].email, 'house@example.test');
});
test('invalid import is fully prevalidated and typed', async (t) => { const env = setup(t); for (const contacts of [[{ first_name: 'OK' }, { first_name: 'Bad', notes: 'x'.repeat(5001) }], [{ first_name: 'OK' }, { first_name: 7 }], Array(5001).fill({ first_name: 'A' })]) {
    assert.equal((await call(env, '/api/import/contacts', 'POST', { contacts })).status, 400);
} assert.deepEqual(await (await call(env, '/api/contacts')).json(), []); });
test('core workflows and full snapshot recover relational content', async (t) => {
    const env = setup(t);
    const c = await (await call(env, '/api/contacts', 'POST', { first_name: 'Robin', stage: 'Active', next_follow_up_at: '2020-01-01' })).json();
    assert.ok(c.id);
    const task = await (await call(env, '/api/tasks', 'POST', { contact_id: c.id, title: 'Call', due_at: '2020-01-01' })).json();
    assert.equal((await call(env, `/api/contacts/${c.id}/activity`, 'POST', { summary: 'Synthetic note' })).status, 201);
    assert.equal((await call(env, '/api/campaigns', 'POST', { name: 'Spring draft', body: 'Invented draft' })).status, 201);
    assert.equal((await (await call(env, '/api/summary')).json()).due, 1);
    assert.equal((await call(env, `/api/tasks/${task.id}`, 'PATCH', { completed: true })).status, 200);
    await call(env, `/api/contacts/${c.id}`, 'PATCH', { archived: 1 });
    const snapshot = await (await call(env, '/api/backup', 'POST', {})).json();
    assert.equal(snapshot.contacts.length, 1);
    assert.equal(snapshot.contacts[0].archived, 1);
    assert.equal(snapshot.activities.length, 1);
    assert.equal(snapshot.schema_version, 1);
    const restored = setup(t);
    for (const table of ['contacts', 'tasks', 'activities', 'campaigns']) {
        const records = snapshot[table];
        await restored.DB.batch(records.map(row => restored.DB.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`).bind(...Object.values(row))));
        assert.deepEqual((await restored.DB.prepare(`SELECT * FROM ${table}`).all()).results, records);
    }
    assert.deepEqual((await restored.DB.prepare('PRAGMA foreign_key_check').all()).results, []);
});
test('rejects malformed input, dates, unknown patch keys and missing IDs', async (t) => { const env = setup(t); const c = await (await call(env, '/api/contacts', 'POST', { first_name: 'A' })).json(); for (const body of [{ surprise: 'x' }, { first_name: '' }, { archived: 'false' }, { next_follow_up_at: '2025-02-30' }, { email: [] }, { notes: 'x'.repeat(5001) }])
    assert.equal((await call(env, `/api/contacts/${c.id}`, 'PATCH', body)).status, 400); assert.equal((await call(env, '/api/contacts/999', 'PATCH', { notes: 'A' })).status, 404); assert.equal((await call(env, '/api/contacts/0', 'PATCH', { notes: 'A' })).status, 400); assert.equal((await api.handleApi(new Request('https://demo.example/api/contacts', { method: 'POST', body: '{' }), env)).status, 400); assert.equal((await call(env, '/api/restore', 'POST', {})).status, 404); });
test('CSV protects formula cells and preserves quotes/newlines', async (t) => { const env = setup(t); await call(env, '/api/contacts', 'POST', { first_name: '=SUM(1)', notes: '"quoted"\nline' }); const r = await call(env, '/api/export/contacts.csv'); assert.match(await r.text(), /'=SUM\(1\)/); });
test('typed IDs and noncanonical timestamps cannot create tasks', async (t) => { const env = setup(t); const c = await (await call(env, '/api/contacts', 'POST', { first_name: 'A' })).json(); for (const data of [{ contact_id: true, title: 'Bad' }, { contact_id: c.id, title: 'Bad', due_at: '2026-10-01T24:00:00Z' }])
    assert.equal((await call(env, '/api/tasks', 'POST', data)).status, 400); assert.deepEqual(await (await call(env, '/api/tasks')).json(), []); });
test('D1 test batch rolls back prior mutations on failure', async (t) => { const env = setup(t); await assert.rejects(env.DB.batch([env.DB.prepare("INSERT INTO contacts(first_name,created_at,updated_at) VALUES('A','x','x')"), env.DB.prepare("INSERT INTO tasks(contact_id,title,created_at) VALUES(999,'Bad','x')")])); assert.deepEqual(await (await call(env, '/api/contacts')).json(), []); });
test('large imports preserve cross-chunk duplicates with bounded query count', async (t) => { const env = setup(t); let queryCount = 0; const original = env.DB.batch.bind(env.DB); env.DB.batch = async (statements) => { queryCount += statements.length; return original(statements); }; const contacts = Array.from({ length: 1249 }, (_, i) => ({ first_name: `Synthetic ${i}`, notes: 'Preserved notes' })); contacts[1248] = { ...contacts[0] }; const response = await call(env, '/api/import/contacts', 'POST', { contacts }); assert.equal(response.status, 201); assert.deepEqual(await response.json(), { imported: 1248, duplicates_skipped: 1, invalid_skipped: 0 }); assert.ok(queryCount <= 50); });
test('import chunk failure rolls back every earlier chunk', async (t) => { const env = setup(t); env.DB.exec("CREATE TRIGGER reject_synthetic BEFORE INSERT ON contacts WHEN NEW.first_name='Reject' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;"); const contacts = Array.from({ length: 150 }, (_, i) => ({ first_name: i === 149 ? 'Reject' : `Synthetic ${i}` })); assert.equal((await call(env, '/api/import/contacts', 'POST', { contacts })).status, 500); assert.deepEqual(await (await call(env, '/api/contacts')).json(), []); });
test('search accepts long text beyond D1 LIKE pattern limit', async (t) => { const env = setup(t); const street = 'A'.repeat(100); await call(env, '/api/contacts', 'POST', { first_name: 'Search', street_address: street }); const rows = await (await call(env, '/api/contacts?q=' + street)).json(); assert.equal(rows.length, 1); });
test('5000-record import needs at most 50 statements', async (t) => { const env = setup(t); let count = 0; const batch = env.DB.batch.bind(env.DB); env.DB.batch = async (statements) => { count += statements.length; return batch(statements); }; const contacts = Array.from({ length: 5000 }, (_, i) => ({ first_name: `Generated ${i}` })); const r = await call(env, '/api/import/contacts', 'POST', { contacts }); assert.equal(r.status, 201); assert.equal((await r.json()).imported, 5000); assert.ok(count <= 50); });
test('escaped control notes split into byte-bounded chunks unchanged', async (t) => { const env = setup(t); const contacts = Array.from({ length: 200 }, (_, i) => ({ first_name: `Control ${i}`, notes: '\u0001'.repeat(5000) })); const result = await call(env, '/api/import/contacts', 'POST', { contacts }); assert.equal(result.status, 201); assert.equal((await result.json()).imported, 200); const rows = await (await call(env, '/api/contacts')).json(); assert.equal(rows[0].notes, '\u0001'.repeat(5000)); });
test('NUL input is rejected before SQLite can silently shorten it', async (t) => { const env = setup(t); assert.equal((await call(env, '/api/import/contacts', 'POST', { contacts: [{ first_name: 'OK' }, { first_name: 'Bad', notes: 'a\u0000b' }] })).status, 400); assert.deepEqual(await (await call(env, '/api/contacts')).json(), []); });
