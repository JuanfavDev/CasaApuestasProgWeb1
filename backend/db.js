const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(__dirname, '../database/worldcup_betting.db');
const db = new DatabaseSync(dbPath);

module.exports = {
    async execute(sql, params = []) {
        try {
            const isSelect = sql.trim().toLowerCase().startsWith('select');
            const stmt = db.prepare(sql);
            if (isSelect) {
                const rows = stmt.all(...params);
                return [rows, null];
            } else {
                const result = stmt.run(...params);
                return [{ insertId: result.lastInsertRowid, affectedRows: result.changes }, null];
            }
        } catch (err) {
            console.error('Database Error:', err);
            throw err;
        }
    }
};
