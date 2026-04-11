import express from 'express';
import { obtenerCitas, cambiarEstadoCita } from '../services/citas.service.js';

const router = express.Router();

router.get('/appointments', async (req, res) => {
    try {
        const citas = await obtenerCitas();
        res.status(200).json(citas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.patch('/appointments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'Status es requerido' });
        
        const data = await cambiarEstadoCita(id, status);
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
