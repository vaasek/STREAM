import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureCertificate } from './tls.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '../..');

loadEnvFile(path.join(repoRoot, '.env'));

const dataDir = path.resolve(process.env.DATA_DIR || path.join(repoRoot, 'data'));
fs.mkdirSync(dataDir, { recursive: true });

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function readOrCreateSecret(name) {
  const file = path.join(dataDir, name);
  if (fs.existsSync(file)) {
    const value = fs.readFileSync(file, 'utf8').trim();
    if (value) return value;
  }
  const value = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, value + '\n', { mode: 0o600 });
  return value;
}

const announcedIp = (process.env.ANNOUNCED_IP || '').trim() || '127.0.0.1';
const httpsPort = Number(process.env.HTTPS_PORT || 8443);

function resolveExisting(value) {
  const raw = (value || '').trim();
  if (!raw) return '';
  const file = path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
  return fs.existsSync(file) ? file : '';
}

function localTls() {
  if ((process.env.HTTPS || '').trim() === '0') return { cert: '', key: '' };
  const cert = resolveExisting(process.env.TLS_CERT);
  const key = resolveExisting(process.env.TLS_KEY);
  if (cert && key) return { cert, key };
  try {
    return ensureCertificate(repoRoot, announcedIp);
  } catch (error) {
    console.error('HTTPS-сертификат не создан. Нужен openssl:', error.message);
    return { cert: '', key: '' };
  }
}

const tls = localTls();

export const config = {
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || '0.0.0.0',
  dataDir,
  announcedIp,
  announcedIpIsLocal: announcedIp === '127.0.0.1' || announcedIp === 'localhost',
  rtcMinPort: Number(process.env.RTC_MIN_PORT || 40000),
  rtcMaxPort: Number(process.env.RTC_MAX_PORT || 40199),
  jwtSecret: (process.env.JWT_SECRET || '').trim() || readOrCreateSecret('jwt.secret'),
  adminEmail: (process.env.ADMIN_EMAIL || 'admin@streamon.local').trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  httpsPort,
  tlsCert: tls.cert,
  tlsKey: tls.key,
  httpsUrl: tls.cert ? `https://${announcedIp}:${httpsPort}` : '',
  mediasoupLog: process.env.MEDIASOUP_LOG || 'warn',
  webDist: path.join(repoRoot, 'web', 'dist'),
  version: '1.0.0',
};

export const initialAdminFile = path.join(dataDir, 'initial-admin.txt');
