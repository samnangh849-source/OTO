import express from 'express';
import { GoogleSheetService } from '../../services/googleSheet.service.js';
import { TelegramService } from '../../services/telegram.service.js';
import { MediaService } from '../../services/media.service.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

router.use(auth);

router.get('/', async (req, res) => {
    try {
        const licenseKey = (req as any).user?.key;
        if (!licenseKey) return res.status(401).json({ error: 'Unauthorized' });

        // Serve from RAM cache first
        let messages = TelegramService.getCachedMessages().filter(m => m.licenseKey === licenseKey);
        
        // If empty (e.g., after server restart), fetch from Google Sheets
        if (messages.length === 0) {
            const dbMessages = await GoogleSheetService.getMessages(licenseKey);
            if (dbMessages && Array.isArray(dbMessages)) {
                // Return them, but also add to RAM cache for next requests
                dbMessages.forEach(m => {
                    if (!TelegramService.getCachedMessages().some(cm => cm.telegramMessageId === m.telegramMessageId && cm.accountId === m.accountId)) {
                        TelegramService.addMessageToCache(m);
                    }
                });
                messages = dbMessages;
            }
        }
        
        res.json(messages);
    } catch (e) {
        console.error('[API] Failed to fetch messages:', e);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

router.post('/send', async (req, res) => {
    const { chatId, type, content, accountId } = req.body;
    const licenseKey = (req as any).user?.key;
    
    const client = TelegramService.getClient(accountId);
    if (!client) return res.status(500).json({ error: 'Account not linked' });

    try {
        const peer = await client.getEntity(BigInt(chatId) as any);
        let sent;
        let finalContent = content;

        if (type === 'text') {
            sent = await client.sendMessage(peer, { message: content });
        } else {
            const { file, attributes } = await MediaService.preprocessMedia(type, content);
            sent = await client.sendFile(peer, { file, attributes, forceDocument: false } as any);
            if (content.startsWith('data:')) {
                finalContent = await MediaService.saveBase64File(content, type as any);
            }
        }

        const newMessageData = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            telegramMessageId: sent.id,
            senderId: chatId,
            senderName: 'Me',
            type,
            text: finalContent,
            isOutgoing: true,
            accountId,
            licenseKey, // Add licenseKey to isolate data
            timestamp: new Date().toISOString(),
            isReplied: false
        };

        // Message is already in TelegramService.messages via processIncomingMessage or cached locally
        TelegramService.addMessageToCache(newMessageData);

        res.json(newMessageData);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/reply', async (req, res) => {
    const { messageId, telegramMessageId, accountId, templateId } = req.body;
    const licenseKey = (req as any).user?.key;
    
    if (!accountId) return res.status(404).json({ error: 'Account ID required' });

    const client = TelegramService.getClient(accountId);
    if (!client) return res.status(500).json({ error: 'Account not linked' });

    const templates = await GoogleSheetService.getTemplates(licenseKey) || [];
    const template = templates.find((t: any) => t.id.toString() === templateId.toString());
    if (!template) return res.status(404).json({ error: 'Template not found' });

    try {
        const messages = TelegramService.getCachedMessages().filter(m => m.licenseKey === licenseKey);
        const message = messages.find((m: any) => m.telegramMessageId.toString() === telegramMessageId.toString());
        if (!message) return res.status(404).json({ error: 'Message not found' });

        const peer = await client.getEntity(BigInt(message.senderId) as any);
        if (template.type === 'flow') {
            const steps = JSON.parse(template.content);
            res.json({ success: true, part: 'flow_started' });
            let isFirstStep = true;
            for (const step of steps) {
                if (step.type === 'delay') {
                    await new Promise(r => setTimeout(r, (step.duration || 2) * 1000));
                    continue;
                }
                const replyTo = isFirstStep ? message.telegramMessageId : undefined;
                isFirstStep = false;
                
                let sent;
                let stepContent = step.content;
                if (step.type === 'text') {
                    sent = await client.sendMessage(peer, { message: step.content, replyTo });
                } else {
                    const { file, attributes } = await MediaService.preprocessMedia(step.type, step.content);
                    sent = await client.sendFile(peer, { file, replyTo, attributes, forceDocument: false } as any);
                    if (step.content.startsWith('data:')) {
                        stepContent = await MediaService.saveBase64File(step.content, step.type as any);
                    }
                }

                TelegramService.addMessageToCache({
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    telegramMessageId: sent.id,
                    senderId: message.senderId,
                    senderName: 'Me',
                    type: step.type,
                    text: stepContent,
                    isOutgoing: true,
                    accountId: message.accountId,
                    licenseKey,
                    timestamp: new Date().toISOString(),
                    isReplied: false
                });
            }
        } else {
            let sent;
            let finalContent = template.content;
            if (template.type === 'text') {
                sent = await client.sendMessage(peer, { message: template.content, replyTo: message.telegramMessageId });
            } else {
                const { file, attributes } = await MediaService.preprocessMedia(template.type, template.content);
                sent = await client.sendFile(peer, { file, replyTo: message.telegramMessageId, attributes, forceDocument: false } as any);
                if (template.content.startsWith('data:')) {
                    finalContent = await MediaService.saveBase64File(template.content, template.type as any);
                }
            }
            TelegramService.addMessageToCache({
                id: Date.now() + Math.floor(Math.random() * 1000),
                telegramMessageId: sent.id,
                senderId: message.senderId,
                senderName: 'Me',
                type: template.type,
                text: finalContent,
                isOutgoing: true,
                accountId: message.accountId,
                licenseKey,
                timestamp: new Date().toISOString(),
                isReplied: false
            });
            res.json({ success: true });
        }
        
        // Update isReplied status in cache
        const targetMessage = TelegramService.getCachedMessages().find(m => m.telegramMessageId === message.telegramMessageId && m.accountId === accountId);
        if (targetMessage) targetMessage.isReplied = true;

    } catch (e: any) {
        if (!res.headersSent) res.status(500).json({ error: e.message });
    }
});

export default router;
