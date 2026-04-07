import express from 'express';
import { GoogleSheetService } from '../../services/googleSheet.service.js';

const router = express.Router();

router.get('/', async (req, res) => {
    const templates = await GoogleSheetService.getTemplates() || [];
    res.json(templates);
});

router.post('/', async (req, res) => {
    const { name, type, content, tags = '' } = req.body;
    const templateData = { id: Date.now(), name, type, content, tags };
    await GoogleSheetService.saveTemplate(templateData);
    res.json(templateData);
});

router.put('/:id', async (req, res) => {
    const { name, type, content, tags = '' } = req.body;
    const templateData = { id: parseInt(req.params.id), name, type, content, tags };
    await GoogleSheetService.saveTemplate(templateData);
    res.json({ success: true });
});

router.delete('/:id', async (req, res) => {
    await GoogleSheetService.deleteTemplate(parseInt(req.params.id));
    res.json({ success: true });
});

export default router;
