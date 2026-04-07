import { Server, Socket } from 'socket.io';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import QRCode from 'qrcode';
import { TelegramService } from '../services/telegram.service.js';
import prisma from '../db/client.js';

const TELEGRAM_API_ID = parseInt(process.env.TELEGRAM_API_ID || '0');
const TELEGRAM_API_HASH = process.env.TELEGRAM_API_HASH || '';

export function setupSockets(io: Server) {
  io.on('connection', (socket: Socket) => {
    // Each socket has its own auth client to prevent race conditions (Point 2)
    let activeAuthClient: TelegramClient | null = null;

    socket.on('check_telegram_status', async () => {
      const accounts = await prisma.tgAccount.findMany();
      socket.emit('tg_accounts_list', accounts);
      socket.emit('tg_status', { status: accounts.length > 0 ? 'connected' : 'disconnected' });
    });

    socket.on('request_qr', async () => {
      try {
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
        TelegramService.setupHandlers(activeAuthClient, io, account.id);
        socket.emit('tg_connected', { user: account });
        io.emit('tg_status', { status: 'connected' });
      } catch (err: any) { 
        socket.emit('tg_error', String(err.message || err)); 
      }
    });

    socket.on('tg_sync_all', async () => {
      try {
        await TelegramService.syncAll(io);
        socket.emit('tg_sync_finished');
      } catch (err: any) {
        socket.emit('tg_error', String(err.message || err));
      }
    });

    socket.on('tg_check_last_data', async () => {
      try {
        await TelegramService.syncAll(io);
        socket.emit('tg_sync_finished');
      } catch (err: any) {
        socket.emit('tg_error', String(err.message || err));
      }
    });

    socket.on('tg_sync_history', async ({ days }) => {
      try {
        await TelegramService.syncHistory(days, io);
        socket.emit('tg_sync_finished');
      } catch (err: any) {
        socket.emit('tg_error', String(err.message || err));
      }
    });

    socket.on('logout_telegram', async (accountId?: string) => {
      try {
        await TelegramService.logout(accountId);
        const accounts = await prisma.tgAccount.findMany();
        socket.emit('tg_accounts_list', accounts);
        socket.emit('tg_status', { status: accounts.length > 0 ? 'connected' : 'disconnected' });
      } catch (err: any) {
        socket.emit('tg_error', String(err.message || err));
      }
    });

    socket.on('tg_send_phone', async (phone: string) => {
        try {
          if (!TELEGRAM_API_ID || !TELEGRAM_API_HASH) return socket.emit('tg_error', 'Missing API Credentials');
          
          activeAuthClient = new TelegramClient(new StringSession(''), TELEGRAM_API_ID, TELEGRAM_API_HASH, { connectionRetries: 5 });
          await activeAuthClient.connect();
  
          await activeAuthClient.start({
            phoneNumber: async () => phone,
            password: async () => {
              socket.emit('tg_password_required');
              return new Promise((resolve) => socket.once('tg_submit_password', resolve));
            },
            phoneCode: async () => {
              socket.emit('tg_code_required');
              return new Promise((resolve) => socket.once('tg_submit_code', resolve));
            },
            onError: async (err: any) => {
              socket.emit('tg_error', err.message || String(err));
              return true;
            }
          });
  
          const account = await TelegramService.saveAccount(activeAuthClient);
          TelegramService.setupHandlers(activeAuthClient, io, account.id);
          socket.emit('tg_connected', { user: account });
          io.emit('tg_status', { status: 'connected' });
        } catch (err: any) {
          socket.emit('tg_error', err.message || String(err));
        }
    });

    socket.on('disconnect', () => {
        // Clean up auth client if it was never finished
        if (activeAuthClient) {
            activeAuthClient.disconnect();
        }
    });
  });
}
