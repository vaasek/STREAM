import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { getDepartment, getUserById } from './db.js';

export function signUser(user, extra = {}) {
  return jwt.sign(
    {
      sub: user.id,
      name: user.name,
      role: user.role,
      guest: false,
      ...extra,
    },
    config.jwtSecret,
    { expiresIn: '7d' },
  );
}

export function signGuest({ name, roomCode }) {
  const id = `guest:${crypto.randomUUID()}`;
  const token = jwt.sign(
    {
      sub: id,
      name,
      role: 'guest',
      guest: true,
      roomCode,
    },
    config.jwtSecret,
    { expiresIn: '12h' },
  );
  return { token, id };
}

export function readToken(header) {
  if (!header?.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), config.jwtSecret);
  } catch {
    return null;
  }
}

function attach(payload) {
  if (!payload) return null;
  if (payload.guest) return payload;
  const user = getUserById(payload.sub);
  if (!user || user.status !== 'active') return null;
  const department = user.department_id ? getDepartment(user.department_id) : null;
  return {
    ...payload,
    id: payload.sub,
    name: user.name,
    role: user.role,
    email: user.email,
    departmentId: department?.id || null,
    departmentName: department?.name || '',
    guest: false,
  };
}

export function resolveUser(header) {
  return attach(readToken(header));
}

export function authRequired(req, res, next) {
  const user = attach(readToken(req.headers.authorization));
  if (!user) return res.status(401).json({ error: 'Нужно войти' });
  req.user = user;
  next();
}

export function adminRequired(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Недостаточно прав' });
  next();
}
