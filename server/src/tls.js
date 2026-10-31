import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function ensureCertificate(repoRoot, announcedIp) {
  const dir = path.join(repoRoot, 'deploy', 'tls');
  const cert = path.join(dir, 'cert.pem');
  const key = path.join(dir, 'key.pem');
  const stamp = path.join(dir, 'ip.txt');
  const ip = announcedIp && announcedIp !== 'localhost' ? announcedIp : '127.0.0.1';
  const current = fs.existsSync(stamp) ? fs.readFileSync(stamp, 'utf8').trim() : '';
  if (fs.existsSync(cert) && fs.existsSync(key) && current === ip) return { cert, key };
  fs.mkdirSync(dir, { recursive: true });
  const names = ['IP:127.0.0.1', 'DNS:localhost'];
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && ip !== '127.0.0.1') names.unshift(`IP:${ip}`);
  else if (ip !== '127.0.0.1') names.unshift(`DNS:${ip}`);
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-days', '825', '-nodes',
    '-keyout', key,
    '-out', cert,
    '-subj', `/CN=${ip}`,
    '-addext', `subjectAltName=${names.join(',')}`,
  ], { stdio: 'ignore' });
  try { fs.chmodSync(key, 0o600); } catch { /* Windows */ }
  fs.writeFileSync(stamp, `${ip}\n`);
  return { cert, key };
}
