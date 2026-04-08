import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import { Server } from 'socket.io';
import { GoogleSheetService } from './googleSheet.service.js';
import { MediaService } from './media.service.js';

export class TelegramService {
  private static clients = new Map<string, TelegramClient>();
  private static messages: any[] = [];
  private static MAX_CACHE = 2000;
  private static isInitialized = false;

  static async init(io: Server) {
    if (this.isInitialized) return;
    
    console.log('[Telegram] Pre-loading all history from Google Sheets...');
    try {
      const allMessages = await GoogleSheetService.getMessages() || [];
      this.messages = allMessages.map((m: any) => ({
        id: m.id,
        telegramMessageId: m.telegramMessageId,
        senderId: m.senderId,
        senderName: m.senderName,
        senderPhoto: m.senderPhoto,
        type: m.type,
        text: m.text,
        isOutgoing: !!m.isOutgoing,
        accountId: m.accountId,
        licenseKey: m.licenseKey, // Essential for data isolation
        timestamp: m.timestamp,
        isReplied: !!m.isReplied
      })).sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, this.MAX_CACHE);
    } catch (e) {
      console.error('[Telegram] Pre-load failed:', e);
    }

    const accounts = await GoogleSheetService.getAccounts() || [];
    for (const account of accounts) {
      const apiId = parseInt(process.env.TELEGRAM_API_ID || '0');
      const apiHash = process.env.TELEGRAM_API_HASH || '';
      if (!apiId || !apiHash || !account.session) continue;

      const client = new TelegramClient(new StringSession(account.session), apiId, apiHash, {
        connectionRetries: 5,
        autoReconnect: true
      });

      try {
        await client.connect();
        if (await client.checkAuthorization()) {
          this.clients.set(account.id, client);
          this.setupHandlers(client, io, account.id, account.licenseKey);
          if (account.pts && account.date) {
            this.syncUpdates(client, account.id, account.licenseKey, account.pts, account.date, io);
          }
        }
      } catch (e) {}
    }
    this.isInitialized = true;
  }

  static getClient(accountId: string) {
    return this.clients.get(accountId);
  }

  static getCachedMessages() {
    return this.messages;
  }

  static setupHandlers(client: TelegramClient, io: Server, myId: string, licenseKey: string) {
    client.addEventHandler(async (event: any) => {
      try {
        await this.processIncomingMessage(client, event.message, myId, licenseKey, io);
      } catch (error) {
        console.error('Handler error:', error);
      }
    }, new NewMessage({}));
  }

  static async processIncomingMessage(client: TelegramClient, msg: any, myId: string, licenseKey: string, io: Server) {
    if (!msg || !msg.id) return;
    const chatId = msg.chatId?.toString();
    if (!chatId) return;

    if (this.messages.some(m => m.telegramMessageId === msg.id && m.accountId === myId)) return;

    let name = 'Unknown', photo = '';
    try {
      const sender = await msg.getSender();
      if (sender) {
        name = (sender.firstName || '') + (sender.lastName ? ' ' + sender.lastName : '');
      }
    } catch (e) {}

    let type = 'text', content = msg.message || '';
    if (msg.photo || msg.video || msg.voice || msg.audio) {
        type = msg.photo ? 'image' : msg.video ? 'video' : 'voice';
        this.downloadMediaInBackground(client, msg, type, (finalContent) => {
            const update = { telegramMessageId: msg.id, accountId: myId, text: finalContent };
            io.emit('message_media_ready', update);
            const cached = this.messages.find(m => m.telegramMessageId === msg.id && m.accountId === myId);
            if (cached) cached.text = finalContent;
        });
    }

    const messageData = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      telegramMessageId: msg.id,
      senderId: chatId,
      senderName: name,
      senderPhoto: photo,
      type,
      text: content,
      isOutgoing: !!msg.out,
      accountId: myId,
      licenseKey, // Associate message with specific license
      timestamp: new Date().toISOString(),
      isReplied: false
    };

    this.messages.unshift(messageData);
    if (this.messages.length > this.MAX_CACHE) this.messages.pop();

    // Only emit to sockets belonging to this licenseKey
    // (In a more advanced setup, we'd use rooms: io.to(licenseKey).emit(...))
    io.emit('new_message', messageData);

    GoogleSheetService.saveMessage(messageData, licenseKey).catch(err => {});
  }

  private static async downloadMediaInBackground(client: TelegramClient, msg: any, type: string, callback: (url: string) => void) {
    try {
        const buffer = await client.downloadMedia(msg);
        if (buffer && Buffer.isBuffer(buffer)) {
            const url = await MediaService.saveBuffer(buffer, type as any);
            callback(url);
        }
    } catch (e) {}
  }

  static async syncUpdates(client: TelegramClient, accountId: string, licenseKey: string, savedPts: number, savedDate: number, io: Server) {
    let currentPts = savedPts;
    let currentDate = savedDate;
    try {
      while (true) {
        const diff = await client.invoke(new Api.updates.GetDifference({ pts: currentPts, date: currentDate, qts: 0 }));
        if (diff instanceof Api.updates.DifferenceEmpty) break;
        if (diff instanceof Api.updates.DifferenceSlice || diff instanceof Api.updates.Difference) {
          if ('newMessages' in diff) {
            for (const msg of (diff as any).newMessages) {
              await this.processIncomingMessage(client, msg, accountId, licenseKey, io);
            }
          }
          const state = (diff as any).state;
          if (state instanceof Api.updates.State) {
            currentPts = state.pts;
            currentDate = state.date;
            await GoogleSheetService.saveAccount({ id: accountId, pts: currentPts, date: currentDate }, licenseKey);
          }
          if (diff instanceof Api.updates.Difference) break;
        } else break;
      }
    } catch (e) {}
  }

  static async saveAccount(client: TelegramClient) {
    const me: any = await client.getMe();
    let photo = '';
    try {
      const buffer = await client.downloadProfilePhoto(me);
      if (buffer) photo = 'data:image/jpeg;base64,' + buffer.toString('base64');
    } catch (e) {}

    const session = (client.session as StringSession).save();
    let pts: number | null = null, date: number | null = null;
    try {
      const state = await client.invoke(new Api.updates.GetState());
      if (state instanceof Api.updates.State) {
        pts = state.pts;
        date = state.date;
      }
    } catch (e) {}

    return {
      id: me.id.toString(),
      phone: me.phone,
      session,
      firstName: me.firstName,
      lastName: me.lastName,
      username: me.username,
      photo,
      pts,
      date,
      isActive: true
    };
  }

  static async logout(accountId?: string) {
    if (accountId) {
      const client = this.clients.get(accountId);
      if (client) {
        await client.disconnect();
        this.clients.delete(accountId);
      }
      await GoogleSheetService.deleteAccount(accountId);
    }
  }
}
