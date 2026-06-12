/**
 * db.js — Conexión a MySQL usando mysql2 con pool de conexiones.
 * Lee las credenciales EXCLUSIVAMENTE desde variables de entorno (.env).
 */
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host:     process.env.DB_HOST     || '127.0.0.1',
    port:     process.env.DB_PORT     || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'worldcup_betting',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;
