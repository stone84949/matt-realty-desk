import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../worker.mjs';
import { TestD1 } from './d1-test-adapter.mjs';
const api = await import('../api.mjs');
const calendar = await import('../calendar.mjs');

const MIGRATIONS = ['0001-crm.sql', '0002-assistant.sql', '0003-occasions-and-settings.sql'];
function setup(t) {
    const DB = new TestD1();
    for (const file of MIGRATIONS)
        DB.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
    t.after(() => DB.close());
    return { DB };
}
async function call(env, path, method = 'GET', body) {
    return api.handleApi(new Request('https://demo.example' + path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }) }), env);
}
const today = new Date().toISOString().slice(0, 10);
const inDays = (n) => new Date(Date.parse(today) + n * 86400000).toISOString().slice(0, 10);

test('feed token is created once, rotated on demand, and only the stored token validates', async (t) => {
    const env = setup(t);
    const first = await calendar.calendarToken(env.DB);
    const again = await calendar.calendarToken(env.DB);
    assert.match(first, /^[0-9a-f]{48}$/);
    assert.equal(again, first);
    const request = (query) => new Request(`https://demo.example/api/calendar.ics${query}`);
    assert.equal(await calendar.validCalendarToken(request(`?token=${first}`), env.DB), true);
    assert.equal(await calendar.validCalendarToken(request('?token=deadbeef'), env.DB), false);
    assert.equal(await calendar.validCalendarToken(request(''), env.DB), false);
    const rotated = await calendar.rotateCalendarToken(env.DB);
    assert.notEqual(rotated, first);
    assert.equal(await calendar.validCalendarToken(request(`?token=${first}`), env.DB), false);
    assert.equal(await calendar.validCalendarToken(request(`?token=${rotated}`), env.DB), true);
});

test('worker serves the feed to anonymous callers only with the exact token', async (t) => {
    const env = setup(t);
    const feed = (query) => worker.fetch(new Request(`https://crm.example.test/api/calendar.ics${query}`), env);
    assert.equal((await feed('')).status, 401);
    assert.equal((await feed('?token=not-a-token')).status, 401);
    await call(env, '/api/contacts', 'POST', { first_name: 'Ada', last_name: 'Buyer', next_follow_up_at: inDays(5) });
    const token = await calendar.calendarToken(env.DB);
    const response = await feed(`?token=${token}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'text/calendar; charset=utf-8');
    const body = await response.text();
    assert.match(body, /^BEGIN:VCALENDAR\r\n/);
    assert.match(body, /Follow up: Ada Buyer/);
    const rotated = await calendar.rotateCalendarToken(env.DB);
    assert.equal((await feed(`?token=${token}`)).status, 401);
    assert.equal((await feed(`?token=${rotated}`)).status, 200);
});

test('signed-in feed download includes reminders, follow-ups and occasions within the window', async (t) => {
    const env = setup(t);
    const contact = await (await call(env, '/api/contacts', 'POST', { first_name: 'Sam', last_name: 'Seller', email: 'sam@example.com', next_follow_up_at: inDays(5), birthday: inDays(3) })).json();
    await call(env, '/api/tasks', 'POST', { contact_id: contact.id, title: 'Send comparative analysis', due_at: inDays(2) });
    await call(env, '/api/tasks', 'POST', { title: 'Far future task', due_at: inDays(200) });
    const response = await call(env, '/api/calendar.ics');
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.match(body, /SUMMARY:Reminder: Send comparative analysis \(Sam Seller\)/);
    assert.match(body, /SUMMARY:Follow up: Sam Seller/);
    assert.match(body, /SUMMARY:Sam Seller: birthday/);
    assert.ok(body.includes(`DTSTART;VALUE=DATE:${inDays(3).replaceAll('-', '')}`));
    assert.ok(body.endsWith('END:VCALENDAR\r\n'));
});
test('occasions endpoint lists only upcoming birthdays and anniversaries in the window', async (t) => {
    const env = setup(t);
    await call(env, '/api/contacts', 'POST', { first_name: 'Ann', last_name: 'Soon', birthday: inDays(3) });
    await call(env, '/api/contacts', 'POST', { first_name: 'Bob', last_name: 'Later', anniversary: inDays(40) });
    await call(env, '/api/contacts', 'POST', { first_name: 'Cara', last_name: 'Archived', birthday: inDays(1), archived: 1 });
    const rows = await (await call(env, '/api/occasions?days=30')).json();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'Ann Soon');
    assert.equal(rows[0].kind, 'Birthday');
    assert.equal(rows[0].date, inDays(3));
    assert.equal(rows[0].days_until, 3);
});

test('next occurrence wraps to next year and computes day distance', () => {
    assert.deepEqual(calendar.nextOccurrence('1990-12-31', '2026-12-25'), { date: '2026-12-31', daysUntil: 6 });
    assert.deepEqual(calendar.nextOccurrence('1990-12-31', '2026-12-31'), { date: '2026-12-31', daysUntil: 0 });
    assert.deepEqual(calendar.nextOccurrence('1990-01-02', '2026-12-25'), { date: '2027-01-02', daysUntil: 8 });
    assert.equal(calendar.nextOccurrence('not-a-date', '2026-12-25'), null);
});
test('contacts accept valid occasion dates and reject invalid ones', async (t) => {
    const env = setup(t);
    const contact = await (await call(env, '/api/contacts', 'POST', { first_name: 'Eve', last_name: 'Events', birthday: '1990-03-05' })).json();
    assert.equal(contact.birthday, '1990-03-05');
    assert.equal(contact.anniversary, '');
    assert.equal((await call(env, `/api/contacts/${contact.id}`, 'PATCH', { anniversary: '2020-06-15' })).status, 200);
    assert.equal((await call(env, `/api/contacts/${contact.id}`, 'PATCH', { birthday: '03/05/1990' })).status, 400);
    assert.equal((await call(env, `/api/contacts/${contact.id}`, 'PATCH', { anniversary: '' })).status, 200);
    const cleared = await (await call(env, '/api/contacts')).json();
    assert.equal(cleared.find((row) => row.id === contact.id).anniversary, '');
    const csv = await (await call(env, '/api/export/contacts.csv')).text();
    const header = csv.split('\r\n')[0];
    assert.ok(header.includes('birthday') && header.includes('anniversary'));
});

test('token endpoint returns the stable token and rotates only on explicit boolean', async (t) => {
    const env = setup(t);
    const first = await (await call(env, '/api/calendar/token', 'POST', {})).json();
    const again = await (await call(env, '/api/calendar/token', 'POST', { rotate: false })).json();
    assert.equal(again.token, first.token);
    const rotated = await (await call(env, '/api/calendar/token', 'POST', { rotate: true })).json();
    assert.notEqual(rotated.token, first.token);
    assert.equal((await call(env, '/api/calendar/token', 'POST', { rotate: 'yes' })).status, 400);
    assert.equal((await call(env, '/api/calendar/token', 'POST', { unexpected: 1 })).status, 400);
});
