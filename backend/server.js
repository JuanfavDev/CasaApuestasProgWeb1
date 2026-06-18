const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

const path = require('path');
const { settleBets } = require('./workers/settlement');

app.use(express.static(path.join(__dirname, '../frontend')));

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    
    // Ejecutar liquidación de apuestas inmediatamente al arrancar
    settleBets().catch(err => console.error('Error inicial de liquidación:', err));
    
    // Programar liquidación para que corra cada 1 minuto (60000 ms)
    setInterval(() => {
        settleBets().catch(err => console.error('Error periódico de liquidación:', err));
    }, 60000);
});
