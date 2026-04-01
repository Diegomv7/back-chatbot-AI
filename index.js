import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';

// Cargar variables de entorno
dotenv.config();

// Módulos internos
import apiRoutes from './src/routes/api.routes.js';
import { bot } from './src/services/bot.service.js';

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors()); // Habilita peticiones desde el frontend (React)
app.use(express.json()); // Entiende JSON

// Ruta de diagnóstico simple
app.get('/', (req, res) => {
    res.send('Servidor Veterinaria AI (Modular) funcionando 🚀');
});

// Rutas de API REST para el Frontend
app.use('/api', apiRoutes);

// Ruta del Webhook para Telegram
app.post('/webhook', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// Iniciar Servidor
app.listen(port, () => {
    console.log(`Servidor local corriendo en http://localhost:${port}`);
});