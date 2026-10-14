// Calendar feed and occasion helpers. Dates stay as YYYY-MM-DD strings.
const TOKEN_KEY = 'calendar_token';
const FEED_WINDOW_DAYS = 90;

export function newCalendarToken() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function readToken(DB) {
    const row = await DB.prepare('SELECT value FROM settings WHERE key=?').bind(TOKEN_KEY).first();
    return typeof row?.value === 'string' ? row.value : '';
}

export async function calendarToken(DB) {
    const existing = await readToken(DB);
    if (existing)
        return existing;
    const token = newCalendarToken();
    await DB.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').bind(TOKEN_KEY, token).run();
    return token;
}

export async function rotateCalendarToken(DB) {
    const token = newCalendarToken();
    await DB.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').bind(TOKEN_KEY, token).run();
    return token;
}

export async function validCalendarToken(request, DB) {
    try {
        const token = new URL(request.url).searchParams.get('token') || '';
        if (!/^[0-9a-f]{48}$/.test(token))
            return false;
        const stored = await readToken(DB);
        return stored === token;
    }
    catch {
        // Missing table or read failure never grants access.
        return false;
    }
}

// Next occurrence of a yearly occasion (birthday/anniversary) on or after today.
export function nextOccurrence(day, today) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{4}-\d{2}-\d{2}$/.test(today))
        return null;
    const monthDay = day.slice(5);
    const year = today.slice(0, 4);
    let date = `${year}-${monthDay}`;
    if (date < today)
        date = `${Number(year) + 1}-${monthDay}`;
    const daysUntil = Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
    return { date, daysUntil };
}

export function upcomingOccasions(rows, today, days = 30) {
    const occasions = [];
    for (const row of rows) {
        for (const [value, kind] of [[row.birthday, 'Birthday'], [row.anniversary, 'Anniversary']]) {
            if (!value)
                continue;
            const next = nextOccurrence(value, today);
            if (next && next.daysUntil <= days)
                occasions.push({ contact_id: row.id, name: [row.first_name, row.last_name].filter(Boolean).join(' '), kind, date: next.date, days_until: next.daysUntil });
        }
    }
    return occasions.sort((a, b) => a.days_until - b.days_until || a.name.localeCompare(b.name));
}

export async function occasionRows(DB, today, days) {
    const rows = await DB.prepare("SELECT id,first_name,last_name,birthday,anniversary FROM contacts WHERE archived=0 AND (birthday!='' OR anniversary!='')").all();
    return upcomingOccasions(rows.results, today, days);
}

const icsEscape = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsDay = (day) => /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.replaceAll('-', '') : '';

function icsEvent({ uid, day, summary, description = '' }) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    return 'BEGIN:VEVENT\r\n' +
        `UID:${uid}\r\n` +
        `DTSTAMP:${stamp}\r\n` +
        `DTSTART;VALUE=DATE:${icsDay(day)}\r\n` +
        `SUMMARY:${icsEscape(summary)}\r\n` +
        (description ? `DESCRIPTION:${icsEscape(description)}\r\n` : '') +
        'END:VEVENT\r\n';
}

export function buildCalendar({ tasks = [], followUps = [], occasions = [] }) {
    const events = [];
    for (const task of tasks)
        events.push(icsEvent({ uid: `task-${task.id}@matt-realty-desk`, day: String(task.due_at || '').slice(0, 10), summary: `Reminder: ${task.title}${task.contact_name ? ` (${task.contact_name})` : ''}`, description: task.contact_name ? `Reminder for ${task.contact_name}.` : 'Reminder.' }));
    for (const contact of followUps)
        events.push(icsEvent({ uid: `contact-${contact.id}-followup@matt-realty-desk`, day: String(contact.next_follow_up_at || '').slice(0, 10), summary: `Follow up: ${[contact.first_name, contact.last_name].filter(Boolean).join(' ')}`, description: 'Relationship follow-up due.' }));
    for (const occasion of occasions)
        events.push(icsEvent({ uid: `contact-${occasion.contact_id}-${occasion.kind.toLowerCase()}@matt-realty-desk`, day: occasion.date, summary: `${occasion.name}: ${occasion.kind.toLowerCase()}`, description: `${occasion.kind} for ${occasion.name}.` }));
    return 'BEGIN:VCALENDAR\r\n' +
        'VERSION:2.0\r\n' +
        'PRODID:-//Matt Realty Desk//EN\r\n' +
        'CALSCALE:GREGORIAN\r\n' +
        'X-WR-CALNAME:Matt Realty Desk\r\n' +
        'X-PUBLISHED-TTL:PT12H\r\n' +
        events.join('') +
        'END:VCALENDAR\r\n';
}

// Serves the feed for signed-in sessions (worker also allows a valid feed token).
export async function handleCalendarFeed(request, env) {
    const url = new URL(request.url);
    const days = Math.min(Math.max(Number(url.searchParams.get('days')) || FEED_WINDOW_DAYS, 1), 180);
    const today = new Date().toISOString().slice(0, 10);
    const horizon = new Date(Date.parse(today) + days * 86400000).toISOString().slice(0, 10);
    const [tasks, followUps, occasions] = await Promise.all([
        env.DB.prepare("SELECT t.id,t.title,t.due_at,trim(c.first_name||' '||c.last_name) AS contact_name FROM tasks t LEFT JOIN contacts c ON c.id=t.contact_id WHERE t.completed_at IS NULL AND t.due_at IS NOT NULL AND date(t.due_at)<=date(?) ORDER BY t.due_at").bind(horizon).all(),
        env.DB.prepare('SELECT id,first_name,last_name,next_follow_up_at FROM contacts WHERE archived=0 AND next_follow_up_at IS NOT NULL AND date(next_follow_up_at)<=date(?) ORDER BY next_follow_up_at').bind(horizon).all(),
        occasionRows(env.DB, today, days),
    ]);
    return new Response(buildCalendar({ tasks: tasks.results, followUps: followUps.results, occasions }), {
        headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': 'inline; filename="matt-realty-desk.ics"',
            'Cache-Control': 'no-store',
        },
    });
}
