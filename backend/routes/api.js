const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { chatConGemini } = require('../chatController');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_change_me_in_production';
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy_key');

// ─── Cache en memoria para live-matches (evita exceder rate limit gratuito) ───
const CACHE_TTL_MS = 60 * 1000; // 60 segundos
let liveMatchesCache = { data: null, timestamp: 0 };

// Database Migration: Ensure matches table has crest_a and crest_b columns
async function ensureCrestColumns() {
    try {
        const [columns] = await db.execute("SHOW COLUMNS FROM matches LIKE 'crest_a'");
        if (columns.length === 0) {
            console.log('[DB Migration] Adding crest_a and crest_b columns to matches table...');
            await db.execute("ALTER TABLE matches ADD COLUMN crest_a VARCHAR(255) DEFAULT NULL");
            await db.execute("ALTER TABLE matches ADD COLUMN crest_b VARCHAR(255) DEFAULT NULL");
            console.log('[DB Migration] Columns added successfully.');
        }
    } catch (err) {
        console.error('[DB Migration Error] Failed to alter matches table:', err.message);
    }
}
ensureCrestColumns();

// Helper to generate deterministic odds and match metadata based on team names
function getDeterministicMetadata(teamA, teamB) {
    let sumA = 0;
    let sumB = 0;
    for (let i = 0; i < teamA.length; i++) sumA += teamA.charCodeAt(i);
    for (let i = 0; i < teamB.length; i++) sumB += teamB.charCodeAt(i);

    const rawOddsA = 1.3 + ((sumA % 47) / 10);
    const rawOddsB = 1.3 + ((sumB % 47) / 10);
    const rawOddsDraw = 2.0 + (((sumA + sumB) % 23) / 10);

    const forms = ['G-E-G-P-E', 'G-G-P-G-G', 'E-G-P-E-G', 'G-P-G-G-E', 'P-G-E-G-G'];
    const formA = forms[sumA % forms.length];
    const formB = forms[sumB % forms.length];

    const absencesA = `Sin bajas críticas reportadas para ${teamA}.`;
    const absencesB = `Sin bajas críticas reportadas para ${teamB}.`;
    const h2h = `Historial equilibrado en los enfrentamientos previos entre ${teamA} y ${teamB}.`;
    const homeAdvantage = `Estadio neutral del Mundial 2026. Clima y altitud ideales.`;
    const motivation = `Fase de grupos del Mundial 2026. Ambos seleccionados buscan sumar puntos clave.`;

    return {
        odds_a: parseFloat(rawOddsA.toFixed(2)),
        odds_draw: parseFloat(rawOddsDraw.toFixed(2)),
        odds_b: parseFloat(rawOddsB.toFixed(2)),
        recent_form_a: formA,
        recent_form_b: formB,
        absences_a: absencesA,
        absences_b: absencesB,
        h2h: h2h,
        home_advantage: homeAdvantage,
        motivation: motivation
    };
}

// URL y token de football-data.org
const FOOTBALL_API_BASE = 'https://api.football-data.org/v4';
const FOOTBALL_API_KEY  = process.env.FOOTBALL_API_KEY || '';

// Middleware to verify JWT
const verifyToken = (req, res, next) => {
    const token = req.header('Authorization')?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

    try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified;
        next();
    } catch (error) {
        res.status(400).json({ error: 'Invalid token' });
    }
};

// Apply middleware to all routes below
router.use(verifyToken);

// Get all matches (with real matches syncing if API key is active)
router.get('/matches', async (req, res) => {
    const now = Date.now();
    
    // If no external API key, fallback to direct mock database query
    if (!FOOTBALL_API_KEY) {
        try {
            const [matches] = await db.execute('SELECT * FROM matches ORDER BY match_date ASC');
            return res.json(matches);
        } catch (error) {
            console.error('Error fetching matches from DB:', error);
            return res.status(500).json({ error: 'Error fetching matches' });
        }
    }

    // Serve from cache if valid
    if (liveMatchesCache.data && (now - liveMatchesCache.timestamp) < CACHE_TTL_MS) {
        return res.json(liveMatchesCache.data);
    }

    try {
        // Fetch matches from football-data.org
        const response = await fetch(`${FOOTBALL_API_BASE}/competitions/WC/matches`, {
            headers: { 'X-Auth-Token': FOOTBALL_API_KEY }
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('[matches] football-data.org API error:', response.status, errText);
            throw new Error(`API responded with status ${response.status}`);
        }

        const data = await response.json();
        const matchesList = data.matches || [];

        // Sync matches to the database
        for (const m of matchesList) {
            const homeName = m.homeTeam.name;
            const awayName = m.awayTeam.name;
            const matchDate = m.utcDate.replace('T', ' ').substring(0, 19);
            const apiStatus = m.status; // SCHEDULED | LIVE | IN_PLAY | PAUSED | FINISHED | POSTPONED
            const dbStatus = apiStatus === 'FINISHED' ? 'completed' : 'pending';
            const scoreA = m.score.fullTime.home;
            const scoreB = m.score.fullTime.away;
            const crestA = m.homeTeam.crest || null;
            const crestB = m.awayTeam.crest || null;

            // Generate deterministic odds and metadata for new inserts
            const meta = getDeterministicMetadata(homeName, awayName);

            // Upsert using INSERT ... ON DUPLICATE KEY UPDATE
            const syncQuery = `
                INSERT INTO matches (
                    id, team_a, team_b, match_date, status, score_a, score_b,
                    odds_a, odds_draw, odds_b, recent_form_a, recent_form_b,
                    absences_a, absences_b, h2h, home_advantage, motivation,
                    crest_a, crest_b
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    status = VALUES(status),
                    score_a = VALUES(score_a),
                    score_b = VALUES(score_b),
                    match_date = VALUES(match_date),
                    crest_a = VALUES(crest_a),
                    crest_b = VALUES(crest_b)
            `;

            await db.execute(syncQuery, [
                m.id, homeName, awayName, matchDate, dbStatus, scoreA, scoreB,
                meta.odds_a, meta.odds_draw, meta.odds_b,
                meta.recent_form_a, meta.recent_form_b,
                meta.absences_a, meta.absences_b,
                meta.h2h, meta.home_advantage, meta.motivation,
                crestA, crestB
            ]);
        }

        // Fetch matches from the database (filtering out mock seeded matches with IDs 1 to 5 to avoid mixing)
        const [dbMatches] = await db.execute('SELECT * FROM matches WHERE id NOT IN (1,2,3,4,5) ORDER BY match_date ASC');
        
        liveMatchesCache = { data: dbMatches, timestamp: now };
        return res.json(dbMatches);

    } catch (fetchErr) {
        console.error('[matches] Fetch/Sync error, falling back to all database matches:', fetchErr.message);
        try {
            const [dbMatches] = await db.execute('SELECT * FROM matches ORDER BY match_date ASC');
            return res.json(dbMatches);
        } catch (dbErr) {
            return res.status(500).json({ error: 'Error fetching matches and fallback failed.' });
        }
    }
});

// Place a bet
router.post('/bets', async (req, res) => {
    try {
        const { matchId, scoreA, scoreB } = req.body;
        
        if (!matchId || scoreA === undefined || scoreB === undefined) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Insert bet
        await db.execute(
            'INSERT INTO bets (user_id, match_id, predicted_score_a, predicted_score_b) VALUES (?, ?, ?, ?)',
            [req.user.userId, matchId, scoreA, scoreB]
        );

        res.status(201).json({ message: 'Bet placed successfully!' });
    } catch (error) {
        console.error('Error placing bet:', error);
        res.status(500).json({ error: 'Error placing bet' });
    }
});

// Get user bets
router.get('/bets', async (req, res) => {
    try {
        const query = `
            SELECT b.*, m.team_a, m.team_b, m.status, m.score_a as actual_score_a, m.score_b as actual_score_b
            FROM bets b
            JOIN matches m ON b.match_id = m.id
            WHERE b.user_id = ?
            ORDER BY b.created_at DESC
        `;
        const [bets] = await db.execute(query, [req.user.userId]);
        res.json(bets);
    } catch (error) {
        console.error('Error fetching bets:', error);
        res.status(500).json({ error: 'Error fetching bets' });
    }
});

// AI Prediction Endpoint (Gemini)
router.post('/predict/:matchId', async (req, res) => {
    try {
        const matchId = req.params.matchId;
        const [matches] = await db.execute('SELECT * FROM matches WHERE id = ?', [matchId]);
        
        if (matches.length === 0) {
            return res.status(404).json({ error: 'Match not found' });
        }

        const match = matches[0];
        
        const prompt = `Eres "BetOracle AI", un agente analítico especializado en fútbol de élite. Tu objetivo es proporcionar análisis predictivos basados en datos para ayudar al usuario a tomar decisiones informadas.

Analiza el siguiente partido de la Copa Mundial 2026:
- Local: ${match.team_a} (Cuota real: ${match.odds_a}, Forma reciente: ${match.recent_form_a}, Bajas/Lesiones: ${match.absences_a})
- Visitante: ${match.team_b} (Cuota real: ${match.odds_b}, Forma reciente: ${match.recent_form_b}, Bajas/Lesiones: ${match.absences_b})
- Empate (Cuota real: ${match.odds_draw})
- Historial Directo (H2H): ${match.h2h}
- Ventaja de Localía: ${match.home_advantage}
- Motivación y Contexto: ${match.motivation}

INSTRUCCIONES OBLIGATORIAS DE COMPORTAMIENTO:
1. ANÁLISIS MULTIVARIABLE: Evalúa y desglosa: forma reciente, bajas/lesiones, historial directo (H2H), ventaja de localía y motivación.
2. GESTIÓN DE RIESGO: Nunca garantices resultados ni uses palabras como "ganador seguro". Utiliza terminología de probabilidad y valor. Si el partido es extremadamente parejo o impredecible, catalógalo como "Alta volatilidad".
3. LENGUAJE: Mantente profesional, objetivo y conciso. Evita sensacionalismo. Todo en idioma español.
4. VALOR DETECTADO: Compara las probabilidades estimadas por ti con las cuotas reales del partido. Si tu probabilidad estimada para un resultado es superior a la probabilidad implícita de las cuotas del corredor de apuestas (Probabilidad Implícita = 1 / Cuota), declara que hay valor detectado y explica detalladamente por qué.
5. RESPONSABILIDAD: Al final, proporciona una breve advertencia estándar de juego responsable.

Debes devolver la respuesta estrictamente como un objeto JSON crudo, sin bloques markdown de tipo \`\`\`json ni texto explicativo antes o después. El objeto JSON debe tener exactamente esta estructura:
{
  "predictedScoreA": <número entero>,
  "predictedScoreB": <número entero>,
  "probabilities": {
    "local": <porcentaje entero de 0 a 100>,
    "draw": <porcentaje entero de 0 a 100>,
    "away": <porcentaje entero de 0 a 100>
  },
  "keyFactors": {
    "form": "<análisis muy breve e informativo de la forma reciente>",
    "absences": "<análisis de bajas y lesiones>",
    "h2h": "<resumen de historial directo>",
    "homeAdvantage": "<análisis del factor local/estadio>",
    "motivation": "<resumen de motivación>"
  },
  "valueDetected": "<análisis en 1-2 frases de dónde se detecta valor comparando cuotas vs tus probabilidades estimadas>",
  "suggestedBet": "<mercado sugerido, ej. Doble Oportunidad: Local o Empate, Más de 2.5 goles, Ambos anotan, etc.>",
  "volatility": "<Alta volatilidad / Media / Baja>",
  "responsibilityDisclaimer": "Juega con responsabilidad. Solo para mayores de 18 años. El juego puede ser adictivo."
}`;

        // Mock prediction if no API key is provided
        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here' || process.env.GEMINI_API_KEY === 'dummy_key') {
             // Let's make mock predictions slightly realistic based on teams
             const isCanada = match.team_a.includes('Canadá');
             const isMexico = match.team_a.includes('México');
             const isUSA = match.team_a.includes('EE. UU.');
             const isArgentina = match.team_a.includes('Argentina');
             
             let pA = 40, pD = 30, pB = 30;
             let scoreA = 1, scoreB = 1;
             let suggested = "Doble Oportunidad: Local o Empate";
             let value = "Se detecta valor moderado en la opción local por ventaja de localía extrema.";
             let vol = "Media";

             if (isCanada) {
                 pA = 20; pD = 28; pB = 52;
                 scoreA = 1; scoreB = 2;
                 suggested = "Más de 2.5 Goles";
                 value = `La cuota visitante de ${match.odds_b} ofrece valor ya que Brasil tiene un 52% de probabilidad estimada frente al 60% implícito.`;
             } else if (isMexico) {
                 pA = 35; pD = 30; pB = 35;
                 scoreA = 1; scoreB = 1;
                 suggested = "Doble Oportunidad: Empate o Visitante";
                 value = "Alta volatilidad en el Azteca. La cuota de empate (3.40) presenta un valor de retorno interesante.";
                 vol = "Alta volatilidad";
             } else if (isUSA) {
                 pA = 30; pD = 28; pB = 42;
                 scoreA = 1; scoreB = 2;
                 suggested = "Ambos Equipos Anotan (Sí)";
                 value = "Se detecta valor en la victoria ajustada de Inglaterra debido a las ausencias clave de EE. UU.";
             } else if (isArgentina) {
                 pA = 48; pD = 28; pB = 24;
                 scoreA = 2; scoreB = 1;
                 suggested = "Victoria simple: Argentina";
                 value = `La cuota de Argentina (${match.odds_a}) tiene un excelente valor, dado que estimamos un 48% de probabilidad ante las bajas clave de España (Gavi, Pedri).`;
                 vol = "Baja";
             }

             return res.json({
                 predictedScoreA: scoreA,
                 predictedScoreB: scoreB,
                 probabilities: { local: pA, draw: pD, away: pB },
                 keyFactors: {
                     form: `Forma reciente de ${match.team_a} (${match.recent_form_a}) vs ${match.team_b} (${match.recent_form_b}).`,
                     absences: `${match.team_a}: ${match.absences_a} | ${match.team_b}: ${match.absences_b}`,
                     h2h: match.h2h,
                     homeAdvantage: match.home_advantage,
                     motivation: match.motivation
                 },
                 valueDetected: `(Predicción IA de Prueba) ${value}`,
                 suggestedBet: suggested,
                 volatility: vol,
                 responsibilityDisclaimer: "Juega con responsabilidad. Solo para mayores de 18 años. El juego puede ser adictivo."
             });
        }

        // Use Gemini API
        const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const rawText = response.text();
        // Clean markdown if the model still returns it
        const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const prediction = JSON.parse(cleanJson);
        
        res.json(prediction);
    } catch (error) {
        console.error('Error fetching AI prediction:', error);
        res.status(500).json({ error: 'Error generating prediction. Note: API key might be invalid.' });
    }
});

// Get user profile (username, balance, total bets)
router.get('/profile', async (req, res) => {
    try {
        const [users] = await db.execute('SELECT username, balance FROM users WHERE id = ?', [req.user.userId]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const [betsCount] = await db.execute('SELECT COUNT(*) as count FROM bets WHERE user_id = ?', [req.user.userId]);
        
        res.json({
            username: users[0].username,
            balance: users[0].balance,
            totalBets: betsCount[0].count
        });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ error: 'Error fetching profile' });
    }
});

// Charge virtual wallet
router.post('/wallet/charge', async (req, res) => {
    try {
        const { amount } = req.body;
        const depositAmount = parseFloat(amount);
        
        if (isNaN(depositAmount) || depositAmount <= 0) {
            return res.status(400).json({ error: 'El monto de recarga debe ser un número positivo válido.' });
        }
        
        // Get current balance
        const [users] = await db.execute('SELECT balance FROM users WHERE id = ?', [req.user.userId]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const newBalance = users[0].balance + depositAmount;
        
        // Update balance
        await db.execute('UPDATE users SET balance = ? WHERE id = ?', [newBalance, req.user.userId]);
        
        res.json({ message: '¡Recarga exitosa!', balance: newBalance });
    } catch (error) {
        console.error('Error charging wallet:', error);
        res.status(500).json({ error: 'Error charging wallet' });
    }
});

// ─── Chatbot — Asistente Mundialista 2026 (Gemini) ──────────────────────────
// La lógica completa está en chatController.js (modularizada y lista para producción)
router.post('/chat', chatConGemini);

// Endpoint /api/live-matches desactivado (redundante tras unificación de partidos reales en /api/matches)

module.exports = router;
