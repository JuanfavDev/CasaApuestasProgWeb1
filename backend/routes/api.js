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
        const prompt = `As a sports betting expert AI, predict the exact score for the 2026 World Cup match between ${match.team_a} and ${match.team_b}. Consider their historical performance. Provide your response as a JSON object with strictly these keys: "predictedScoreA" (number), "predictedScoreB" (number), and "reasoning" (a short 2-3 sentence explanation). Do not use markdown blocks, return only the raw JSON string.`;

        // Mock prediction if no API key is provided
        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
             return res.json({
                 predictedScoreA: Math.floor(Math.random() * 4),
                 predictedScoreB: Math.floor(Math.random() * 4),
                 reasoning: `(Mocked AI Prediction) Based on historical match data, ${match.team_a} and ${match.team_b} usually play tight matches. This is a simulated prediction because no Gemini API key was provided.`
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

module.exports = router;
