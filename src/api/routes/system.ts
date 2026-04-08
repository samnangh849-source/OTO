import express from 'express';
import { networkInterfaces } from 'os';
import { GoogleSheetService } from '../../services/googleSheet.service.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();
const PORT = parseInt(process.env.PORT || '3000', 10);

router.use(auth);

router.get('/network', (req, res) => {
    const results: string[] = [];
    
    // If running on Render, add the Render URL if available
    if (process.env.RENDER_EXTERNAL_URL) {
        results.push(process.env.RENDER_EXTERNAL_URL);
    }

    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]!) {
            if (net.family === 'IPv4' && !net.internal) {
                results.push(`http://${net.address}:${PORT}`);
            }
        }
    }
    res.json({ addresses: results, port: PORT });
});

router.get('/stats', async (req, res) => {
    try {
        const licenseKey = (req as any).user?.key;
        let messages = await GoogleSheetService.getMessages(licenseKey);
        if (!Array.isArray(messages)) {
            console.error('[API] Failed to fetch messages for stats:', messages);
            messages = [];
        }
        const total = messages.length;
        const incoming = messages.filter((m: any) => !m.isOutgoing).length;
        const outgoing = messages.filter((m: any) => m.isOutgoing).length;
        const unreplied = messages.filter((m: any) => !m.isOutgoing && !m.isReplied).length;
        
        // Count top users
        const counts: Record<string, number> = {};
        messages.forEach((m: any) => {
            if (!m.isOutgoing) {
                const name = m.senderName || 'Unknown';
                counts[name] = (counts[name] || 0) + 1;
            }
        });
        
        const topUsers = Object.entries(counts)
            .map(([sender_name, c]) => ({ sender_name, c }))
            .sort((a, b) => b.c - a.c)
            .slice(0, 5);

        res.json({ totalMessages: total, totalUsers: Object.keys(counts).length, repliedMessages: outgoing, incoming, unreplied, topUsers });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

export default router;
