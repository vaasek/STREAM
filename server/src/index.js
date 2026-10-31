import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { resolveUser } from './auth.js';
import { config } from './config.js';
import { ensureAdmin } from './db.js';
import { startMedia } from './media.js';
import { registerRoutes } from './routes.js';
import { registerSockets } from './sockets.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({ origin: true }));
app.use(express.json({ limit: '256kb' }));

registerRoutes(app);
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Не найдено' });
});

const indexHtml = path.join(config.webDist, 'index.html');
if (fs.existsSync(indexHtml)) {
  app.use(express.static(config.webDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(indexHtml);
  });
} else {
  console.log('Сборка веб-клиента не найдена. В разработке откройте http://127.0.0.1:5173');
}

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: status >= 500 ? 'Внутренняя ошибка сервера' : error.message });
});

function attachUser(socket, next) {
  const queryToken = socket.handshake.query?.token;
  const fromQuery = Array.isArray(queryToken) ? queryToken[0] : queryToken;
  const user = resolveUser(`Bearer ${socket.handshake.auth?.token || fromQuery || ''}`);
  if (!user) return next(new Error('unauthorized'));
  socket.user = user;
  next();
}

const httpServer = http.createServer(app);
const httpsServer = config.tlsCert && config.tlsKey
  ? https.createServer({
    cert: fs.readFileSync(config.tlsCert),
    key: fs.readFileSync(config.tlsKey),
  }, app)
  : null;
const httpsOnMainPort = Boolean(httpsServer) && config.httpsPort === config.port;

const io = new Server({
  cors: { origin: true },
  maxHttpBufferSize: 1e6,
});
io.use(attachUser);
io.attach(httpsOnMainPort ? httpsServer : httpServer);
if (httpsServer && !httpsOnMainPort) io.attach(httpsServer);
registerSockets(io);

const admin = ensureAdmin();
await startMedia();

function logReady() {
  if (config.announcedIpIsLocal) {
    console.log('ANNOUNCED_IP не задан — медиа доступно только с этого компьютера. Для сети укажите IP сервера в .env');
  }
  if (admin.created) {
    console.log(`Создан администратор: ${admin.email}`);
    if (admin.generated) console.log(`Пароль записан в ${config.dataDir}${path.sep}initial-admin.txt`);
    else console.log('Пароль администратора взят из ADMIN_PASSWORD');
  }
}

if (httpsOnMainPort) {
  httpsServer.listen(config.port, config.host, () => {
    console.log(`Streamon ${config.version} слушает https://${config.host}:${config.port}`);
    logReady();
  });
} else {
  httpServer.listen(config.port, config.host, () => {
    console.log(`Streamon ${config.version} слушает http://${config.host}:${config.port}`);
    logReady();
  });
  if (httpsServer) {
    httpsServer.listen(config.httpsPort, config.host, () => {
      console.log(`Камера и микрофон: ${config.httpsUrl}`);
    });
  }
}

function shutdown() {
  httpServer.close();
  httpsServer?.close();
  io.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
