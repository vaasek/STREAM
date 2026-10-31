import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { config, initialAdminFile } from './config.js';
import { now, uid } from './util.js';

const db = new DatabaseSync(path.join(config.dataDir, 'streamon.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'active',
    department_id TEXT,
    created_at TEXT NOT NULL,
    last_login TEXT
  );
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    owner_id TEXT,
    is_public INTEGER NOT NULL DEFAULT 0,
    password_hash TEXT,
    max_participants INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    ended_at TEXT,
    peak_peers INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS room_roles (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    PRIMARY KEY (room_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    user_id TEXT,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, created_at);
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id TEXT,
    actor_name TEXT,
    action TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL
  );
`);

const userColumns = db.prepare('PRAGMA table_info(users)').all();
if (!userColumns.some((column) => column.name === 'department_id')) {
  db.exec('ALTER TABLE users ADD COLUMN department_id TEXT');
}

export const settingDefaults = {
  serverName: 'Streamon',
  allowRegistration: true,
  allowGuests: true,
  maxParticipants: 16,
  maxViewers: 300,
  welcomeText: '',
  stunUrl: 'stun:stun.l.google.com:19302',
  turnUrl: '',
  turnUsername: '',
  turnPassword: '',
};

export function getSettings() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('app');
  if (!row) return { ...settingDefaults };
  try {
    return { ...settingDefaults, ...JSON.parse(row.value) };
  } catch {
    return { ...settingDefaults };
  }
}

export function saveSettings(next) {
  const current = getSettings();
  const merged = { ...current, ...next };
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run('app', JSON.stringify(merged));
  return merged;
}

export function audit(actor, action, detail = '') {
  db.prepare('INSERT INTO audit (actor_id, actor_name, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(actor?.id || actor?.sub || null, actor?.name || '', action, String(detail || ''), now());
}

export function listAudit(limit = 100, before) {
  if (before) {
    return db.prepare('SELECT * FROM audit WHERE id < ? ORDER BY id DESC LIMIT ?').all(before, limit);
  }
  return db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(limit);
}

function departmentNameOf(id) {
  if (!id) return '';
  return db.prepare('SELECT name FROM departments WHERE id = ?').get(id)?.name || '';
}

export function toPublicUser(row) {
  if (!row) return null;
  const departmentId = row.departmentId ?? row.department_id ?? null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at || row.createdAt || null,
    lastLogin: row.last_login || row.lastLogin || null,
    departmentId: departmentId || null,
    departmentName: row.departmentName || row.department_name || departmentNameOf(departmentId),
  };
}

function publicUser(row) {
  return toPublicUser(row);
}

export function listDepartments() {
  return db.prepare('SELECT id, name FROM departments ORDER BY name COLLATE NOCASE').all();
}

export function getDepartment(id) {
  return db.prepare('SELECT id, name FROM departments WHERE id = ?').get(id) || null;
}

export function createDepartment(name) {
  const taken = db.prepare('SELECT id FROM departments WHERE name = ? COLLATE NOCASE').get(name);
  if (taken) return null;
  const id = uid();
  db.prepare('INSERT INTO departments (id, name, created_at) VALUES (?, ?, ?)').run(id, name, now());
  return getDepartment(id);
}

export function renameDepartment(id, name) {
  const current = getDepartment(id);
  if (!current) return null;
  const taken = db.prepare('SELECT id FROM departments WHERE name = ? COLLATE NOCASE AND id <> ?').get(name, id);
  if (taken) return false;
  db.prepare('UPDATE departments SET name = ? WHERE id = ?').run(name, id);
  return getDepartment(id);
}

export function deleteDepartment(id) {
  db.prepare('UPDATE users SET department_id = NULL WHERE department_id = ?').run(id);
  db.prepare('DELETE FROM departments WHERE id = ?').run(id);
}

export function countUsers() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

export function countAdmins() {
  return db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'").get().n;
}

export function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

export function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function listUsers() {
  return db.prepare(`
    SELECT u.*, d.name AS department_name
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    ORDER BY d.name COLLATE NOCASE, u.name COLLATE NOCASE
    LIMIT 2000
  `).all().map(publicUser);
}

export function createUser({ email, name, password, role = 'user', status = 'active', departmentId = null }) {
  const id = uid();
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare(`INSERT INTO users (id, email, name, password_hash, role, status, department_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, email, name, passwordHash, role, status, departmentId || null, now());
  return publicUser(getUserById(id));
}

export function updateUser(id, fields) {
  const user = getUserById(id);
  if (!user) return null;
  const name = fields.name ?? user.name;
  const role = fields.role ?? user.role;
  const status = fields.status ?? user.status;
  const passwordHash = fields.password ? bcrypt.hashSync(fields.password, 10) : user.password_hash;
  const departmentId = Object.prototype.hasOwnProperty.call(fields, 'departmentId')
    ? (fields.departmentId || null)
    : (user.department_id || null);
  db.prepare('UPDATE users SET name = ?, role = ?, status = ?, password_hash = ?, department_id = ? WHERE id = ?')
    .run(name, role, status, passwordHash, departmentId, id);
  return publicUser(getUserById(id));
}

export function deleteUser(id) {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  db.prepare('DELETE FROM room_roles WHERE user_id = ?').run(id);
}

export function touchLogin(id) {
  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now(), id);
}

export function checkPassword(user, password) {
  return bcrypt.compareSync(password, user.password_hash);
}

function makeCode() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(7);
  let code = '';
  for (let i = 0; i < 7; i += 1) code += alphabet[bytes[i] % alphabet.length];
  return code;
}

export function createRoom({ title, type, ownerId, isPublic, password, maxParticipants }) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const id = uid();
    const code = makeCode();
    try {
      db.prepare(`INSERT INTO rooms
        (id, code, title, type, owner_id, is_public, password_hash, max_participants, status, created_at, peak_peers)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'live', ?, 0)`)
        .run(
          id,
          code,
          title,
          type,
          ownerId,
          isPublic ? 1 : 0,
          password ? bcrypt.hashSync(password, 8) : null,
          maxParticipants,
          now(),
        );
      return getRoomByCode(code);
    } catch (error) {
      if (!String(error.message).includes('UNIQUE')) throw error;
    }
  }
  throw new Error('Не удалось выделить код комнаты');
}

export function getRoomByCode(code) {
  return db.prepare(`
    SELECT r.*, u.name AS owner_name
    FROM rooms r
    LEFT JOIN users u ON u.id = r.owner_id
    WHERE r.code = ?
  `).get(code);
}

export function getRoomById(id) {
  return db.prepare(`
    SELECT r.*, u.name AS owner_name
    FROM rooms r
    LEFT JOIN users u ON u.id = r.owner_id
    WHERE r.id = ?
  `).get(id);
}

export function listRooms(limit = 300) {
  return db.prepare(`
    SELECT r.*, u.name AS owner_name
    FROM rooms r
    LEFT JOIN users u ON u.id = r.owner_id
    ORDER BY r.created_at DESC
    LIMIT ?
  `).all(limit);
}

export function listLivePublic(type) {
  return db.prepare(`
    SELECT r.*, u.name AS owner_name
    FROM rooms r
    LEFT JOIN users u ON u.id = r.owner_id
    WHERE r.status = 'live' AND r.is_public = 1 AND r.type = ?
    ORDER BY r.created_at DESC
  `).all(type);
}

export function listLive() {
  return db.prepare(`
    SELECT r.*, u.name AS owner_name
    FROM rooms r
    LEFT JOIN users u ON u.id = r.owner_id
    WHERE r.status = 'live'
    ORDER BY r.created_at DESC
  `).all();
}

export function endRoom(id) {
  db.prepare(`UPDATE rooms SET status = 'ended', ended_at = ? WHERE id = ? AND status = 'live'`).run(now(), id);
}

export function deleteRoom(id) {
  db.prepare('DELETE FROM messages WHERE room_id = ?').run(id);
  db.prepare('DELETE FROM room_roles WHERE room_id = ?').run(id);
  db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
}

export function setPeak(id, peak) {
  db.prepare('UPDATE rooms SET peak_peers = ? WHERE id = ? AND peak_peers < ?').run(peak, id, peak);
}

export function roomPasswordOk(room, password) {
  if (!room.password_hash) return true;
  return bcrypt.compareSync(password || '', room.password_hash);
}

export function getRoomRole(roomId, userId) {
  return db.prepare('SELECT role FROM room_roles WHERE room_id = ? AND user_id = ?').get(roomId, userId)?.role || null;
}

export function setRoomRole(roomId, userId, role) {
  if (!role || role === 'viewer') {
    db.prepare('DELETE FROM room_roles WHERE room_id = ? AND user_id = ?').run(roomId, userId);
    return;
  }
  db.prepare(`INSERT INTO room_roles (room_id, user_id, role) VALUES (?, ?, ?)
    ON CONFLICT(room_id, user_id) DO UPDATE SET role = excluded.role`).run(roomId, userId, role);
}

export function listMessages(roomId, limit = 100) {
  const rows = db.prepare(`SELECT * FROM messages WHERE room_id = ? ORDER BY created_at DESC LIMIT ?`).all(roomId, limit);
  return rows.reverse();
}

export function addMessage({ roomId, userId, author, body }) {
  const id = uid();
  const createdAt = now();
  db.prepare('INSERT INTO messages (id, room_id, user_id, author, body, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, roomId, userId, author, body, createdAt);
  return { id, roomId, userId, author, body, createdAt };
}

export function roomCounts() {
  const live = db.prepare("SELECT type, COUNT(*) AS n FROM rooms WHERE status = 'live' GROUP BY type").all();
  const map = { conference: 0, stream: 0, wall: 0 };
  for (const row of live) map[row.type] = row.n;
  return map;
}

export function roomsPerDay(sinceIso) {
  return db.prepare(`
    SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
    FROM rooms
    WHERE created_at >= ?
    GROUP BY day
    ORDER BY day
  `).all(sinceIso);
}

export function ensureAdmin() {
  if (countUsers() > 0) return { created: false };
  let password = config.adminPassword;
  let generated = false;
  if (!password) {
    password = crypto.randomBytes(9).toString('base64url');
    generated = true;
  }
  const user = createUser({
    email: config.adminEmail,
    name: 'Администратор',
    password,
    role: 'admin',
  });
  if (generated) {
    fs.writeFileSync(
      initialAdminFile,
      `Streamon — первый вход\nЛогин: ${user.email}\nПароль: ${password}\nСмените пароль в профиле и удалите этот файл.\n`,
      { mode: 0o600 },
    );
  }
  return { created: true, email: user.email, generated, password: generated ? password : undefined };
}

export function clearInitialAdminFile() {
  fs.rmSync(initialAdminFile, { force: true });
}

export function initialAdminPending() {
  return fs.existsSync(initialAdminFile);
}
