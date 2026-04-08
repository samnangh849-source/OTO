import express from 'express';
import { GoogleSheetService } from '../../services/googleSheet.service.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

router.use(auth);

router.get('/templates', async (req, res) => {
    try {
        const licenseKey = (req as any).user?.key;
        const templates = await GoogleSheetService.getTemplates(licenseKey) || [];
        res.json(templates);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
});

router.post('/templates', async (req, res) => {
    try {
        const licenseKey = (req as any).user?.key;
        const template = {
            ...req.body,
            id: req.body.id || Date.now(),
            licenseKey
        };
        await GoogleSheetService.saveTemplate(template, licenseKey);
        res.json(template);
    } catch (e) {
        res.status(500).json({ error: 'Failed to save template' });
    }
});

router.delete('/templates/:id', async (req, res) => {
    try {
        const licenseKey = (req as any).user?.key;
        await GoogleSheetService.deleteTemplate(parseInt(req.params.id), licenseKey);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to delete template' });
    }
});

export default router;
