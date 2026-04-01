import express from 'express';
import { obtenerCitas, cambiarEstadoCita } from '../services/citas.service.js';

const router = express.Router();

router.get('/citas', async (req, res) => {
    try {
        const citas = await obtenerCitas();
        res.status(200).json(citas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.patch('/citas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        if (!estado) return res.status(400).json({ error: 'Estado es requerido' });
        
        const data = await cambiarEstadoCita(id, estado);
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
