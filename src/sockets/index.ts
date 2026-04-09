import { Server, Socket } from 'socket.io';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import QRCode from 'qrcode';
import jwt from 'jsonwebtoken';
import { TelegramService } from '../services/telegram.service.js';
import { GoogleSheetService } from '../services/googleSheet.service.js';

const TELEGRAM_API_ID = parseInt(process.env.TELEGRAM_API_ID || '0');
const TELEGRAM_API_HASH = process.env.TELEGRAM_API_HASH || '';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

export function setupSockets(io: Server) {
  io.on('connection', (socket: Socket) => {
    let activeAuthClient: TelegramClient | null = null;
    let userLicenseKey: string | null = null;

    // Helper to get licenseKey from socket handshake
    const getLicenseKey = () => {
        const token = socket.handshake.auth?.token;
        if (!token) return null;
        try {
            const decoded = jwt.verify(token, JWT_SECRET) as any;
            return decoded.key;
        } catch (e) { return null; }
    };

    // Join room for the licenseKey
    const licenseKey = getLicenseKey();
    if (licenseKey) {
        socket.join(licenseKey);
        console.log(`[Socket] Client joined room: ${licenseKey}`);
    }

    socket.on('check_telegram_status', async () => {
      const licenseKey = getLicenseKey();
      let accounts = await GoogleSheetService.getAccounts(licenseKey);
      if (!Array.isArray(accounts)) {
        console.error('[Socket] Failed to fetch accounts or returned error:', accounts);
        accounts = [];
      }
      socket.emit('tg_accounts_list', accounts);
      socket.emit('tg_status', { status: accounts.length > 0 ? 'connected' : 'disconnected' });
    });

    socket.on('request_qr', async () => {
      try {
        const licenseKey = getLicenseKey();
        console.log(`[Socket] QR Request for license: ${licenseKey}`);
        if (!licenseKey) return socket.emit('tg_error', 'Unauthorized: Missing License Key');
        if (!TELEGRAM_API_ID || !TELEGRAM_API_HASH) {
            console.error('[Socket] Missing API Credentials in .env');
            return socket.emit('tg_error', 'Missing API Credentials in Server Configuration');
        }
        
        activeAuthClient = new TelegramClient(new StringSession(''), TELEGRAM_API_ID, TELEGRAM_API_HASH, { 
            connectionRetries: 5,
            deviceModel: 'OTO Dashboard',
            systemVersion: '1.0.0'
        });
        
        console.log('[Socket] Connecting to Telegram...');
        await activeAuthClient.connect();
        
        console.log('[Socket] Starting QR Login session...');
        await activeAuthClient.signInUserWithQrCode({ apiId: TELEGRAM_API_ID, apiHash: TELEGRAM_API_HASH }, {
          onError: async (err: any) => { 
            console.error('[Socket] QR Login Error:', err);
            socket.emit('tg_error', String(err.message || err)); 
            return true; 
          },
          qrCode: async (code) => { 
            const qrData = await QRCode.toDataURL(`tg://login?token=${code.token.toString('base64url')}`);
            console.log('[Socket] QR Code Generated');
            socket.emit('tg_qr', { qr: qrData }); 
          },
          password: async (hint) => { 
            console.log('[Socket] 2FA Password Required');
            socket.emit('tg_password_required', hint); 
            return new Promise((resolve) => socket.once('tg_submit_password', resolve)); 
          }
        });

        console.log('[Socket] Login Successful');
        const account = await TelegramService.saveAccount(activeAuthClient);
        const updatedAccount = { ...account, licenseKey };
        
        console.log(`[Socket] Saving account ${account.id} to Google Sheets...`);
        await GoogleSheetService.saveAccount(updatedAccount, licenseKey);

        console.log(`[Socket] Registering client ${account.id} in TelegramService...`);
        TelegramService.registerClient(account.id, activeAuthClient, io, licenseKey);
        
        socket.emit('tg_connected', { user: updatedAccount });
        io.emit('tg_status', { status: 'connected' });
      } catch (err: any) { 
        console.error('[Socket] Critical QR Error:', err);
        socket.emit('tg_error', String(err.message || err)); 
      }
    });

    socket.on('tg_send_phone', async (phone: string) => {
      try {
        const licenseKey = getLicenseKey();
        if (!licenseKey) return socket.emit('tg_error', 'Unauthorized');
        
        activeAuthClient = new TelegramClient(new StringSession(''), TELEGRAM_API_ID, TELEGRAM_API_HASH, { connectionRetries: 5 });
        await activeAuthClient.connect();
        
        await activeAuthClient.start({
          phoneNumber: async () => phone,
          phoneCode: async () => {
            socket.emit('tg_code_required');
            return new Promise((resolve) => socket.once('tg_submit_code', resolve));
          },
          password: async (hint) => {
            socket.emit('tg_password_required', hint);
            return new Promise((resolve) => socket.once('tg_submit_password', resolve));
          },
          onError: (err) => socket.emit('tg_error', String(err.message || err)),
        });

        const account = await TelegramService.saveAccount(activeAuthClient);
        const updatedAccount = { ...account, licenseKey };
        await GoogleSheetService.saveAccount(updatedAccount, licenseKey);
        TelegramService.registerClient(account.id, activeAuthClient, io, licenseKey);
        
        socket.emit('tg_connected', { user: updatedAccount });
      } catch (err: any) {
        socket.emit('tg_error', String(err.message || err));
      }
    });

    socket.on('logout_telegram', async (accountId?: string) => {
      try {
        const licenseKey = getLicenseKey();
        await TelegramService.logout(accountId);
        let accounts = await GoogleSheetService.getAccounts(licenseKey);
        if (!Array.isArray(accounts)) accounts = [];
        socket.emit('tg_accounts_list', accounts);
        socket.emit('tg_status', { status: accounts.length > 0 ? 'connected' : 'disconnected' });
      } catch (err: any) {
        socket.emit('tg_error', String(err.message || err));
      }
    });

    socket.on('tg_sync_all', async () => {
        try {
            const licenseKey = getLicenseKey();
            if (!licenseKey) return;
            const accounts = await GoogleSheetService.getAccounts(licenseKey);
            if (!Array.isArray(accounts)) return;

            for (const account of accounts) {
                const client = TelegramService.getClient(account.id);
                if (client && account.pts && account.date) {
                    await TelegramService.syncUpdates(client, account.id, licenseKey, account.pts, account.date, io);
                }
            }
            socket.emit('tg_sync_finished');
        } catch (e) {
            socket.emit('tg_sync_finished');
        }
    });

    socket.on('tg_sync_history', async ({ days }: { days: number }) => {
        try {
            const licenseKey = getLicenseKey();
            if (!licenseKey) return;
            const accounts = await GoogleSheetService.getAccounts(licenseKey);
            if (!Array.isArray(accounts)) return;

            for (const account of accounts) {
                const client = TelegramService.getClient(account.id);
                if (client) {
                    await TelegramService.syncHistory(client, account.id, licenseKey, days, (progress) => {
                        socket.emit('tg_sync_status', { progress });
                    });
                }
            }
            socket.emit('tg_sync_finished');
        } catch (e) {
            socket.emit('tg_sync_finished');
        }
    });

    socket.on('tg_get_history', async (data: { accountId: string, chatId: string }) => {
        try {
            const licenseKey = getLicenseKey();
            if (!licenseKey) return;

            const messages = await TelegramService.getChatMessages(data.accountId, data.chatId, 30, licenseKey, io);
            const dbMessages = await GoogleSheetService.getMessages(licenseKey) || [];

            // បញ្ចូលស្ថានភាព isReplied ពី Google Sheets ចូលទៅក្នុងសារដែលបានមកពី Cloud
            const combined = messages.map(m => {
                const dbMatch = dbMessages.find(dbm => dbm.telegramMessageId.toString() === m.telegramMessageId.toString() && dbm.accountId === m.accountId);
                return {
                    ...m,
                    id: m.telegramMessageId, // ប្រើ ID ពី Telegram តែម្ដង
                    isReplied: dbMatch ? dbMatch.isReplied : false,
                    senderName: dbMatch ? dbMatch.senderName : (m.isOutgoing ? 'Me' : 'User ' + m.senderId),
                    senderPhoto: dbMatch ? dbMatch.senderPhoto : ''
                };
            });

            socket.emit('chat_history', { chatId: data.chatId, messages: combined });
        } catch (e) {
            console.error('[Socket] Get history error:', e);
        }
    });

    socket.on('disconnect', () => {
        if (activeAuthClient) activeAuthClient.disconnect();
    });
  });
}
