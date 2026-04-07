import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { networkInterfaces } from 'os';
import authRoutes from './src/api/routes/auth.js';
import messageRoutes from './src/api/routes/messages.js';
import systemRoutes from './src/api/routes/system.js';
import templateRoutes from './src/api/routes/templates.js';
import { setupSockets } from './src/sockets/index.js';
import { TelegramService } from './src/services/telegram.service.js';
import { MediaService } from './src/services/media.service.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const distPath = process.env.APP_DIST_PATH || path.join(process.cwd(), 'dist');

async function startServer() {
  await MediaService.ensureUploadsDir();

  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, { cors: { origin: '*' } });
  
  app.use(cors());
  app.use(express.json({ limit: '100mb' }));
  
  // Serve uploads folder statically
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // Init Telegram
  await TelegramService.init(io);

  // Setup Routes
  app.use('/api', authRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api', systemRoutes);
  app.use('/api/templates', templateRoutes);

  // Setup Sockets
  setupSockets(io);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }
  
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Dashboard: http://localhost:${PORT}`);
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]!) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`[Server] Mobile/Network: http://${net.address}:${PORT}`);
        }
      }
    }
  });
}

startServer();
