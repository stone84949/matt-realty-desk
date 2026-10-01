import { DatabaseSync } from 'node:sqlite';
export class TestD1 {
    constructor() { this.sqlite = new DatabaseSync(':memory:'); this.sqlite.exec('PRAGMA foreign_keys=ON'); }
    exec(sql) { this.sqlite.exec(sql); }
    prepare(sql) {
        const db = this.sqlite;
        const make = (args = []) => ({
            bind: (...values) => make(values),
            run: async () => { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
            all: async () => ({ success: true, results: db.prepare(sql).all(...args).map(r => ({ ...r })) }),
            first: async () => { const r = db.prepare(sql).get(...args); return r ? { ...r } : null; },
            execute: () => { const stmt = db.prepare(sql); if (/^\s*SELECT/i.test(sql))
                return { success: true, results: stmt.all(...args).map(r => ({ ...r })) }; const r = stmt.run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
        });
        return make();
    }
    async batch(statements) { this.sqlite.exec('BEGIN'); try {
        const result = statements.map(s => s.execute());
        this.sqlite.exec('COMMIT');
        return result;
    }
    catch (error) {
        this.sqlite.exec('ROLLBACK');
        throw error;
    } }
    close() { this.sqlite.close(); }
}
