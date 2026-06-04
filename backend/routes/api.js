const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_change_me_in_production';
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy_key');

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

// Get all matches
router.get('/matches', async (req, res) => {
    try {
        const [matches] = await db.execute('SELECT * FROM matches ORDER BY match_date ASC');
        res.json(matches);
    } catch (error) {
        console.error('Error fetching matches:', error);
        res.status(500).json({ error: 'Error fetching matches' });
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
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
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

// Chatbot for soccer analysis (Gemini)
router.post('/chat', async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }
        
        // Fetch all matches to provide as database context to the AI
        const [matches] = await db.execute('SELECT * FROM matches');
        
        // Format matches context
        let matchesContext = matches.map(m => {
            return `- ${m.team_a} vs ${m.team_b} (${new Date(m.match_date).toLocaleString('es-ES')})
  Estado: ${m.status === 'completed' ? `Finalizado (${m.score_a}-${m.score_b})` : 'Pendiente'}
  Cuotas: Local ${m.odds_a}, Empate ${m.odds_draw}, Visitante ${m.odds_b}
  Forma: ${m.team_a} [${m.recent_form_a}], ${m.team_b} [${m.recent_form_b}]
  Bajas: ${m.team_a}: ${m.absences_a} | ${m.team_b}: ${m.absences_b}
  Historial (H2H): ${m.h2h}
  Localía: ${m.home_advantage}
  Motivación: ${m.motivation}`;
        }).join('\n\n');

        const prompt = `Eres el "Asistente Mundialista 2026", un chatbot analítico de fútbol de élite y experto en apuestas deportivas. Tu meta es responder de forma profesional, profunda, analítica y amigable en español.
        
Aquí tienes la información oficial de la base de datos de los partidos del Mundial 2026:
${matchesContext}

El usuario te está haciendo una pregunta o interactuando contigo. Responde de forma muy completa y detallada, dando datos de forma, H2H y ausencias basados en el contexto proporcionado si te preguntan por un partido específico. Sé objetivo pero entretenido, y nunca garantices resultados 100% seguros (fomenta el juego responsable).

Pregunta del usuario: "${message}"

Responde en formato de texto enriquecido (Markdown estándar) con negritas, listas o tablas si es necesario. No uses encabezados h1 (#).`;

        // If no Gemini key is provided, use mock analysis
        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here' || process.env.GEMINI_API_KEY === 'dummy_key') {
            // Generate standard mock chatbot response
            let responseText = "¡Hola! Soy tu Asistente Mundialista 2026. ";
            const lowercaseMsg = message.toLowerCase();
            
            // Check if matches specific teams
            if (lowercaseMsg.includes('canad') || lowercaseMsg.includes('brasil')) {
                responseText += `
### Análisis del Partido: Canadá vs Brasil 🇨🇦 🇧🇷

*   **Favoritismo**: **Brasil** es el favorito teórico (cuota **1.65**), pero enfrenta un reto duro en Toronto (cuota **5.50** para Canadá).
*   **Forma y Clave**: Canadá tiene la ventaja de jugar en casa con un clima frío que puede incomodar a Brasil. Además, Brasil llega con bajas muy importantes, destacando a **Neymar Jr.** (ligamento cruzado) y **Gabriel Magalhães** (acumulación de tarjetas).
*   **H2H**: Historial directo dominado por Brasil (2 victorias, 1 empate).
*   **Recomendación**: Debido al factor localía y las ausencias brasileñas, la opción de **Ambos Equipos Anotan** o **Más de 2.5 Goles** tiene un valor muy atractivo.`;
            } else if (lowercaseMsg.includes('mexic') || lowercaseMsg.includes('alemania')) {
                responseText += `
### Análisis del Partido: México vs Alemania 🇲🇽 🇩🇪

*   **Favoritismo**: **Alemania** (cuota **2.05**) vs **México** (cuota **3.80**).
*   **Condición del Azteca**: El partido se juega en el **Estadio Azteca**. La altitud de 2,240 metros y la humedad sofocante son factores determinantes que suelen asfixiar a los equipos europeos.
*   **Bajas**: México tiene la duda de **Edson Álvarez** por molestias en el muslo. Alemania llega con bajas críticas: **Jamal Musiala** (baja muscular) y **Ter Stegen** (recuperación de espalda).
*   **Pronóstico**: Un duelo de alta volatilidad. Un empate (cuota **3.40**) o **Doble Oportunidad: México o Empate** representa un valor sólido.`;
            } else if (lowercaseMsg.includes('ee') || lowercaseMsg.includes('inglaterra') || lowercaseMsg.includes('usa')) {
                responseText += `
### Análisis del Partido: EE. UU. vs Inglaterra 🇺🇸 🏴󠁧󠁢󠁥󠁮󠁧󠁿

*   **Favoritismo**: **Inglaterra** es favorita a cuota **1.95**, pero **EE. UU.** tiene cuota **4.10**.
*   **Contexto Histórico**: Es un derbi transatlántico. Curiosamente, Inglaterra *nunca* ha vencido a EE. UU. en una Copa del Mundo (1 victoria de EE.UU. en 1950 y 1 empate en 2010).
*   **Bajas**: EE. UU. no tiene a **Sergiño Dest**. Inglaterra tiene sancionado a **Jude Bellingham** y **Harry Kane** llega entre algodones.
*   **Recomendación**: Inglaterra tiene una plantilla superior, pero la ausencia de Bellingham y la racha histórica favorecen un partido cerrado. Sugerimos la opción de **Menos de 2.5 goles** o **Doble Oportunidad: EE. UU. o Empate** para los más arriesgados.`;
            } else if (lowercaseMsg.includes('argentina') || lowercaseMsg.includes('espa')) {
                responseText += `
### Análisis del Partido: Argentina vs España 🇦🇷 🇪🇸

*   **Favoritismo**: **Argentina** (cuota **2.45**) parte con ligera ventaja sobre **España** (cuota **3.00**).
*   **Factor Emocional**: Es el último mundial de **Lionel Messi**. La motivación del cuadro albiceleste es máxima en el Hard Rock Stadium de Miami, donde habrá una marea de afición argentina.
*   **Bajas**: España no contará con su motor **Gavi** y **Pedri** está a media máquina. Argentina tiene la duda de **Enzo Fernández**.
*   **Recomendación**: La victoria directa de **Argentina** ofrece un excelente valor debido a la cohesión del grupo y las bajas clave en el mediocampo de la selección española.`;
            } else if (lowercaseMsg.includes('francia') || lowercaseMsg.includes('portugal')) {
                responseText += `
### Análisis del Partido: Francia vs Portugal 🇫🇷 🇵🇹

*   **Favoritismo**: **Francia** (cuota **2.15**) vs **Portugal** (cuota **3.60**).
*   **Figuras**: **Kylian Mbappé** jugará con máscara protectora de carbono tras su fractura nasal. En Portugal, **Cristiano Ronaldo** tiene molestias en el gemelo y podría iniciar en la banca.
*   **Historial**: Máxima paridad histórica, con recuerdos de la final de la Euro 2016 ganada por Portugal.
*   **Pronóstico**: Partido de ritmo táctico muy cerrado. La opción de **Menos de 2.5 goles** o **Doble Oportunidad: Francia o Empate** es la más aconsejable.`;
            } else {
                responseText += `
Veo que quieres saber más sobre la Copa Mundial 2026. Puedo darte análisis en profundidad sobre cualquiera de los siguientes partidos:
1. **Canadá vs Brasil** 🇨🇦 🇧🇷
2. **México vs Alemania** 🇲🇽 🇩🇪
3. **EE. UU. vs Inglaterra** 🇺🇸 🏴󠁧󠁢󠁥󠁮󠁧󠁿
4. **Argentina vs España** 🇦🇷 🇪🇸
5. **Francia vs Portugal** 🇫🇷 🇵🇹

Por favor, pregúntame detalles de cualquiera de ellos (ej. *'¿Cuáles son las bajas de México vs Alemania?'* o *'¿Quién es el favorito en el Argentina vs España?'*).`;
            }
            
            return res.json({ response: responseText });
        }

        // Call Gemini API
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const responseText = response.text();
        
        res.json({ response: responseText });
    } catch (error) {
        console.error('Error in chatbot communication:', error);
        res.status(500).json({ error: 'Error al comunicarse con el chatbot.' });
    }
});

module.exports = router;
