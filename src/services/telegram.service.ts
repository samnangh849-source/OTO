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
    
    this.messages = []; // Clear local cache on start

    try {
      // Fetch ALL accounts to reconnect them on server start
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
            console.log(`[Telegram] Reconnected account: ${account.id} (${account.licenseKey})`);
            this.registerClient(account.id, client, io, account.licenseKey);
            if (account.pts && account.date) {
              this.syncUpdates(client, account.id, account.licenseKey, account.pts, account.date, io);
            }
          }
        } catch (e: any) {
          if (e.errorMessage === 'AUTH_KEY_DUPLICATED' || e.code === 406) {
            console.error(`[Telegram] Session conflict for account ${account.id}. Disconnecting to prevent block.`);
            await client.disconnect();
          } else {
            console.error(`[Telegram] Failed to reconnect account ${account.id}:`, e.message || e);
          }
        }
      }
    } catch (e) {
      console.error('[Telegram] Accounts load failed:', e);
    }
    this.isInitialized = true;
  }

  static registerClient(accountId: string, client: TelegramClient, io: Server, licenseKey: string) {
    this.clients.set(accountId, client);
    this.setupHandlers(client, io, accountId, licenseKey);
  }

  static getClient(accountId: string) {
    return this.clients.get(accountId);
  }

  static getCachedMessages() {
    return this.messages;
  }

  static addMessageToCache(messageData: any) {
    this.messages.unshift(messageData);
    if (this.messages.length > this.MAX_CACHE) this.messages.pop();
  }

  static setupHandlers(client: TelegramClient, io: Server, myId: string, licenseKey: string) {
    client.addEventHandler(async (event: any) => {
      try {
        await this.processIncomingMessage(client, event.message, myId, licenseKey, io);
      } catch (error) {
        console.error('Handler error:', error);
      }
    }, new NewMessage({ incoming: true, outgoing: true }));
  }

  static async processIncomingMessage(client: TelegramClient, msg: any, myId: string, licenseKey: string, io: Server) {
    if (!msg || !msg.id) return;
    const chatId = msg.chatId?.toString();
    if (!chatId) return;

    if (this.messages.some(m => m.telegramMessageId === msg.id && m.accountId === myId)) return;

    let name = 'Unknown', photo = '';
    try {
      // Use getEntity as a more robust fallback for getting sender info
      let sender: any = null;
      try {
          sender = await msg.getSender();
          if (!sender && msg.senderId) {
              sender = await client.getEntity(msg.senderId);
          }
      } catch (e) {
          if (msg.senderId) {
              try { sender = await client.getEntity(msg.senderId); } catch (e2) {}
          }
      }

      if (sender) {
        // Resolve Name: Priority 1. First/Last Name, 2. Title (for groups), 3. Username, 4. ID
        const firstName = sender.firstName || '';
        const lastName = sender.lastName || '';
        const title = sender.title || '';
        
        name = (firstName + ' ' + lastName).trim();
        if (!name && title) name = title;
        if (!name && sender.username) name = sender.username;
        if (!name) name = sender.id?.toString() || 'User ' + chatId;
        
        // Fetch sender's profile photo
        try {
            const photoBuffer = await client.downloadProfilePhoto(sender);
            if (photoBuffer && photoBuffer.length > 0) {
                if (photoBuffer.length < 25000) { 
                    photo = 'data:image/jpeg;base64,' + photoBuffer.toString('base64');
                } else {
                    photo = await MediaService.saveBuffer(photoBuffer, 'image');
                }
            }
        } catch (e) {
            console.log(`[Telegram] Photo download skipped for ${name}`);
        }
      } else {
          name = 'User ' + chatId;
      }
    } catch (e) {
        console.error('[Telegram] Error resolving sender:', e);
        name = 'User ' + chatId;
    }

    let type = 'text', content = msg.message || '';
    if (msg.photo || msg.video || msg.voice || msg.audio) {
        type = msg.photo ? 'image' : msg.video ? 'video' : 'voice';
        this.downloadMediaInBackground(client, msg, type, (finalContent) => {
            const cached = this.messages.find(m => m.telegramMessageId === msg.id && m.accountId === myId);
            if (cached) cached.text = finalContent;
        }, licenseKey, io);
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

    // Save to Google Sheets for persistence
    GoogleSheetService.saveMessage(messageData, licenseKey).catch(e => {
        console.error('[TelegramService] Failed to save message to Google Sheets:', e);
    });

    // Only emit to sockets belonging to this licenseKey
    if (licenseKey) {
        io.to(licenseKey).emit('new_message', messageData);
    } else {
        io.emit('new_message', messageData);
    }
  }

  private static async downloadMediaInBackground(client: TelegramClient, msg: any, type: string, callback: (url: string) => void, licenseKey?: string, io?: Server) {
    try {
        const buffer = await client.downloadMedia(msg);
        if (buffer && Buffer.isBuffer(buffer)) {
            const url = await MediaService.saveBuffer(buffer, type as any);
            callback(url);
            if (licenseKey && io) {
                io.to(licenseKey).emit('message_media_ready', { 
                    telegramMessageId: msg.id, 
                    accountId: client.session.getAuthKey().toString(), // Approximate
                    text: url 
                });
            }
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
            // Only update PTS/Date in Google Sheets for session recovery
            await GoogleSheetService.saveAccount({ id: accountId, pts: currentPts, date: currentDate }, licenseKey);
          }
          if (diff instanceof Api.updates.Difference) break;
        } else break;
      }
    } catch (e) {
        console.error('[TelegramService] syncUpdates error:', e);
    }
  }

  static async syncHistory(client: TelegramClient, accountId: string, licenseKey: string, days: number, onProgress: (progress: any) => void) {
    try {
        const dialogs = await client.getDialogs({});
        const total = dialogs.length;
        let current = 0;
        const now = Math.floor(Date.now() / 1000);
        const limitDate = now - (days * 24 * 60 * 60);

        for (const dialog of dialogs) {
            current++;
            onProgress({ 
                current, 
                total, 
                percent: Math.round((current / total) * 100) 
            });

            try {
                let lastDate = now;
                while (true) {
                    const messages = await client.getMessages(dialog.id, {
                        limit: 50,
                        offsetDate: lastDate,
                    });

                    if (messages.length === 0) break;

                    let reachedLimit = false;
                    for (const msg of messages) {
                        if (msg.date < limitDate) {
                            reachedLimit = true;
                            break;
                        }
                        await this.processIncomingMessage(client, msg, accountId, licenseKey, { emit: () => {} } as any);
                        lastDate = msg.date;
                    }

                    if (reachedLimit || messages.length < 50) break;
                }
            } catch (e) {
                console.error(`[TelegramService] Failed to sync history for dialog ${dialog.id}:`, e);
            }
        }
    } catch (e) {
        console.error('[TelegramService] syncHistory error:', e);
    }
  }

  static async saveAccount(client: TelegramClient) {
    const me: any = await client.getMe();
    let photo = '';
    try {
      const buffer = await client.downloadProfilePhoto(me);
      if (buffer && buffer.length > 0) {
          // Resize or limit base64 size if needed. For now, just ensure it's a valid jpeg base64.
          photo = 'data:image/jpeg;base64,' + buffer.toString('base64');
          
          // Google Sheets cell limit is 50,000 characters. 
          // If photo is too large, it might be better to save it as a file.
          if (photo.length > 45000) {
              console.log(`[TelegramService] Profile photo for ${me.id} is too large (${photo.length} chars). Saving as file.`);
              photo = await MediaService.saveBuffer(buffer, 'image');
          }
      }
    } catch (e) {
        console.error(`[TelegramService] Failed to download profile photo for ${me.id}:`, e);
    }

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
        client.removeEventHandler(() => {}, new NewMessage({})); // Clear handlers
        await client.disconnect();
        this.clients.delete(accountId);
      }
      await GoogleSheetService.deleteAccount(accountId);
    }
  }

  static async getChatMessages(accountId: string, chatId: string, limit: number = 30) {
    const client = this.clients.get(accountId);
    if (!client) return [];

    try {
        const messages = await client.getMessages(chatId, { limit });
        const result = [];
        
        for (const msg of messages) {
            let type = 'text', text = msg.message || '';
            
            if (msg.photo || msg.video || msg.voice || msg.audio) {
                type = msg.photo ? 'image' : msg.video ? 'video' : 'voice';
                // សម្រាប់សារចាស់ៗដែលបានមកពី Cloud យើងអាចសាកល្បងទាញយក Media បើចាំបាច់
                // ប៉ុន្តែដើម្បីឱ្យ Dashboard ដើរលឿន យើងគ្រាន់តែផ្ដល់អត្ថបទសារជាមុនសិន
            }

            result.push({
                telegramMessageId: msg.id,
                senderId: chatId,
                text: text,
                type: type,
                isOutgoing: !!msg.out,
                timestamp: new Date(msg.date * 1000).toISOString(),
                accountId: accountId
            });
        }
        return result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (e) {
        console.error('[TelegramService] Error fetching history:', e);
        return [];
    }
  }
}
