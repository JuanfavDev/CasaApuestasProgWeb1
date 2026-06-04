document.addEventListener('DOMContentLoaded', () => {
    // ---- Auth Logic (index.html) ----
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        const registerForm = document.getElementById('register-form');
        const tabLogin = document.getElementById('tab-login');
        const tabRegister = document.getElementById('tab-register');

        // Toggle Tabs
        tabLogin.addEventListener('click', () => {
            tabLogin.classList.add('active');
            tabRegister.classList.remove('active');
            loginForm.classList.add('active');
            registerForm.classList.remove('active');
        });

        tabRegister.addEventListener('click', () => {
            tabRegister.classList.add('active');
            tabLogin.classList.remove('active');
            registerForm.classList.add('active');
            loginForm.classList.remove('active');
        });

        // Login Submit
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = document.getElementById('login-username').value;
            const pass = document.getElementById('login-password').value;
            const msg = document.getElementById('login-msg');
            
            try {
                await api.login(user, pass);
                window.location.href = 'dashboard.html';
            } catch (err) {
                msg.textContent = err.message;
                msg.className = 'form-msg msg-error';
            }
        });

        // Register Submit
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = document.getElementById('reg-username').value;
            const pass = document.getElementById('reg-password').value;
            const msg = document.getElementById('register-msg');
            
            try {
                await api.register(user, pass);
                msg.textContent = '¡Registro exitoso! Ahora inicia sesión.';
                msg.className = 'form-msg msg-success';
                setTimeout(() => tabLogin.click(), 2000);
            } catch (err) {
                msg.textContent = err.message;
                msg.className = 'form-msg msg-error';
            }
        });

        // Redirect if already logged in
        if (localStorage.getItem('jwt')) {
            window.location.href = 'dashboard.html';
        }
    }

    // ---- Dashboard Logic (dashboard.html) ----
    const matchesList = document.getElementById('matches-list');
    if (matchesList) {
        // Protect route
        if (!localStorage.getItem('jwt')) {
            window.location.href = 'index.html';
            return;
        }

        document.getElementById('user-greeting').textContent = `Hola, ${localStorage.getItem('username')}`;

        // Logout
        document.getElementById('logout-btn').addEventListener('click', () => {
            localStorage.removeItem('jwt');
            localStorage.removeItem('username');
            window.location.href = 'index.html';
        });

        loadDashboard();

        async function loadDashboard() {
            try {
                const [matches, bets] = await Promise.all([
                    api.getMatches(),
                    api.getBets()
                ]);

                renderMatches(matches);
                renderBets(bets);
            } catch (err) {
                if (err.message === 'Unauthorized') {
                    localStorage.removeItem('jwt');
                    window.location.href = 'index.html';
                }
                console.error(err);
            }
        }

        function renderMatches(matches) {
            matchesList.innerHTML = '';
            matches.forEach(match => {
                const isPending = match.status === 'pending';
                
                const card = document.createElement('div');
                card.className = 'match-card glass-panel';
                card.innerHTML = `
                    <div class="match-header">
                        <span>${new Date(match.match_date).toLocaleString('es-ES', {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'})}</span>
                        <span style="color: ${isPending ? 'var(--secondary-color)' : 'var(--text-muted)'}">${isPending ? 'Pendiente' : 'Finalizado'}</span>
                    </div>
                    <div class="match-teams">
                        <span>${match.team_a}</span>
                        <span class="vs">VS</span>
                        <span>${match.team_b}</span>
                    </div>
                    <div class="match-odds">
                        <span class="odd-badge">L: <b>${match.odds_a.toFixed(2)}</b></span>
                        <span class="odd-badge">E: <b>${match.odds_draw.toFixed(2)}</b></span>
                        <span class="odd-badge">V: <b>${match.odds_b.toFixed(2)}</b></span>
                    </div>
                    ${isPending ? `
                        <div class="bet-inputs">
                            <input type="number" id="score-a-${match.id}" class="score-input" min="0" max="15" value="0">
                            <span>-</span>
                            <input type="number" id="score-b-${match.id}" class="score-input" min="0" max="15" value="0">
                        </div>
                        <div class="card-actions">
                            <button class="btn primary-btn btn-sm" onclick="placeBet(${match.id})">Apostar</button>
                            <button class="btn outline-btn btn-sm" onclick="askAI(${match.id}, '${match.team_a}', '${match.team_b}')">🤖 Consultar IA</button>
                        </div>
                    ` : `
                        <div class="bet-inputs" style="font-weight: bold; font-size: 1.5rem;">
                            ${match.score_a} - ${match.score_b}
                        </div>
                    `}
                `;
                matchesList.appendChild(card);
            });
        }

        function renderBets(bets) {
            const betsList = document.getElementById('my-bets-list');
            if (bets.length === 0) {
                betsList.innerHTML = '<p style="color: var(--text-muted)">No has realizado apuestas aún.</p>';
                return;
            }

            betsList.innerHTML = '';
            bets.forEach(bet => {
                const isPending = bet.status === 'pending';
                const el = document.createElement('div');
                el.className = 'bet-item';
                el.innerHTML = `
                    <div class="bet-item-header">${bet.team_a} vs ${bet.team_b}</div>
                    <div class="bet-item-score">
                        Tu predicción: ${bet.predicted_score_a} - ${bet.predicted_score_b}
                    </div>
                    ${!isPending ? `
                        <div class="bet-item-score" style="margin-top: 5px; color: ${bet.actual_score_a === bet.predicted_score_a && bet.actual_score_b === bet.predicted_score_b ? 'var(--secondary-color)' : 'var(--danger)'}">
                            Resultado real: ${bet.actual_score_a} - ${bet.actual_score_b}
                        </div>
                    ` : ''}
                `;
                betsList.appendChild(el);
            });
        }

        // Global functions for inline onclick handlers
        window.placeBet = async function(matchId) {
            const scoreA = document.getElementById(`score-a-${matchId}`).value;
            const scoreB = document.getElementById(`score-b-${matchId}`).value;
            
            try {
                await api.placeBet(matchId, parseInt(scoreA), parseInt(scoreB));
                alert('¡Apuesta registrada con éxito!');
                loadDashboard(); // reload to show new bet
            } catch (err) {
                alert(err.message);
            }
        };

        // Modal Logic
        const modal = document.getElementById('ai-modal');
        const closeModal = document.getElementById('close-modal');
        const aiLoader = document.getElementById('ai-loader');
        const aiResultBox = document.getElementById('ai-result-box');
        
        closeModal.addEventListener('click', () => modal.classList.add('hidden'));

        window.askAI = async function(matchId, teamA, teamB) {
            modal.classList.remove('hidden');
            document.getElementById('ai-match-teams').textContent = `${teamA} vs ${teamB}`;
            
            aiLoader.classList.remove('hidden');
            aiResultBox.classList.add('hidden');

            // Reset error or progress text inside loader
            aiLoader.innerHTML = `
                <div class="spinner"></div>
                <p>Consultando a Gemini y procesando estadísticas multivariables...</p>
            `;

            try {
                const prediction = await api.getAIPrediction(matchId);
                
                // Set predicted score
                document.getElementById('ai-score-a').textContent = prediction.predictedScoreA;
                document.getElementById('ai-score-b').textContent = prediction.predictedScoreB;
                
                // Set volatility
                const volEl = document.getElementById('ai-volatility');
                volEl.textContent = prediction.volatility;
                volEl.className = 'volatility-pill'; // reset classes
                if (prediction.volatility.toLowerCase().includes('alta')) {
                    volEl.classList.add('vol-high');
                } else if (prediction.volatility.toLowerCase().includes('media')) {
                    volEl.classList.add('vol-medium');
                } else {
                    volEl.classList.add('vol-low');
                }

                // Set probabilities bars
                const localBar = document.getElementById('prob-local');
                const drawBar = document.getElementById('prob-draw');
                const awayBar = document.getElementById('prob-away');

                localBar.style.width = `${prediction.probabilities.local}%`;
                localBar.querySelector('span').textContent = `L: ${prediction.probabilities.local}%`;
                
                drawBar.style.width = `${prediction.probabilities.draw}%`;
                drawBar.querySelector('span').textContent = `E: ${prediction.probabilities.draw}%`;
                
                awayBar.style.width = `${prediction.probabilities.away}%`;
                awayBar.querySelector('span').textContent = `V: ${prediction.probabilities.away}%`;

                // Set multivariable breakdown
                document.getElementById('ai-factor-form').textContent = prediction.keyFactors.form;
                document.getElementById('ai-factor-absences').textContent = prediction.keyFactors.absences;
                document.getElementById('ai-factor-h2h').textContent = prediction.keyFactors.h2h;
                document.getElementById('ai-factor-home').textContent = prediction.keyFactors.homeAdvantage;
                document.getElementById('ai-factor-motivation').textContent = prediction.keyFactors.motivation;

                // Set value detected and suggested bet
                document.getElementById('ai-value-text').textContent = prediction.valueDetected;
                document.getElementById('ai-suggested-bet').textContent = prediction.suggestedBet;

                // Set disclaimer
                document.getElementById('ai-disclaimer').textContent = prediction.responsibilityDisclaimer;
                
                aiLoader.classList.add('hidden');
                aiResultBox.classList.remove('hidden');

                // Auto-fill inputs if user wants
                document.getElementById(`score-a-${matchId}`).value = prediction.predictedScoreA;
                document.getElementById(`score-b-${matchId}`).value = prediction.predictedScoreB;

            } catch (err) {
                aiLoader.innerHTML = `<p style="color: var(--danger)">Error: ${err.message}</p>`;
            }
        };
    }
});
