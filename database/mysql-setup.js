/**
 * mysql-setup.js — Inicializa la base de datos MySQL con tablas y datos de ejemplo.
 * Ejecutar UNA SOLA VEZ con: node database/mysql-setup.js
 */
require('dotenv').config();
const mysql  = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function setup() {
    // Conectarse sin seleccionar DB para poder crearla
    const conn = await mysql.createConnection({
        host:     process.env.DB_HOST     || '127.0.0.1',
        port:     process.env.DB_PORT     || 3306,
        user:     process.env.DB_USER     || 'root',
        password: process.env.DB_PASSWORD || ''
    });

    console.log('✅ Conectado a MySQL.');

    // ── Crear base de datos ────────────────────────────────────────────────────
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'worldcup_betting'}\``);
    await conn.query(`USE \`${process.env.DB_NAME || 'worldcup_betting'}\``);
    console.log(`✅ Base de datos "${process.env.DB_NAME || 'worldcup_betting'}" lista.`);

    // ── Tabla users ────────────────────────────────────────────────────────────
    await conn.execute(`
        CREATE TABLE IF NOT EXISTS users (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            username     VARCHAR(50)  NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            balance      DECIMAL(10,2) DEFAULT 1000.00,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('✅ Tabla "users" lista.');

    // ── Tabla matches ──────────────────────────────────────────────────────────
    await conn.execute(`
        CREATE TABLE IF NOT EXISTS matches (
            id             INT AUTO_INCREMENT PRIMARY KEY,
            team_a         VARCHAR(100) NOT NULL,
            team_b         VARCHAR(100) NOT NULL,
            match_date     DATETIME     NOT NULL,
            status         ENUM('pending','completed') DEFAULT 'pending',
            score_a        INT DEFAULT NULL,
            score_b        INT DEFAULT NULL,
            odds_a         DECIMAL(5,2) NOT NULL,
            odds_draw      DECIMAL(5,2) NOT NULL,
            odds_b         DECIMAL(5,2) NOT NULL,
            recent_form_a  VARCHAR(50)  NOT NULL,
            recent_form_b  VARCHAR(50)  NOT NULL,
            absences_a     TEXT         NOT NULL,
            absences_b     TEXT         NOT NULL,
            h2h            TEXT         NOT NULL,
            home_advantage TEXT         NOT NULL,
            motivation     TEXT         NOT NULL
        )
    `);
    console.log('✅ Tabla "matches" lista.');

    // ── Tabla bets ─────────────────────────────────────────────────────────────
    await conn.execute(`
        CREATE TABLE IF NOT EXISTS bets (
            id                INT AUTO_INCREMENT PRIMARY KEY,
            user_id           INT NOT NULL,
            match_id          INT NOT NULL,
            predicted_score_a INT NOT NULL,
            predicted_score_b INT NOT NULL,
            created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id)  REFERENCES users(id),
            FOREIGN KEY (match_id) REFERENCES matches(id)
        )
    `);
    console.log('✅ Tabla "bets" lista.');

    // ── Seed: Usuarios de prueba ───────────────────────────────────────────────
    const testUsers = [
        { username: 'admin', password: 'admin123', balance: 5000.00 },
        { username: 'juan',  password: 'juan123',  balance: 1500.00 },
        { username: 'maria', password: 'maria123', balance: 2500.00 }
    ];

    for (const u of testUsers) {
        const [existing] = await conn.execute('SELECT id FROM users WHERE username = ?', [u.username]);
        if (existing.length === 0) {
            const hash = await bcrypt.hash(u.password, 10);
            await conn.execute(
                'INSERT INTO users (username, password_hash, balance) VALUES (?, ?, ?)',
                [u.username, hash, u.balance]
            );
            console.log(`✅ Usuario creado: ${u.username} (contraseña: ${u.password})`);
        } else {
            console.log(`ℹ️  Usuario ya existe: ${u.username}`);
        }
    }

    // ── Seed: Partidos del Mundial 2026 ────────────────────────────────────────
    const [matchRows] = await conn.execute('SELECT COUNT(*) as count FROM matches');
    if (matchRows[0].count === 0) {
        const matches = [
            ['Canadá',    'Brasil',    '2026-06-11 15:00:00', 5.50, 3.80, 1.65, 'G-E-G-P-E', 'G-G-P-G-G',
             'Ninguna baja clave. Plantilla completa al 100%.',
             'Neymar Jr. (ligamento cruzado), Gabriel Magalhães (suspensión por tarjetas).',
             'Últimos 3 H2H: 2 victorias Brasil (3-1, 2-0), 1 empate (1-1).',
             'BMO Field Toronto. Clima frío, estadio lleno con apoyo masivo local.',
             'Partido inaugural. Canadá busca la sorpresa histórica en casa; Brasil con presión de favorito.'],

            ['México',    'Alemania',  '2026-06-12 18:00:00', 3.80, 3.40, 2.05, 'P-G-E-G-P', 'G-G-E-P-G',
             'Edson Álvarez (duda por molestias en el muslo, se decide en calentamiento).',
             'Jamal Musiala (lesión muscular confirmada), Marc-André Ter Stegen (recuperación de cirugía).',
             'Historial mundiales: Alemania 2 victorias, México 1 victoria histórica (Rusia 2018).',
             'Estadio Azteca, CDMX. Altitud 2,240m y humedad que desgastan a selecciones europeas.',
             'Primer partido de grupo. Vital para el liderato y evitar cruces complicados.'],

            ['EE. UU.',  'Inglaterra','2026-06-13 20:00:00', 4.10, 3.50, 1.95, 'G-P-G-E-G', 'G-G-E-G-P',
             'Sergiño Dest (lesión de rodilla, fuera de la convocatoria).',
             'Harry Kane (molestia en tobillo, entre algodones), Jude Bellingham (suspensión, 1 partido).',
             'H2H mundiales: 1 victoria EE.UU. (1950), 1 empate (2010). Inglaterra nunca les ha ganado.',
             'MetLife Stadium, Nueva Jersey. 70% afición americana estimada.',
             'Derbi transatlántico de alta rivalidad. EE.UU. busca demostrar crecimiento.'],

            ['Argentina','España',    '2026-06-14 16:00:00', 2.45, 3.10, 3.00, 'G-G-G-E-G', 'G-E-G-G-G',
             'Enzo Fernández (duda por pubalgia, posible suplente inicial).',
             'Gavi (rotura de ligamentos, baja total), Pedri (tobillo, media intensidad).',
             'Amistosos recientes: España ganó 6-1 (2018), Argentina ganó 4-1 (2010).',
             'Hard Rock Stadium, Miami. Calor húmedo. Mayoría afición argentina local.',
             'Último mundial de Messi. Motivación extrema albiceleste; España hambrienta con generación joven.'],

            ['Francia',  'Portugal',  '2026-06-15 14:00:00', 2.15, 3.20, 3.60, 'G-E-G-P-G', 'G-G-P-G-E',
             'Kylian Mbappé (fractura nasal, jugará con máscara de carbono), Camavinga (duda de rodilla).',
             'Cristiano Ronaldo (sobrecarga gemelar, podría no ser titular).',
             'H2H reciente: Francia venció en semis Mundial 2006 (1-0); Portugal ganó final Euro 2016 (1-0).',
             'SoFi Stadium, Los Ángeles. Techado, clima controlado, terreno neutral.',
             'Duelo de titanes. Francia busca redimir 2022; Portugal en la despedida de Cristiano Ronaldo.']
        ];

        for (const m of matches) {
            await conn.execute(
                `INSERT INTO matches (team_a, team_b, match_date, odds_a, odds_draw, odds_b,
                    recent_form_a, recent_form_b, absences_a, absences_b, h2h, home_advantage, motivation)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                m
            );
        }
        console.log('✅ 5 partidos del Mundial 2026 insertados.');
    } else {
        console.log('ℹ️  Partidos ya existen. Saltando seed.');
    }

    await conn.end();
    console.log('\n🎉 ¡Setup completado! Puedes arrancar el servidor con:');
    console.log('   .node-portable\\node-v20.11.1-win-x64\\node.exe backend/server.js\n');
}

setup().catch(err => {
    console.error('❌ Error en el setup:', err.message);
    process.exit(1);
});
