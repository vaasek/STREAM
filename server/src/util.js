import crypto from 'node:crypto';

export function now() {
  return new Date().toISOString();
}

export function uid() {
  return crypto.randomUUID();
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function roomCode(length = 7) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i += 1) code += alphabet[bytes[i] % alphabet.length];
  return code;
}

export function cleanText(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

export function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function dayStamp(date) {
  return date.toISOString().slice(0, 10);
}
