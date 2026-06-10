const { DatabaseSync } = require('node:sqlite');
const conn = new DatabaseSync('database/worldcup_betting.db');

const tables = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('\n=== TABLAS ===');
tables.forEach(t => console.log(' -', t.name));

console.log('\n=== USUARIOS ===');
const users = conn.prepare('SELECT id, username, balance FROM users').all();
console.log(JSON.stringify(users, null, 2));

console.log('\n=== PARTIDOS ===');
const matches = conn.prepare('SELECT id, team_a, team_b, match_date, status FROM matches').all();
console.log(JSON.stringify(matches, null, 2));

console.log('\n=== APUESTAS ===');
const bets = conn.prepare('SELECT * FROM bets').all();
console.log(JSON.stringify(bets, null, 2));

conn.close();
