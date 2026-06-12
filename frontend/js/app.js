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
                const [matches, bets, profile] = await Promise.all([
                    api.getMatches(),
                    api.getBets(),
                    api.getProfile()
                ]);

                renderMatches(matches);
                renderBets(bets);
                
                // Update balance in header navbar
                document.getElementById('user-balance').textContent = `$${parseFloat(profile.balance).toFixed(2)}`;
            } catch (err) {
                if (err.message === 'Unauthorized') {
                    localStorage.removeItem('jwt');
                    window.location.href = 'index.html';
                }
                console.error(err);
            }
        }

        // ---- SPA Navigation Logic ----
        const navLinks = document.querySelectorAll('.nav-link');
        const tabViews = document.querySelectorAll('.tab-view');

        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                const targetId = link.getAttribute('data-target');
                
                // Set active class on nav link
                navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');

                // Switch views
                tabViews.forEach(view => {
                    if (view.id === targetId) {
                        view.classList.remove('hidden');
                        view.classList.add('active-view');
                    } else {
                        view.classList.add('hidden');
                        view.classList.remove('active-view');
                    }
                });

                // Load view specific data
                if (targetId === 'view-profile') {
                    loadProfileView();
                } else if (targetId === 'view-wallet') {
                    resetWalletView();
                } else if (targetId === 'view-matches') {
                    loadDashboard();
                }
            });
        });

        // ---- Profile View Logic ----
        async function loadProfileView() {
            try {
                const profile = await api.getProfile();
                const bets = await api.getBets();
                
                // Update text elements
                document.getElementById('profile-username').textContent = profile.username;
                document.getElementById('profile-balance').textContent = `$${parseFloat(profile.balance).toFixed(2)}`;
                document.getElementById('profile-total-bets').textContent = profile.totalBets;
                
                // Update header balance too just in case
                document.getElementById('user-balance').textContent = `$${parseFloat(profile.balance).toFixed(2)}`;
                
                // Render bets list in profile
                const profileBetsList = document.getElementById('profile-bets-list');
                if (bets.length === 0) {
                    profileBetsList.innerHTML = '<p style="color: var(--text-muted)">No has realizado apuestas aún.</p>';
                    return;
                }
                
                profileBetsList.innerHTML = '';
                bets.forEach(bet => {
                    const isPending = bet.status === 'pending';
                    const item = document.createElement('div');
                    item.className = 'bet-item';
                    item.style.borderLeft = isPending ? '4px solid var(--primary-color)' : '4px solid var(--secondary-color)';
                    item.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                            <span class="bet-item-header" style="margin-bottom: 0;">${bet.team_a} vs ${bet.team_b}</span>
                            <span style="font-size: 0.75rem; color: var(--text-muted);">${new Date(bet.created_at).toLocaleString('es-ES')}</span>
                        </div>
                        <div class="bet-item-score">
                            Tu predicción: <b>${bet.predicted_score_a} - ${bet.predicted_score_b}</b>
                        </div>
                        ${!isPending ? `
                            <div class="bet-item-score" style="margin-top: 5px; color: ${bet.actual_score_a === bet.predicted_score_a && bet.actual_score_b === bet.predicted_score_b ? 'var(--secondary-color)' : 'var(--danger)'}">
                                Resultado real: <b>${bet.actual_score_a} - ${bet.actual_score_b}</b> (${bet.actual_score_a === bet.predicted_score_a && bet.actual_score_b === bet.predicted_score_b ? 'Ganada' : 'No acertada'})
                            </div>
                        ` : `
                            <div class="bet-item-score" style="margin-top: 5px; color: var(--secondary-color)">
                                Estado: Pendiente de partido
                            </div>
                        `}
                    `;
                    profileBetsList.appendChild(item);
                });
            } catch (err) {
                console.error('Error loading profile view:', err);
            }
        }

        // ---- Wallet Logic ----
        let selectedChargeAmount = 0;
        const presetBtns = document.querySelectorAll('.preset-btn');
        const customAmountInput = document.getElementById('custom-amount');
        const confirmAmountBtn = document.getElementById('btn-confirm-amount');
        const paymentForm = document.getElementById('payment-form');
        const cardNameInput = document.getElementById('card-name');
        const cardNumInput = document.getElementById('card-num');
        const cardCvvInput = document.getElementById('card-cvv');
        const payBtn = document.getElementById('btn-pay');
        const walletMsg = document.getElementById('wallet-msg');

        // Preset button clicks
        presetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                presetBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                customAmountInput.value = '';
                selectedChargeAmount = parseFloat(btn.getAttribute('data-amount'));
                walletMsg.textContent = '';
            });
        });

        // Custom amount input change
        customAmountInput.addEventListener('input', () => {
            presetBtns.forEach(b => b.classList.remove('active'));
            selectedChargeAmount = parseFloat(customAmountInput.value) || 0;
            walletMsg.textContent = '';
        });

        // Continue to payment form
        confirmAmountBtn.addEventListener('click', () => {
            if (selectedChargeAmount <= 0) {
                walletMsg.textContent = 'Por favor, selecciona o ingresa un monto mayor a 0.';
                walletMsg.className = 'form-msg msg-error';
                return;
            }
            
            walletMsg.textContent = `Monto de recarga seleccionado: $${selectedChargeAmount.toFixed(2)}. Complete los datos de la tarjeta.`;
            walletMsg.className = 'form-msg msg-success';

            // Enable card input fields
            cardNameInput.disabled = false;
            cardNumInput.disabled = false;
            cardCvvInput.disabled = false;
            payBtn.disabled = false;
            
            // Set dynamic pay button label
            payBtn.textContent = `Pagar y Cargar $${selectedChargeAmount.toFixed(2)}`;
        });

        // Card mockup interactive binding
        cardNameInput.addEventListener('input', (e) => {
            const val = e.target.value;
            document.querySelector('.card-holder-name').textContent = val.trim() || 'NOMBRE COMPLETO';
        });

        cardNumInput.addEventListener('input', (e) => {
            // Format input: 4000 1234 5678 9010
            let val = e.target.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
            let matches = val.match(/\d{4,16}/g);
            let match = matches && matches[0] || '';
            let parts = [];

            for (let i=0, len=match.length; i<len; i+=4) {
                parts.push(match.substring(i, i+4));
            }

            if (parts.length > 0) {
                e.target.value = parts.join(' ');
                document.querySelector('.card-number').textContent = parts.join(' ');
            } else {
                e.target.value = val;
                document.querySelector('.card-number').textContent = val || '•••• •••• •••• ••••';
            }
        });

        paymentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (selectedChargeAmount <= 0) return;
            
            payBtn.disabled = true;
            payBtn.textContent = 'Procesando pago seguro...';
            
            try {
                // Call API to charge wallet
                const response = await api.chargeWallet(selectedChargeAmount);
                
                // Update UI balance
                document.getElementById('user-balance').textContent = `$${parseFloat(response.balance).toFixed(2)}`;
                
                walletMsg.textContent = `¡Transacción exitosa! Se han acreditado $${parseFloat(selectedChargeAmount).toFixed(2)} a tu cuenta.`;
                walletMsg.className = 'form-msg msg-success';
                
                // Confetti/success animation simulation
                document.querySelector('.credit-card-mockup').style.boxShadow = '0 0 30px rgba(16, 185, 129, 0.6)';
                setTimeout(() => {
                    document.querySelector('.credit-card-mockup').style.boxShadow = '';
                }, 1500);

                // Reset forms
                setTimeout(() => {
                    resetWalletView();
                    // Go to matches view
                    document.querySelector('[data-target="view-matches"]').click();
                }, 2000);

            } catch (err) {
                walletMsg.textContent = err.message;
                walletMsg.className = 'form-msg msg-error';
                payBtn.disabled = false;
                payBtn.textContent = `Pagar y Cargar $${parseFloat(selectedChargeAmount).toFixed(2)}`;
            }
        });

        function resetWalletView() {
            selectedChargeAmount = 0;
            presetBtns.forEach(b => b.classList.remove('active'));
            customAmountInput.value = '';
            
            cardNameInput.value = '';
            cardNameInput.disabled = true;
            
            cardNumInput.value = '';
            cardNumInput.disabled = true;
            
            cardCvvInput.value = '';
            cardCvvInput.disabled = true;
            
            payBtn.disabled = true;
            payBtn.textContent = 'Pagar y Acreditar Saldo';
            
            document.querySelector('.card-holder-name').textContent = 'NOMBRE COMPLETO';
            document.querySelector('.card-number').textContent = '•••• •••• •••• ••••';
            
            walletMsg.textContent = '';
        }

        // ---- Chatbot Logic ----
        const chatForm = document.getElementById('chat-form');
        const chatInput = document.getElementById('chat-input');
        const chatMessages = document.getElementById('chat-messages');
        const suggestBtns = document.querySelectorAll('.suggest-btn');

        // Handle quick suggestions click
        suggestBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const msg = btn.getAttribute('data-msg');
                chatInput.value = msg;
                chatForm.dispatchEvent(new Event('submit'));
            });
        });

        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const message = chatInput.value.trim();
            if (!message) return;

            // Append user message
            appendChatMessage(message, 'user');
            chatInput.value = '';

            // Append typing indicator
            const typingIndicator = appendTypingIndicator();
            chatMessages.scrollTop = chatMessages.scrollHeight;

            try {
                // Call API
                const result = await api.sendChatMessage(message);
                
                // Remove typing indicator
                typingIndicator.remove();
                
                // Append bot response
                appendChatMessage(result.response, 'bot');
            } catch (err) {
                typingIndicator.remove();
                appendChatMessage(`Disculpa, ha ocurrido un error al procesar tu solicitud: ${err.message}`, 'bot');
            }
            
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });

        function appendChatMessage(text, sender) {
            const msgDiv = document.createElement('div');
            msgDiv.className = `chat-message ${sender}`;
            
            const bubble = document.createElement('div');
            bubble.className = 'message-bubble';
            
            if (sender === 'bot') {
                // Basic markdown parsing for bold text, headers, lists and newlines
                let html = text
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<i>$1</i>')
                    .replace(/### (.*?)\n/g, '<h3>$1</h3>')
                    .replace(/\n\* (.*?)/g, '<li>$1</li>')
                    .replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>')
                    .replace(/\n/g, '<br>');
                bubble.innerHTML = html;
            } else {
                bubble.textContent = text;
            }
            
            msgDiv.appendChild(bubble);
            chatMessages.appendChild(msgDiv);
        }

        function appendTypingIndicator() {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'chat-message bot';
            
            const bubble = document.createElement('div');
            bubble.className = 'message-bubble';
            bubble.innerHTML = `
                <div class="typing-indicator">
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                </div>
            `;
            
            msgDiv.appendChild(bubble);
            chatMessages.appendChild(msgDiv);
            return msgDiv;
        }

        function renderMatches(matches) {
            matchesList.innerHTML = '';
            if (!matches || matches.length === 0) {
                matchesList.innerHTML = '<p style="color:var(--text-muted);padding:1rem">No hay partidos disponibles.</p>';
                return;
            }
            matches.forEach(match => {
                const isPending = match.status === 'pending';
                const card = document.createElement('div');
                card.className = 'match-card glass-panel';

                // Crest images (flags)
                const homeCrest = match.crest_a
                    ? `<img class="team-crest" src="${match.crest_a}" alt="" onerror="this.style.display='none'">`
                    : '';
                const awayCrest = match.crest_b
                    ? `<img class="team-crest" src="${match.crest_b}" alt="" onerror="this.style.display='none'">`
                    : '';

                card.innerHTML = `
                    <div class="match-header">
                        <span>${new Date(match.match_date).toLocaleString('es-ES', {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'})}</span>
                        <span class="status-pill ${isPending ? 'status-sched' : 'status-fin'}">${isPending ? 'Pendiente' : '✔ Finalizado'}</span>
                    </div>
                    <div class="match-teams">
                        <span>${homeCrest}${match.team_a}</span>
                        <span class="vs">VS</span>
                        <span>${awayCrest}${match.team_b}</span>
                    </div>
                    <div class="match-odds">
                        <span class="odd-badge">L: <b>${parseFloat(match.odds_a).toFixed(2)}</b></span>
                        <span class="odd-badge">E: <b>${parseFloat(match.odds_draw).toFixed(2)}</b></span>
                        <span class="odd-badge">V: <b>${parseFloat(match.odds_b).toFixed(2)}</b></span>
                    </div>
                    ${isPending ? `
                        <div class="bet-inputs">
                            <input type="number" id="score-a-${match.id}" class="score-input" min="0" max="15" value="0">
                            <span>-</span>
                            <input type="number" id="score-b-${match.id}" class="score-input" min="0" max="15" value="0">
                        </div>
                        <div class="card-actions">
                            <button class="btn primary-btn btn-sm" onclick="placeBet(${match.id})">Apostar</button>
                            <button class="btn outline-btn btn-sm" onclick="askAI(${match.id}, '${match.team_a.replace(/'/g, "\\'")}', '${match.team_b.replace(/'/g, "\\'")}')">🤖 Consultar IA</button>
                        </div>
                    ` : `
                        <div class="bet-inputs" style="font-weight: bold; font-size: 1.5rem; text-align: center; justify-content: center; width: 100%;">
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
