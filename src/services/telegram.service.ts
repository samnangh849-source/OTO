import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import { Server } from 'socket.io';
import { GoogleSheetService } from './googleSheet.service.js';
import { MediaService } from './media.service.js';

export class TelegramService {
  private static clients = new Map<string, TelegramClient>();
  private static messages: any[] = [];
  private static MAX_CACHE = 1000; // Keep last 1000 messages in RAM for real-time
  private static isInitialized = false;

  static async init(io: Server) {
    if (this.isInitialized) return;
    
    // 1. Pre-load history from Google Sheet into RAM for fast initial load
    console.log('[Telegram] Pre-loading history from Google Sheets into RAM...');
    try {
      const history = await GoogleSheetService.getMessages() || [];
      this.messages = history.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, this.MAX_CACHE);
      console.log(`[Telegram] Cache warmed up: ${this.messages.length} messages loaded.`);
    } catch (e) {
      console.error('[Telegram] Failed to pre-load history:', e);
    }

    const accounts = await GoogleSheetService.getAccounts() || [];
    for (const account of accounts) {
      const apiId = parseInt(process.env.TELEGRAM_API_ID || '0');
      const apiHash = process.env.TELEGRAM_API_HASH || '';
      
      if (!apiId || !apiHash) continue;

      const client = new TelegramClient(new StringSession(account.session), apiId, apiHash, {
        connectionRetries: 5,
        autoReconnect: true
      });

      try {
        await client.connect();
        if (await client.checkAuthorization()) {
          this.clients.set(account.id, client);
          this.setupHandlers(client, io, account.id);
          
          // Initial Sync in background
          if (account.pts && account.date) {
            this.syncUpdates(client, account.id, account.pts, account.date, io);
          } else {
            // Fallback sync last 24h
            const oneDayAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
            this.syncHistoryByDate(client, account.id, oneDayAgo, io);
          }

          console.log(`Account connected: ${account.phone || account.id}`);
        } else {
          console.warn(`Account unauthorized: ${account.phone || account.id}`);
        }
      } catch (e) {
        console.error(`Failed to connect account ${account.phone || account.id}:`, e);
      }
    }
    this.isInitialized = true;
  }

  static getClient(accountId: string) {
    return this.clients.get(accountId);
  }

  static getCachedMessages() {
    return this.messages;
  }

  static async syncAll(io: Server) {
    const accounts = await GoogleSheetService.getAccounts() || [];
    for (const account of accounts) {
      const client = this.clients.get(account.id);
      if (!client) continue;

      console.log(`[Sync] Triggering update sync for ${account.phone || account.id}`);
      if (account.pts && account.date) {
        await this.syncUpdates(client, account.id, account.pts, account.date, io);
      } else {
        const oneDayAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
        await this.syncHistoryByDate(client, account.id, oneDayAgo, io);
      }
    }
  }

  static async syncHistory(days: number, io: Server) {
    const offsetDate = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
    const accounts = await GoogleSheetService.getAccounts() || [];
    for (const account of accounts) {
      const client = this.clients.get(account.id);
      if (client) {
        await this.syncHistoryByDate(client, account.id, offsetDate, io);
      }
    }
  }

  static async syncHistoryByDate(client: TelegramClient, accountId: string, offsetDate: number, io: Server) {
    try {
      const dialogs = await client.getDialogs({});
      io.emit('tg_sync_status', { progress: { current: 0, total: dialogs.length, percent: 0 } });
      
      let count = 0;
      for (const dialog of dialogs) {
        try {
          const messages = await client.getMessages(dialog.entity, {
            limit: 20 // Quick lookback
          });

          for (const msg of messages) {
            if (msg.date < offsetDate) break;
            await this.processIncomingMessage(client, msg, accountId, io);
          }
        } catch (e) {
          console.error(`Failed to sync dialog ${dialog.name}:`, e);
        }
        
        count++;
        io.emit('tg_sync_status', { 
          progress: { 
            current: count, 
            total: dialogs.length, 
            percent: Math.round((count / dialogs.length) * 100) 
          } 
        });
      }
      await this.updateAccountState(client, accountId);
    } catch (e) {
      console.error('History sync failed:', e);
    }
  }

  static async logout(accountId?: string) {
    if (accountId) {
      const client = this.clients.get(accountId);
      if (client) {
        await client.disconnect();
        this.clients.delete(accountId);
      }
      await GoogleSheetService.deleteAccount(accountId);
    } else {
      for (const [id, client] of this.clients.entries()) {
        await client.disconnect();
      }
      this.clients.clear();
    }
  }

  static async saveAccount(client: TelegramClient) {
    const me: any = await client.getMe();
    let photo = '';
    try {
      const buffer = await client.downloadProfilePhoto(me);
      if (buffer) photo = 'data:image/jpeg;base64,' + buffer.toString('base64');
    } catch (e) {}

    const session = (client.session as StringSession).save();
    let pts: number | null = null;
    let date: number | null = null;
    
    try {
      const state = await client.invoke(new Api.updates.GetState());
      if (state instanceof Api.updates.State) {
        pts = state.pts;
        date = state.date;
      }
    } catch (e) {}

    const accountData = {
      id: me.id.toString(),
      phone: me.phone,
      session,
      firstName: me.firstName,
      lastName: me.lastName,
      username: me.username,
      photo,
      pts,
      date
    };

    return await GoogleSheetService.saveAccount(accountData);
  }

  private static async updateAccountState(client: TelegramClient, accountId: string) {
    try {
      const state = await client.invoke(new Api.updates.GetState());
      if (state instanceof Api.updates.State) {
        await GoogleSheetService.saveAccount({ id: accountId, pts: state.pts, date: state.date });
      }
    } catch (e) {}
  }

  static setupHandlers(client: TelegramClient, io: Server, myId: string) {
    client.addEventHandler(async (event: any) => {
      try {
        await this.processIncomingMessage(client, event.message, myId, io);
      } catch (error) {
        console.error('New message handler error:', error);
      }
    }, new NewMessage({}));
  }

  static async processIncomingMessage(client: TelegramClient, msg: any, myId: string, io: Server) {
    if (!msg || !msg.id) return;
    const chatId = msg.chatId?.toString();
    if (!chatId) return;

    // Fast check: Already in RAM?
    if (this.messages.some(m => m.telegram_message_id === msg.id && m.accountId === myId)) return;

    let name = 'Unknown', photo = '';
    try {
      const sender = await msg.getSender();
      if (sender) {
        name = (sender.firstName || '') + (sender.lastName ? ' ' + sender.lastName : '');
        // Profile photos are downloaded ONLY if not in RAM to save time
        // Note: For real-time, we might skip photo download initially to be faster
      }
    } catch (e) {}

    let type = 'text', content = msg.message || '';
    if (msg.photo || msg.video || msg.voice || msg.audio) {
        type = msg.photo ? 'image' : msg.video ? 'video' : 'voice';
        // Download in background
        this.downloadMediaInBackground(client, msg, type, (finalContent) => {
            const update = { telegram_message_id: msg.id, accountId: myId, content: finalContent };
            io.emit('message_media_ready', update);
            // Also update in RAM
            const cached = this.messages.find(m => m.telegram_message_id === msg.id && m.accountId === myId);
            if (cached) cached.content = finalContent;
        });
    }

    const messageData = {
      id: Date.now() + Math.floor(Math.random() * 1000), // Temp internal ID
      telegram_message_id: msg.id,
      chat_id: chatId,
      sender_name: name,
      sender_photo: photo,
      type,
      content,
      is_outgoing: !!msg.out,
      accountId: myId,
      timestamp: new Date().toISOString()
    };

    // 1. Push to RAM (Immediate)
    this.messages.unshift(messageData);
    if (this.messages.length > this.MAX_CACHE) this.messages.pop();

    // 2. Emit via Socket (Real-time UI update)
    io.emit('new_message', messageData);

    // 3. Save to Google Sheet (Background)
    GoogleSheetService.saveMessage(messageData).catch(err => {
        console.error('[GSheet] Async save failed:', err);
    });
  }

  private static async downloadMediaInBackground(client: TelegramClient, msg: any, type: string, callback: (url: string) => void) {
    try {
        const buffer = await client.downloadMedia(msg);
        if (buffer) {
            const url = await MediaService.saveBuffer(buffer, type as any);
            callback(url);
        }
    } catch (e) {}
  }

  static async syncUpdates(client: TelegramClient, accountId: string, savedPts: number, savedDate: number, io: Server) {
    let currentPts = savedPts;
    let currentDate = savedDate;
    
    try {
      while (true) {
        const diff = await client.invoke(new Api.updates.GetDifference({
          pts: currentPts,
          date: currentDate,
          qts: 0
        }));

        if (diff instanceof Api.updates.DifferenceEmpty) break;

        if (diff instanceof Api.updates.DifferenceSlice || diff instanceof Api.updates.Difference) {
          if ('newMessages' in diff) {
            for (const msg of (diff as any).newMessages) {
              await this.processIncomingMessage(client, msg, accountId, io);
            }
          }
          
          const state = (diff as any).state;
          if (state instanceof Api.updates.State) {
            currentPts = state.pts;
            currentDate = state.date;
            await GoogleSheetService.saveAccount({ id: accountId, pts: currentPts, date: currentDate });
          }
          if (diff instanceof Api.updates.Difference) break;
        } else if (diff instanceof Api.updates.DifferenceTooLong) {
            await this.updateAccountState(client, accountId);
            break;
        } else break;
      }
    } catch (e) {
      console.error(`Sync failed:`, e);
    }
  }
}
