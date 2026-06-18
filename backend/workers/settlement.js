/**
 * settlement.js — Worker en segundo plano para procesar y liquidar apuestas pendientes.
 */
const db = require('../db');

async function settleBets() {
    console.log('[Settlement Worker] Iniciando escaneo de apuestas pendientes...');
    try {
        // Obtener apuestas pendientes junto con el estado del partido
        const query = `
            SELECT b.id as bet_id, b.user_id, b.match_id, b.predicted_score_a, b.predicted_score_b, b.amount,
                   m.status as match_status, m.score_a as actual_score_a, m.score_b as actual_score_b,
                   m.odds_a, m.odds_draw, m.odds_b, m.team_a, m.team_b
            FROM bets b
            JOIN matches m ON b.match_id = m.id
            WHERE b.status = 'pending'
        `;
        
        const [pendingBets] = await db.execute(query);
        if (pendingBets.length === 0) {
            console.log('[Settlement Worker] No hay apuestas pendientes por resolver.');
            return;
        }

        console.log(`[Settlement Worker] Procesando ${pendingBets.length} apuestas pendientes...`);

        for (const bet of pendingBets) {
            // Solo liquidamos si el partido está completado (finalizado)
            if (bet.match_status !== 'completed') {
                continue;
            }

            console.log(`[Settlement Worker] Resolviendo apuesta #${bet.bet_id} (Usuario #${bet.user_id}, Partido: ${bet.team_a} vs ${bet.team_b})`);

            // Determinar resultado real y cuota asociada
            const actualA = bet.actual_score_a;
            const actualB = bet.actual_score_b;
            let outcomeOdds = 1.00;

            if (actualA > actualB) {
                outcomeOdds = parseFloat(bet.odds_a);
            } else if (actualA < actualB) {
                outcomeOdds = parseFloat(bet.odds_b);
            } else {
                outcomeOdds = parseFloat(bet.odds_draw);
            }

            // Comprobar si acertó el marcador exacto
            const isWinner = (bet.predicted_score_a === actualA && bet.predicted_score_b === actualB);

            if (isWinner) {
                const reward = bet.amount * outcomeOdds;
                console.log(`  🎉 ¡ACIERTO! Recompensa calculada: $${reward.toFixed(2)} (Cuota: ${outcomeOdds})`);

                // 1. Acreditar recompensa al usuario
                await db.execute('UPDATE users SET balance = balance + ? WHERE id = ?', [reward, bet.user_id]);

                // 2. Marcar la apuesta como ganada y guardar recompensa
                await db.execute('UPDATE bets SET status = "won", reward = ? WHERE id = ?', [reward, bet.bet_id]);
            } else {
                console.log('  ❌ NO ACERTADO. Apuesta marcada como perdida.');
                
                // Marcar la apuesta como perdida (el monto ya fue debitado al realizarla)
                await db.execute('UPDATE bets SET status = "lost", reward = 0.00 WHERE id = ?', [bet.bet_id]);
            }
        }
        console.log('[Settlement Worker] Liquidación de apuestas finalizada.');
    } catch (error) {
        console.error('[Settlement Worker Error] Error durante la liquidación:', error.message);
    }
}

module.exports = { settleBets };
