'use strict';

/**
 * chatController.js
 * Controlador del chatbot "Asistente Mundialista 2026" usando Google Gemini.
 * La GEMINI_API_KEY se lee EXCLUSIVAMENTE desde variables de entorno del servidor.
 * Nunca se expone al cliente.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('./db');

// ─── Validación de seguridad al arrancar ────────────────────────────────────
if (!process.env.GEMINI_API_KEY) {
    console.error('[chatController] ADVERTENCIA: GEMINI_API_KEY no está definida en .env');
}

// ─── Inicialización del SDK (una sola instancia, reutilizable) ───────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ─── Constantes de configuración ────────────────────────────────────────────
const GEMINI_MODEL    = 'gemini-3.5-flash';
const TIMEOUT_MS      = 25000; // 25 segundos máximo de espera a la API

/**
 * Construye el system prompt robusto inyectando el contexto de la BD.
 * @param {string} userMessage  - Mensaje del usuario
 * @param {Array}  matches      - Partidos obtenidos de la base de datos
 * @returns {string}            - Prompt completo listo para enviar a Gemini
 */
function buildPrompt(userMessage, matches) {
    // Contexto de partidos desde la BD — nunca expuesto al cliente directamente
    const matchesContext = matches.length > 0
        ? matches.map(m => `- ${m.team_a} vs ${m.team_b} (${new Date(m.match_date).toLocaleString('es-ES')})
  Estado: ${m.status === 'completed' ? `Finalizado (${m.score_a}-${m.score_b})` : 'Pendiente'}
  Cuotas: Local ${m.odds_a} | Empate ${m.odds_draw} | Visitante ${m.odds_b}
  Forma reciente: ${m.team_a} [${m.recent_form_a}] | ${m.team_b} [${m.recent_form_b}]
  Bajas/Lesiones: ${m.team_a}: ${m.absences_a} | ${m.team_b}: ${m.absences_b}
  Historial H2H: ${m.h2h}
  Factor localía: ${m.home_advantage}
  Contexto/Motivación: ${m.motivation}`).join('\n\n')
        : 'No hay partidos disponibles en la base de datos en este momento.';

    return `Eres el "Asistente Mundialista 2026", un analista experto en fútbol de élite y apuestas deportivas. Operas bajo las siguientes reglas de comportamiento que NO puedes romper bajo ninguna circunstancia:

## ROL Y PERSONALIDAD
- Eres un analista profesional, objetivo y amigable. Nunca eres un simple chatbot de respuestas genéricas.
- Respondes siempre en español, con un tono experto pero accesible.
- Utilizas datos reales (los que se te proporcionan abajo) para fundamentar cada afirmación.

## REGLAS DE ANÁLISIS OBLIGATORIAS
1. **MULTIVARIABLE**: Cuando analices un partido, siempre considera: forma reciente, bajas/lesiones, historial H2H, ventaja de localía y motivación.
2. **PROBABILIDADES**: Siempre compara tus probabilidades estimadas con las probabilidades implícitas de las cuotas (Prob. implícita = 1 / cuota × 100%). Detecta si hay valor.
3. **HONESTIDAD**: NUNCA garantices un resultado. Usa expresiones como "el análisis favorece a...", "existe una probabilidad moderada de...", "el valor estadístico apunta a...".
4. **VOLATILIDAD**: Si el partido es muy equilibrado o impredecible, etiquétalo claramente como ⚠️ Alta Volatilidad.
5. **JUEGO RESPONSABLE**: Cierra SIEMPRE tus análisis de apuestas con un recordatorio breve de juego responsable.

## FORMATO DE RESPUESTA
- Usa Markdown estándar: **negritas**, *cursivas*, listas con guiones y tablas cuando aplique.
- NO uses encabezados h1 (#) ni bloques de código a menos que sea estrictamente necesario.
- Sé conciso pero completo. Evita el relleno innecesario.

## BASE DE DATOS OFICIAL DE PARTIDOS (Mundial 2026)
${matchesContext}

---

**Pregunta del usuario:** "${userMessage}"

Responde ahora de forma analítica y detallada basándote exclusivamente en los datos proporcionados arriba.`;
}

/**
 * POST /api/chat
 * Recibe { message } en el body, consulta Gemini y devuelve { response }.
 * La API Key NUNCA se envía al cliente.
 */
const chatConGemini = async (req, res) => {
    const { message } = req.body;

    // ── 1. Validación de entrada ─────────────────────────────────────────────
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({
            error: 'El campo "message" es requerido y no puede estar vacío.'
        });
    }

    const sanitizedMessage = message.trim().slice(0, 2000); // Limitar longitud

    try {
        // ── 2. Obtener contexto de partidos desde la BD ──────────────────────
        let matches = [];
        try {
            const [rows] = await db.execute('SELECT * FROM matches ORDER BY match_date ASC');
            matches = rows;
        } catch (dbError) {
            // No bloqueamos el chat si la BD falla; seguimos sin contexto de partidos
            console.warn('[chatController] No se pudo obtener partidos de la BD:', dbError.message);
        }

        // ── 3. Verificar que la API Key existe ───────────────────────────────
        if (!process.env.GEMINI_API_KEY) {
            return res.status(503).json({
                error: 'El servicio de IA no está configurado correctamente. Contacta al administrador.'
            });
        }

        // ── 4. Construir prompt e invocar Gemini con timeout ─────────────────
        const prompt = buildPrompt(sanitizedMessage, matches);
        const model  = genAI.getGenerativeModel({ model: GEMINI_MODEL });

        // Timeout manual para no dejar colgado al cliente
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
        );

        const geminiPromise = model.generateContent(prompt);
        const result        = await Promise.race([geminiPromise, timeoutPromise]);
        const responseText  = result.response.text();

        // ── 5. Respuesta exitosa ─────────────────────────────────────────────
        return res.json({ response: responseText });

    } catch (error) {
        // ── 6. Manejo de errores diferenciado ────────────────────────────────
        if (error.message === 'TIMEOUT') {
            console.error('[chatController] Timeout al conectar con Gemini');
            return res.status(504).json({
                error: 'El servicio de IA tardó demasiado en responder. Intenta de nuevo.'
            });
        }

        // Errores de cuota o API Key inválida
        if (error.status === 429 || (error.message && error.message.includes('quota'))) {
            console.error('[chatController] Cuota de API excedida:', error.message);
            return res.status(429).json({
                error: 'Se ha alcanzado el límite de consultas a la IA. Intenta en unos minutos.'
            });
        }

        if (error.status === 400 || (error.message && error.message.includes('API_KEY'))) {
            console.error('[chatController] API Key inválida o request malformado:', error.message);
            return res.status(500).json({
                error: 'Error de configuración del servicio de IA.'
            });
        }

        // Error genérico
        console.error('[chatController] Error inesperado:', error);
        return res.status(500).json({
            error: 'Ocurrió un error interno al procesar tu consulta. Intenta de nuevo.'
        });
    }
};

module.exports = { chatConGemini };
