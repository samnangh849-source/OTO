import express from 'express';
import { GoogleSheetService } from '../../services/googleSheet.service.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

router.use(auth);

router.get('/templates', async (req, res) => {
    try {
        const licenseKey = (req as any).user?.key;
        let templates = await GoogleSheetService.getTemplates(licenseKey);
        if (!Array.isArray(templates)) {
            console.error('[API] Failed to fetch templates or returned error:', templates);
            templates = [];
        }
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

router.put('/templates/:id', async (req, res) => {
    try {
        const licenseKey = (req as any).user?.key;
        const template = {
            ...req.body,
            id: parseInt(req.params.id),
            licenseKey
        };
        await GoogleSheetService.saveTemplate(template, licenseKey);
        res.json(template);
    } catch (e) {
        res.status(500).json({ error: 'Failed to update template' });
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
