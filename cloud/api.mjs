const IMPORT = { first_name: 100, last_name: 100, email: 250, phone: 50, street_address: 250, address_line_2: 100, city: 100, state: 50, postal_code: 30, type: 50, source: 100, notes: 5000 };
const CONTACT = { ...IMPORT, stage: 50, email_permission: 50, next_follow_up_at: 40, archived: 1 };
const EXPORT = ['first_name', 'last_name', 'email', 'phone', 'street_address', 'address_line_2', 'city', 'state', 'postal_code', 'type', 'stage', 'source', 'email_permission', 'notes'];
class InputError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = (message, status) => { throw new InputError(message, status); };
const stamp = () => new Date().toISOString();
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
function object(data) { if (!data || typeof data !== 'object' || Array.isArray(data))
    fail('Expected a JSON object'); return data; }
function text(value, field, limit, required = false) { if (value === undefined || value === null)
    value = ''; if (typeof value !== 'string')
    fail(`${field} must be text`); if (value.includes('\u0000'))
    fail(field + ' contains an unsupported NUL character'); value = value.trim(); if (value.length > limit)
    fail(`${field} exceeds ${limit} characters`); if (required && !value)
    fail(`${field} is required`); return value; }
function date(value, field) { const v = text(value, field, 40); if (!v)
    return null; const m = /^(\d{4}-\d{2}-\d{2})(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(v); if (!m || !Number.isFinite(Date.parse(v)) || new Date(m[1]).toISOString().slice(0, 10) !== m[1])
    fail(`${field} must be a valid ISO date`); return v; }
function id(value) { if (typeof value !== 'number' && typeof value !== 'string')
    fail('Invalid ID'); if (typeof value === 'string' && !/^[1-9]\d*$/.test(value))
    fail('Invalid ID'); const n = Number(value); if (!Number.isSafeInteger(n) || n <= 0)
    fail('Invalid ID'); return n; }
function fields(data, allowed) { object(data); if (Object.keys(data).some(k => !Object.hasOwn(allowed, k)))
    fail('Unsupported field'); }
function contactValues(data, partial = false) { fields(data, CONTACT); const r = {}; for (const [k, l] of Object.entries(CONTACT)) {
    if (partial && !Object.hasOwn(data, k))
        continue;
    if (k === 'archived') {
        if (data[k] === undefined) {
            if (!partial)
                r[k] = 0;
        }
        else if (data[k] === 0 || data[k] === 1 || typeof data[k] === 'boolean')
            r[k] = Number(data[k]);
        else
            fail('archived must be boolean or 0/1');
    }
    else if (k === 'next_follow_up_at')
        r[k] = date(data[k], k);
    else
        r[k] = text(data[k], k, l, k === 'first_name');
} if (!partial) {
    r.type ||= 'Prospect';
    r.stage ||= 'New';
    r.email_permission ||= 'Not asked';
} return r; }
async function body(request) { const raw = await request.text(); if (new TextEncoder().encode(raw).length > 10000000)
    fail('Request is too large', 413); try {
    return object(JSON.parse(raw || '{}'));
}
catch (e) {
    if (e instanceof InputError)
        throw e;
    fail('Malformed JSON');
} }
const statement = (DB, sql, args = []) => DB.prepare(sql).bind(...args);
const all = async (DB, sql, args = []) => (await statement(DB, sql, args).all()).results;
const first = (DB, sql, args = []) => statement(DB, sql, args).first();
async function existing(DB, table, n) { const r = await first(DB, `SELECT * FROM ${table} WHERE id=?`, [n]); if (!r)
    fail('Not found', 404); return r; }
async function insert(DB, table, values) { const keys = Object.keys(values); const r = await statement(DB, `INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`, Object.values(values)).run(); return existing(DB, table, r.meta.last_row_id); }
async function importContacts(DB, incoming) {
    if (!Array.isArray(incoming) || !incoming.length)
        fail('No contacts were found in that file');
    if (incoming.length > 5000)
        fail('Import up to 5,000 contacts at a time');
    let invalid = 0;
    const prepared = [];
    for (const item of incoming) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            invalid++;
            continue;
        }
        fields(item, IMPORT);
        const contact = {};
        for (const [field, limit] of Object.entries(IMPORT))
            contact[field] = text(item[field], field, limit);
        if (!contact.first_name && contact.last_name) {
            contact.first_name = contact.last_name;
            contact.last_name = '';
        }
        if (!contact.first_name) {
            invalid++;
            continue;
        }
        contact.email = contact.email.toLowerCase();
        contact.type ||= 'Prospect';
        contact.source ||= 'Imported contact';
        prepared.push(contact);
    }
    const keys = Object.keys(IMPORT);
    const time = stamp();
    const statements = [];
    // Chunk by both record count and UTF-8 bytes, including JSON escapes.
    // Keep every bound value below 1 MB, within D1's 2 MB limit.
    const sql = `WITH incoming AS (
    SELECT DISTINCT ${keys.map(k => `json_extract(value, '$.${k}') AS ${k}`).join(',')}
    FROM json_each(?)
  ) INSERT INTO contacts(${keys.join(',')},stage,email_permission,created_at,updated_at)
    SELECT ${keys.map(k => `incoming.${k}`).join(',')},'New','Not asked',?,?
    FROM incoming WHERE NOT EXISTS (
      SELECT 1 FROM contacts WHERE archived=0 AND
      ${keys.map(k => `contacts.${k}=incoming.${k}`).join(' AND ')}
    )`;
    let chunk = [], bytes = 2;
    const flush = () => {
        if (chunk.length)
            statements.push(statement(DB, sql, ['[' + chunk.join(',') + ']', time, time]));
        chunk = [];
        bytes = 2;
    };
    for (const contact of prepared) {
        const encoded = JSON.stringify(contact);
        const size = new TextEncoder().encode(encoded).length;
        if (chunk.length && (chunk.length === 100 || bytes + size + 1 > 1000000))
            flush();
        chunk.push(encoded);
        bytes += size + 1;
    }
    flush();
    // D1 batch is transactional: later chunk failure rolls back earlier chunks.
    const results = statements.length ? await DB.batch(statements) : [];
    const imported = results.reduce((count, result) => count + Number(result.meta.changes), 0);
    return { imported, duplicates_skipped: prepared.length - imported, invalid_skipped: invalid };
}
function csvCell(value) { let v = String(value ?? ''); if (/^[\s]*[=+\-@]/.test(v) || /^[\t\r\n]/.test(v))
    v = "'" + v; return '"' + v.replaceAll('"', '""') + '"'; }
export async function handleApi(request, env) {
    try {
        const url = new URL(request.url), path = url.pathname, method = request.method, DB = env.DB;
        if (method === 'GET') {
            if (path === '/api/runtime')
                return json({ hosted: true, assistant: false, voice: false, backup: 'download' });
            if (path === '/api/health')
                return json({ ok: true });
            if (path === '/api/contacts') {
                const q = text(url.searchParams.get('q'), 'q', 250), stage = text(url.searchParams.get('stage'), 'stage', 50);
                let sql = 'SELECT * FROM contacts WHERE archived=0', args = [];
                if (q) {
                    sql += " AND (" + ["first_name||' '||last_name", 'email', 'phone', 'street_address', 'address_line_2', 'city', 'state', 'postal_code'].map(k => `instr(lower(${k}), lower(?)) > 0`).join(' OR ') + ')';
                    args = Array(8).fill(q);
                }
                if (stage) {
                    sql += ' AND stage=?';
                    args.push(stage);
                }
                return json(await all(DB, sql + ' ORDER BY updated_at DESC', args));
            }
            if (path === '/api/tasks')
                return json(await all(DB, "SELECT t.*,trim(c.first_name||' '||c.last_name) AS contact_name FROM tasks t LEFT JOIN contacts c ON c.id=t.contact_id WHERE t.completed_at IS NULL ORDER BY due_at IS NULL,due_at,t.id DESC"));
            if (path === '/api/campaigns')
                return json(await all(DB, 'SELECT * FROM campaigns ORDER BY updated_at DESC'));
            if (path === '/api/summary') {
                const today = new Intl.DateTimeFormat('en-CA', { timeZone: env.TIME_ZONE || 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
                const results = await DB.batch([statement(DB, 'SELECT COUNT(*) AS n FROM contacts WHERE archived=0'), statement(DB, "SELECT COUNT(*) AS n FROM contacts WHERE archived=0 AND stage IN ('Active','Under Contract')"), statement(DB, 'SELECT COUNT(*) AS n FROM tasks WHERE completed_at IS NULL AND (due_at IS NULL OR date(due_at)<=date(?))', [today]), statement(DB, 'SELECT COUNT(*) AS n FROM contacts WHERE archived=0 AND next_follow_up_at IS NOT NULL AND date(next_follow_up_at)<=date(?)', [today])]);
                return json(Object.fromEntries(['contacts', 'active', 'due', 'overdueFollowUps'].map((k, i) => [k, results[i].results[0].n])));
            }
            const activity = /^\/api\/contacts\/([^/]+)\/activity$/.exec(path);
            if (activity) {
                const n = id(activity[1]);
                await existing(DB, 'contacts', n);
                return json(await all(DB, 'SELECT * FROM activities WHERE contact_id=? ORDER BY occurred_at DESC', [n]));
            }
            if (path === '/api/export/contacts.csv') {
                const rows = await all(DB, `SELECT ${EXPORT.join(',')} FROM contacts WHERE archived=0 ORDER BY last_name,first_name`);
                return new Response(EXPORT.join(',') + '\r\n' + rows.map(r => EXPORT.map(k => csvCell(r[k])).join(',')).join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename=matt-realty-contacts.csv', 'Cache-Control': 'no-store' } });
            }
        }
        if (method === 'POST') {
            const data = await body(request);
            if (path === '/api/contacts') {
                const time = stamp();
                return json(await insert(DB, 'contacts', { ...contactValues(data), created_at: time, updated_at: time }), 201);
            }
            if (path === '/api/import/contacts') {
                fields(data, { contacts: 1 });
                return json(await importContacts(DB, data.contacts), 201);
            }
            if (path === '/api/tasks') {
                fields(data, { contact_id: 1, title: 300, due_at: 40, priority: 30 });
                const contact_id = data.contact_id === undefined || data.contact_id === null || data.contact_id === '' ? null : id(data.contact_id);
                if (contact_id)
                    await existing(DB, 'contacts', contact_id);
                return json(await insert(DB, 'tasks', { contact_id, title: text(data.title, 'title', 300, true), due_at: date(data.due_at, 'due_at'), priority: text(data.priority, 'priority', 30) || 'Normal', created_at: stamp() }), 201);
            }
            if (path === '/api/campaigns') {
                fields(data, { name: 200, channel: 30, audience: 200, subject: 300, body: 20000 });
                const time = stamp();
                return json(await insert(DB, 'campaigns', { name: text(data.name, 'name', 200, true), channel: text(data.channel, 'channel', 30) || 'Email', audience: text(data.audience, 'audience', 200) || 'All opted-in contacts', subject: text(data.subject, 'subject', 300), body: text(data.body, 'body', 20000), status: 'Draft', created_at: time, updated_at: time }), 201);
            }
            const activity = /^\/api\/contacts\/([^/]+)\/activity$/.exec(path);
            if (activity) {
                fields(data, { kind: 30, summary: 5000 });
                const n = id(activity[1]);
                await existing(DB, 'contacts', n);
                const summary = text(data.summary, 'summary', 5000, true), kind = text(data.kind, 'kind', 30) || 'Note', time = stamp();
                const results = await DB.batch([statement(DB, 'INSERT INTO activities(contact_id,kind,summary,occurred_at) VALUES(?,?,?,?)', [n, kind, summary, time]), statement(DB, 'UPDATE contacts SET last_contact_at=?,updated_at=? WHERE id=?', [time, time, n])]);
                return json({ id: results[0].meta.last_row_id }, 201);
            }
            if (path === '/api/backup') {
                fields(data, {});
                const tables = ['contacts', 'tasks', 'activities', 'campaigns'];
                const results = await DB.batch(tables.map(t => statement(DB, `SELECT * FROM ${t} ORDER BY id`)));
                return json({ schema_version: 1, ...Object.fromEntries(tables.map((t, i) => [t, results[i].results])), created_at: stamp() }, 200, { 'Content-Disposition': 'attachment; filename=matt-realty-backup.json' });
            }
        }
        if (method === 'PATCH') {
            const match = /^\/api\/(contacts|tasks)\/([^/]+)$/.exec(path);
            if (match) {
                const table = match[1], n = id(match[2]), data = await body(request);
                let values;
                if (table === 'contacts') {
                    values = contactValues(data, true);
                    if (!Object.keys(values).length)
                        fail('No supported fields');
                    values.updated_at = stamp();
                }
                else {
                    fields(data, { completed: 1 });
                    if (typeof data.completed !== 'boolean')
                        fail('completed must be boolean');
                    values = { completed_at: data.completed ? stamp() : null };
                }
                await existing(DB, table, n);
                await statement(DB, `UPDATE ${table} SET ${Object.keys(values).map(k => `${k}=?`).join(',')} WHERE id=?`, [...Object.values(values), n]).run();
                return json(table === 'contacts' ? await existing(DB, table, n) : { ok: true });
            }
        }
        return json({ error: 'Not found' }, 404);
    }
    catch (error) {
        if (error instanceof InputError)
            return json({ error: error.message }, error.status);
        return json({ error: 'Database request failed' }, 500);
    }
}
