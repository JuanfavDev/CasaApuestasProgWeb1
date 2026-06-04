const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'worldcup_betting.db');

// Ensure database directory exists
if (!fs.existsSync(__dirname)) {
    fs.mkdirSync(__dirname, { recursive: true });
}

console.log(`Initializing SQLite database at: ${dbPath}`);
const db = new DatabaseSync(dbPath);

// Create Users Table
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        balance REAL DEFAULT 1000.0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
`);

// Try to alter table to add balance column if it doesn't exist (for existing databases)
try {
    db.exec(`ALTER TABLE users ADD COLUMN balance REAL DEFAULT 1000.0;`);
    console.log('Balance column added/verified in users table.');
} catch (e) {
    // If the column already exists, this will throw an error, which we ignore.
}

// Create Matches Table
db.exec(`
    CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_a TEXT NOT NULL,
        team_b TEXT NOT NULL,
        match_date DATETIME NOT NULL,
        status TEXT CHECK(status IN ('pending', 'completed')) DEFAULT 'pending',
        score_a INTEGER DEFAULT NULL,
        score_b INTEGER DEFAULT NULL,
        odds_a REAL NOT NULL,
        odds_draw REAL NOT NULL,
        odds_b REAL NOT NULL,
        recent_form_a TEXT NOT NULL,
        recent_form_b TEXT NOT NULL,
        absences_a TEXT NOT NULL,
        absences_b TEXT NOT NULL,
        h2h TEXT NOT NULL,
        home_advantage TEXT NOT NULL,
        motivation TEXT NOT NULL
    );
`);

// Create Bets Table
db.exec(`
    CREATE TABLE IF NOT EXISTS bets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        match_id INTEGER NOT NULL,
        predicted_score_a INTEGER NOT NULL,
        predicted_score_b INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (match_id) REFERENCES matches(id)
    );
`);

console.log('Tables verified/created successfully.');

// Check and seed users
console.log('Checking and seeding users data...');
const usersToSeed = [
    { username: 'admin', password: 'admin123', balance: 5000.0 },
    { username: 'juan', password: 'juan123', balance: 1500.0 },
    { username: 'maria', password: 'maria123', balance: 2500.0 },
    { username: 'beto', password: 'beto123', balance: 1000.0 }
];

const checkUserStmt = db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?');
const insertUserStmt = db.prepare('INSERT INTO users (username, password_hash, balance) VALUES (?, ?, ?)');

for (const u of usersToSeed) {
    const res = checkUserStmt.get(u.username);
    if (res.count === 0) {
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(u.password, salt);
        insertUserStmt.run(u.username, hash, u.balance);
        console.log(`User seeded: ${u.username}`);
    }
}

// Check if matches are already populated
const countStmt = db.prepare('SELECT COUNT(*) as count FROM matches');
const row = countStmt.get();

if (row.count === 0) {
    console.log('Seeding matches data...');
    
    const insertStmt = db.prepare(`
        INSERT INTO matches (
            team_a, team_b, match_date, status, 
            odds_a, odds_draw, odds_b, 
            recent_form_a, recent_form_b, 
            absences_a, absences_b, 
            h2h, home_advantage, motivation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const sampleMatches = [
        [
            'Canadá', 'Brasil', '2026-06-11 15:00:00', 'pending',
            5.50, 3.80, 1.65,
            'G-E-G-P-E', 'G-G-P-G-G',
            'Ninguna baja clave. Plantilla completa disponible y entrenando al 100%.',
            'Neymar Jr. (lesión de ligamento cruzado en recuperación), Gabriel Magalhães (suspensión por tarjetas amarillas acumuladas).',
            'Últimos 3 enfrentamientos directos: 2 victorias de Brasil (3-1, 2-0) y 1 empate (1-1).',
            'Canadá juega de local en el BMO Field, Toronto. Clima frío previsto y estadio lleno con apoyo masivo del público canadiense.',
            'Partido inaugural de la Copa del Mundo. Canadá busca dar la sorpresa histórica en casa; Brasil con la presión de ser favorito absoluto del torneo.'
        ],
        [
            'México', 'Alemania', '2026-06-12 18:00:00', 'pending',
            3.80, 3.40, 2.05,
            'P-G-E-G-P', 'G-G-E-P-G',
            'Edson Álvarez (duda médica por molestias leves en el muslo, se probará en el calentamiento).',
            'Jamal Musiala (lesión muscular en el muslo confirmada), Marc-André ter Stegen (recuperación de cirugía de espalda).',
            'Historial en mundiales: Alemania lidera con 2 victorias y México con 1 victoria histórica (1-0 en Rusia 2018).',
            'Estadio Azteca, Ciudad de México. Gran altitud (2,240m) y humedad que suelen desgastar físicamente a las selecciones europeas. Apoyo incondicional local.',
            'Primer partido del grupo. Vital para decidir el liderato de grupo y evitar cruces complicados en las rondas de eliminación directa.'
        ],
        [
            'EE. UU.', 'Inglaterra', '2026-06-13 20:00:00', 'pending',
            4.10, 3.50, 1.95,
            'G-P-G-E-G', 'G-G-E-G-P',
            'Sergiño Dest (lesión de rodilla de larga duración que lo deja fuera de la convocatoria).',
            'Harry Kane (molestia leve en el tobillo, entrenando al margen pero se espera que inicie), Jude Bellingham (sanción de un partido por tarjetas).',
            'Historial en mundiales: 1 victoria de EE.UU. (1-0 en 1950) y 1 empate (1-1 en 2010). Inglaterra nunca le ha ganado a EE.UU. en un mundial.',
            'MetLife Stadium, Nueva Jersey. Terreno de juego neutral en papel, pero se proyecta una afición mayoritariamente estadounidense (70%).',
            'Derbi transatlántico de alta rivalidad histórica. EE.UU. motivado por demostrar su crecimiento; Inglaterra busca consolidar su candidatura.'
        ],
        [
            'Argentina', 'España', '2026-06-14 16:00:00', 'pending',
            2.45, 3.10, 3.00,
            'G-G-G-E-G', 'G-E-G-G-G',
            'Enzo Fernández (duda por pubalgia, podría iniciar en el banquillo).',
            'Gavi (recuperación de rotura de ligamentos cruzados), Pedri (molestia en el tobillo, entrenando a media intensidad).',
            'Últimos 2 amistosos: España ganó 6-1 (2018), Argentina ganó 4-1 (2010). Historial muy parejo en duelos no oficiales.',
            'Hard Rock Stadium, Miami. Clima caluroso y muy húmedo que favorece el desgaste. Mayoría de afición argentina residente en EE.UU.',
            'El último mundial de Lionel Messi. Motivación extrema en el plantel albiceleste para lograr una despedida legendaria; España con generación joven hambrienta.'
        ],
        [
            'Francia', 'Portugal', '2026-06-15 14:00:00', 'pending',
            2.15, 3.20, 3.60,
            'G-E-G-P-G', 'G-G-P-G-E',
            'Kylian Mbappé (fractura nasal, jugará con máscara protectora de carbono), Eduardo Camavinga (molestia leve de rodilla).',
            'Cristiano Ronaldo (carga muscular en gemelo, duda para el once inicial, podría ingresar de recambio).',
            'Historial reciente: Francia venció en semifinales del Mundial 2006 (1-0). Portugal venció a Francia en la final de la Eurocopa 2016 (1-0 en prórroga).',
            'SoFi Stadium, Los Ángeles. Clima templado e instalaciones techadas de primer nivel. Terreno neutral con afición dividida.',
            'Duelo de titanes del fútbol europeo. Francia busca redimir la final perdida de 2022; Portugal motivado por ser la despedida de Cristiano Ronaldo.'
        ]
    ];

    for (const match of sampleMatches) {
        insertStmt.run(...match);
    }
    console.log('Database seeded successfully.');
} else {
    console.log('Matches data already exists. Skipping seeding.');
}

console.log('Setup finished successfully.');
