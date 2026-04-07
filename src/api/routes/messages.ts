import express from 'express';
import { GoogleSheetService } from '../../services/googleSheet.service.js';
import { TelegramService } from '../../services/telegram.service.js';
import { MediaService } from '../../services/media.service.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

router.use(auth);

router.get('/', async (req, res) => {
    try {
        const messages = await GoogleSheetService.getMessages() || [];
        res.json(messages);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

router.post('/send', async (req, res) => {
    const { chatId, type, content, accountId } = req.body;
    const client = TelegramService.getClient(accountId);
    if (!client) return res.status(500).json({ error: 'Account not linked' });

    try {
        const peer = await client.getEntity(BigInt(chatId));
        let sent;
        let finalContent = content;

        if (type === 'text') {
            sent = await client.sendMessage(peer, { message: content });
        } else {
            const { file, attributes } = await MediaService.preprocessMedia(type, content);
            sent = await client.sendFile(peer, { file, attributes } as any);
            if (content.startsWith('data:')) {
                finalContent = await MediaService.saveBase64File(content, type as any);
            }
        }

        const newMessageData = {
            telegram_message_id: sent.id,
            chat_id: chatId,
            sender_name: 'Me',
            type,
            content: finalContent,
            is_outgoing: true,
            accountId,
            timestamp: new Date().toISOString()
        };

        await GoogleSheetService.saveMessage(newMessageData);

        res.json(newMessageData);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/reply', async (req, res) => {
    const { messageId, telegramMessageId, accountId, templateId } = req.body;
    // Note: Since we don't have findUnique for internal ID in GSheet easily, 
    // we should use telegramMessageId and accountId from request or fetch first.
    
    if (!accountId) return res.status(404).json({ error: 'Account ID required' });

    const client = TelegramService.getClient(accountId);
    if (!client) return res.status(500).json({ error: 'Account not linked' });

    const templates = await GoogleSheetService.getTemplates() || [];
    const template = templates.find((t: any) => t.id.toString() === templateId.toString());
    if (!template) return res.status(404).json({ error: 'Template not found' });

    try {
        const messages = await GoogleSheetService.getMessages(accountId) || [];
        const message = messages.find((m: any) => m.telegram_message_id.toString() === telegramMessageId.toString());
        if (!message) return res.status(404).json({ error: 'Message not found' });

        const peer = await client.getEntity(BigInt(message.chat_id));
        if (template.type === 'flow') {
            const steps = JSON.parse(template.content);
            res.json({ success: true, part: 'flow_started' });
            let isFirstStep = true;
            for (const step of steps) {
                if (step.type === 'delay') {
                    await new Promise(r => setTimeout(r, (step.duration || 2) * 1000));
                    continue;
                }
                const replyTo = isFirstStep ? message.telegram_message_id : undefined;
                isFirstStep = false;
                
                let sent;
                let stepContent = step.content;
                if (step.type === 'text') {
                    sent = await client.sendMessage(peer, { message: step.content, replyTo });
                } else {
                    const { file, attributes } = await MediaService.preprocessMedia(step.type, step.content);
                    sent = await client.sendFile(peer, { file, replyTo, attributes } as any);
                    if (step.content.startsWith('data:')) {
                        stepContent = await MediaService.saveBase64File(step.content, step.type as any);
                    }
                }

                await GoogleSheetService.saveMessage({
                    telegram_message_id: sent.id,
                    chat_id: message.chat_id,
                    sender_name: 'Me',
                    type: step.type,
                    content: stepContent,
                    is_outgoing: true,
                    accountId: message.accountId,
                    timestamp: new Date().toISOString()
                });
            }
        } else {
            let sent;
            let finalContent = template.content;
            if (template.type === 'text') {
                sent = await client.sendMessage(peer, { message: template.content, replyTo: message.telegram_message_id });
            } else {
                const { file, attributes } = await MediaService.preprocessMedia(template.type, template.content);
                sent = await client.sendFile(peer, { file, replyTo: message.telegram_message_id, attributes } as any);
                if (template.content.startsWith('data:')) {
                    finalContent = await MediaService.saveBase64File(template.content, template.type as any);
                }
            }
            await GoogleSheetService.saveMessage({
                telegram_message_id: sent.id,
                chat_id: message.chat_id,
                sender_name: 'Me',
                type: template.type,
                content: finalContent,
                is_outgoing: true,
                accountId: message.accountId,
                timestamp: new Date().toISOString()
            });
            res.json({ success: true });
        }
        
        await GoogleSheetService.saveMessage({
            ...message,
            is_replied: true
        });
    } catch (e: any) {
        if (!res.headersSent) res.status(500).json({ error: e.message });
    }
});

router.get('/export/messages-csv', async (req, res) => {
    const limit = parseInt((req.query.limit as string) || '5000', 10);
    const rows = await prisma.message.findMany({
        take: limit,
        orderBy: { timestamp: 'desc' }
    });

    const header = ['ID','TelegramID','ChatID','Sender','Type','Content','Timestamp','Replied','Outgoing','AccountID'];
    const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
        header.join(','),
        ...rows.map(r => [
            r.id, r.telegram_message_id, escape(r.chat_id), escape(r.sender_name),
            r.type, escape(r.content), escape(r.timestamp.toISOString()),
            r.is_replied ? 1 : 0, r.is_outgoing ? 1 : 0, escape(r.accountId)
        ].join(','))
    ].join('\n');
    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="messages_${date}.csv"`);
    res.send('\uFEFF' + csv);
});

export default router;
