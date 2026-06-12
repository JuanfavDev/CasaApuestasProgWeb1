const API_URL = 'http://localhost:3000/api';

const api = {
    // Utility to get auth headers
    getHeaders() {
        const token = localStorage.getItem('jwt');
        return {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        };
    },

    async register(username, password) {
        const res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al registrarse');
        return data;
    },

    async login(username, password) {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión');
        localStorage.setItem('jwt', data.token);
        localStorage.setItem('username', data.username);
        return data;
    },

    async getMatches() {
        const res = await fetch(`${API_URL}/matches`, { headers: this.getHeaders() });
        if (!res.ok) {
            if (res.status === 401) throw new Error('Unauthorized');
            throw new Error('Error fetching matches');
        }
        return res.json();
    },

    async getBets() {
        const res = await fetch(`${API_URL}/bets`, { headers: this.getHeaders() });
        if (!res.ok) throw new Error('Error fetching bets');
        return res.json();
    },

    async placeBet(matchId, scoreA, scoreB) {
        const res = await fetch(`${API_URL}/bets`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({ matchId, scoreA, scoreB })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error placing bet');
        return data;
    },

    async getAIPrediction(matchId) {
        const res = await fetch(`${API_URL}/predict/${matchId}`, {
            method: 'POST',
            headers: this.getHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error generating AI prediction');
        return data;
    },

    async getProfile() {
        const res = await fetch(`${API_URL}/profile`, { headers: this.getHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al obtener el perfil');
        return data;
    },

    async chargeWallet(amount) {
        const res = await fetch(`${API_URL}/wallet/charge`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({ amount })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al recargar la billetera');
        return data;
    },

    async sendChatMessage(message) {
        const res = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({ message })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error en el chat');
        return data;
    },

    async getLiveMatches() {
        const res = await fetch(`${API_URL}/live-matches`, { headers: this.getHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al obtener partidos en vivo');
        return data; // { source: 'live'|'local'|'local_fallback', matches: [...], cached: bool }
    }
};
