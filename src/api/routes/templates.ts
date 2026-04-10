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
        const result = await GoogleSheetService.saveTemplate(template, licenseKey);
        if (!result || (result as any).error) {
            return res.status(500).json({ error: (result as any)?.error || 'Failed to save template to database' });
        }
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
        const result = await GoogleSheetService.saveTemplate(template, licenseKey);
        if (!result || (result as any).error) {
            return res.status(500).json({ error: (result as any)?.error || 'Failed to update template in database' });
        }
        res.json(template);
    } catch (e) {
        res.status(500).json({ error: 'Failed to update template' });
    }
});

router.delete('/templates/:id', async (req, res) => {
    try {
        const licenseKey = (req as any).user?.key;
        const result = await GoogleSheetService.deleteTemplate(parseInt(req.params.id), licenseKey);
        if (!result || (result as any).error || (result as any).success === false) {
            return res.status(500).json({ error: (result as any)?.error || 'Failed to delete template from database' });
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to delete template' });
    }
});

export default router;
