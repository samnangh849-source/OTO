import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import { Server } from 'socket.io';
import { GoogleSheetService } from './googleSheet.service.js';
import { MediaService } from './media.service.js';

export class TelegramService {
  private static clients = new Map<string, TelegramClient>();
  private static buttonMappings = new Map<string, Map<string, { type: string, value: string }>>();

  static async init(io: Server) {
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
          
          // Check Last Data & Sync
          if (account.pts && account.date) {
            this.syncUpdates(client, account.id, account.pts, account.date, io);
          } else {
            const lastMessage = await GoogleSheetService.findLastMessage(account.id);
            if (lastMessage) {
              const lastDate = Math.floor(new Date(lastMessage.timestamp).getTime() / 1000);
              this.syncHistoryByDate(client, account.id, lastDate, io);
            }
          }

          await this.saveAccount(client);
          console.log(`Account connected: ${account.phone}`);
        } else {
          console.warn(`Account unauthorized: ${account.phone}`);
          await GoogleSheetService.deleteAccount(account.id);
        }
      } catch (e) {
        console.error(`Failed to connect account ${account.phone}:`, e);
      }
    }
  }

  static getClient(accountId: string) {
    return this.clients.get(accountId);
  }

  static async syncAll(io: Server) {
    const accounts = await GoogleSheetService.getAccounts() || [];
    for (const account of accounts) {
      const client = this.clients.get(account.id);
      if (!client) continue;

      if (account.pts && account.date) {
        await this.syncUpdates(client, account.id, account.pts, account.date, io);
      } else {
        // Check Last Data fallback
        const lastMessage = await GoogleSheetService.findLastMessage(account.id);
        if (lastMessage) {
          const lastDate = Math.floor(new Date(lastMessage.timestamp).getTime() / 1000);
          await this.syncHistoryByDate(client, account.id, lastDate, io);
        }
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
            limit: 50 // Limit per dialog for quick check
          });

          for (const msg of messages) {
            if (msg.date < offsetDate) break;
            await this.processIncomingMessage(client, msg, accountId, io);
          }
        } catch (e) {
          console.error(`Failed to sync history for dialog ${dialog.name}:`, e);
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
      
      // Update PTS after a deep sync to avoid repeated history pulls
      await this.saveAccount(client);
    } catch (e) {
      console.error('History sync by date failed:', e);
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
      // Logout all
      for (const [id, client] of this.clients.entries()) {
        await client.disconnect();
      }
      this.clients.clear();
      // Note: Add logic to delete all if needed
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

    const account = await GoogleSheetService.saveAccount(accountData);

    return account;
  }

  static setupHandlers(client: TelegramClient, io: Server, myId: string) {
    client.addEventHandler(async (event: any) => {
      try {
        await this.processIncomingMessage(client, event.message, myId, io);
      } catch (error) {
        console.error('New message handler error:', error);
      }
    }, new NewMessage({}));

    // Add other handlers (typing, status, read) here...
  }

  static async processIncomingMessage(client: TelegramClient, msg: any, myId: string, io: Server) {
    if (!msg || msg.out) return;
    const chatId = msg.chatId?.toString();
    if (!chatId) return;

    const existing = await GoogleSheetService.findMessage(msg.id, myId);
    if (existing) return;

    let name = 'Unknown', photo = '';
    try {
      const sender = await msg.getSender();
      if (sender) {
        name = (sender.firstName || '') + (sender.lastName ? ' ' + sender.lastName : '');
        const buffer = await client.downloadProfilePhoto(sender);
        if (buffer) photo = 'data:image/jpeg;base64,' + buffer.toString('base64');
      }
    } catch (e) {}

    let type = 'text', content = msg.message || '';
    try {
      if (msg.photo || msg.video || msg.voice || msg.audio || (msg.document && msg.document.mimeType?.startsWith('audio/'))) {
        const buffer = await client.downloadMedia(msg);
        if (buffer) {
          const mediaType = msg.photo ? 'image' : msg.video ? 'video' : 'voice';
          content = await MediaService.saveBuffer(buffer, mediaType as any);
          type = mediaType;
        }
      }
    } catch (e) {
      console.warn('Failed to download media:', e);
    }

    const messageData = {
      telegram_message_id: msg.id,
      chat_id: chatId,
      sender_name: name,
      sender_photo: photo,
      type,
      content,
      is_outgoing: false,
      accountId: myId,
      timestamp: new Date().toISOString()
    };

    const newMessage = await GoogleSheetService.saveMessage(messageData);

    if (newMessage) {
      io.emit('new_message', { ...newMessage, timestamp: new Date(newMessage.timestamp).toISOString() });
    }
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

        if (diff instanceof Api.updates.DifferenceEmpty) {
          break;
        }

        if (diff instanceof Api.updates.DifferenceSlice || diff instanceof Api.updates.Difference) {
          // Process messages
          if ('newMessages' in diff) {
            for (const msg of diff.newMessages) {
              await this.processIncomingMessage(client, msg, accountId, io);
            }
          }

          // Process other updates if needed
          if ('otherUpdates' in diff) {
             for (const update of diff.otherUpdates) {
               if (update instanceof Api.UpdateNewMessage) {
                 await this.processIncomingMessage(client, update.message, accountId, io);
               }
             }
          }

          // Update state
          const state = diff.state;
          if (state instanceof Api.updates.State) {
            currentPts = state.pts;
            currentDate = state.date;
            
            // Save current state
            await GoogleSheetService.saveAccount({ id: accountId, pts: currentPts, date: currentDate });
          }

          if (diff instanceof Api.updates.Difference) {
            break;
          }
        } else if (diff instanceof Api.updates.DifferenceTooLong) {
            // If too long, just update to the newest state
            const state = await client.invoke(new Api.updates.GetState());
            if (state instanceof Api.updates.State) {
              await GoogleSheetService.saveAccount({ id: accountId, pts: state.pts, date: state.date });
            }
            break;
        } else {
          break;
        }
      }
    } catch (e) {
      console.error(`Sync failed for account ${accountId}:`, e);
    }
  }
}
