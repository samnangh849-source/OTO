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
        if (!licenseKey) return socket.emit('tg_error', 'Unauthorized');
        if (!TELEGRAM_API_ID || !TELEGRAM_API_HASH) return socket.emit('tg_error', 'Missing API Credentials');
        
        activeAuthClient = new TelegramClient(new StringSession(''), TELEGRAM_API_ID, TELEGRAM_API_HASH, { connectionRetries: 5 });
        await activeAuthClient.connect();
        
        await activeAuthClient.signInUserWithQrCode({ apiId: TELEGRAM_API_ID, apiHash: TELEGRAM_API_HASH }, {
          onError: async (err: any) => { 
            socket.emit('tg_error', String(err.message || err)); 
            return true; 
          },
          qrCode: async (code) => { 
            socket.emit('tg_qr', { qr: await QRCode.toDataURL(`tg://login?token=${code.token.toString('base64url')}`) }); 
          },
          password: async (hint) => { 
            socket.emit('tg_password_required', hint); 
            return new Promise((resolve) => socket.once('tg_submit_password', resolve)); 
          }
        });

        const account = await TelegramService.saveAccount(activeAuthClient);
        // Link account to licenseKey
        const updatedAccount = { ...account, licenseKey };
        await GoogleSheetService.saveAccount(updatedAccount, licenseKey);

        TelegramService.setupHandlers(activeAuthClient, io, account.id);
        socket.emit('tg_connected', { user: updatedAccount });
        io.emit('tg_status', { status: 'connected' });
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

    socket.on('disconnect', () => {
        if (activeAuthClient) activeAuthClient.disconnect();
    });
  });
}
