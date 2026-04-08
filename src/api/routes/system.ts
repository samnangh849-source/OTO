import express from 'express';
import { networkInterfaces } from 'os';
import { GoogleSheetService } from '../../services/googleSheet.service.js';

const router = express.Router();
const PORT = parseInt(process.env.PORT || '3000', 10);

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
        const messages = await GoogleSheetService.getMessages() || [];
        const total = messages.length;
        const incoming = messages.filter((m: any) => !(m.isOutgoing !== undefined ? m.isOutgoing : m.is_outgoing)).length;
        const outgoing = messages.filter((m: any) => (m.isOutgoing !== undefined ? m.isOutgoing : m.is_outgoing)).length;
        const unreplied = messages.filter((m: any) => !(m.isOutgoing !== undefined ? m.isOutgoing : m.is_outgoing) && !(m.isReplied !== undefined ? m.isReplied : m.is_replied)).length;
        
        // Count top users
        const counts: Record<string, number> = {};
        messages.forEach((m: any) => {
            const isOut = m.isOutgoing !== undefined ? m.isOutgoing : m.is_outgoing;
            if (!isOut) {
                const name = m.senderName || m.sender_name || 'Unknown';
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
