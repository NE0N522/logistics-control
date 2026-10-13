import crypto from 'node:crypto';
import db from '../db/connection.js';
import { ApiError } from './error-handler.js';

const SESSION_COOKIE = 'sd_session';
const CSRF_COOKIE = 'sd_csrf';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function hash(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return [part, ''];
    const name = part.slice(0, idx);
    const raw = part.slice(idx + 1);
    try { return [name, decodeURIComponent(raw)]; } catch { return [name, raw]; }
  }));
}

function cookieHeader(name, value, options = {}) {
  const attrs = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path || '/'}`];
  if (options.maxAge !== undefined) attrs.push(`Max-Age=${options.maxAge}`);
  if (options.httpOnly) attrs.push('HttpOnly');
  attrs.push(`SameSite=${options.sameSite || 'Lax'}`);
  if (options.secure) attrs.push('Secure');
  return attrs.join('; ');
}

function clearCookieHeader(name, secure) {
  return cookieHeader(name, '', { maxAge: 0, httpOnly: name === SESSION_COOKIE, secure });
}

export function setAuthCookies(res, sessionToken, csrfToken) {
  const secure = process.env.NODE_ENV === 'production';
  res.append('Set-Cookie', cookieHeader(SESSION_COOKIE, sessionToken, { httpOnly: true, secure, sameSite: 'Lax', maxAge: SESSION_TTL_MS / 1000 }));
  res.append('Set-Cookie', cookieHeader(CSRF_COOKIE, csrfToken, { secure, sameSite: 'Lax', maxAge: SESSION_TTL_MS / 1000 }));
}

export function clearAuthCookies(res) {
  const secure = process.env.NODE_ENV === 'production';
  res.append('Set-Cookie', clearCookieHeader(SESSION_COOKIE, secure));
  res.append('Set-Cookie', clearCookieHeader(CSRF_COOKIE, secure));
}

export async function createSession(userId) {
  const sessionToken = randomToken(48);
  const csrfToken = randomToken(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  (await (db.prepare('INSERT INTO sessions (token_hash, user_id, csrf_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(hash(sessionToken), userId, hash(csrfToken), now.toISOString(), expiresAt)));
  return { sessionToken, csrfToken, expiresAt };
}

export async function requireAuth(req, res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    const rawToken = cookies[SESSION_COOKIE];
    if (!rawToken) return next(new ApiError(401, 'Требуется вход', 'AUTH_REQUIRED'));
    const session = (await (db.prepare(
      `SELECT sessions.id, sessions.user_id, sessions.csrf_hash, sessions.expires_at,
              users.email, users.name, users.role, users.active
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ? AND sessions.expires_at > ?`
    ).get(hash(rawToken), new Date().toISOString())));
    if (!session || !session.active) return next(new ApiError(401, 'Сессия недействительна', 'AUTH_REQUIRED'));
    req.user = { id: session.user_id, email: session.email, name: session.name, role: session.role };
    req.session = { id: session.id, csrfHash: session.csrf_hash };
    next();
  } catch (err) { next(err); }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return next(new ApiError(403, 'Требуются права администратора', 'ADMIN_REQUIRED'));
  next();
}

export function requireAdminForWrites(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  return requireAdmin(req, res, next);
}

export function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const token = req.header('X-CSRF-Token');
  const cookies = parseCookies(req.headers.cookie || '');
  const cookieToken = cookies[CSRF_COOKIE];
  if (!token || !cookieToken || token !== cookieToken || hash(token) !== req.session?.csrfHash) {
    return next(new ApiError(403, 'Некорректный CSRF-токен', 'CSRF_INVALID'));
  }
  next();
}

export async function revokeCurrentSession(req) {
  if (req.session?.id) (await (db.prepare('DELETE FROM sessions WHERE id = ?').run(req.session.id)));
}

export async function cleanupExpiredSessions() {
  (await (db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString())));
}

export { parseCookies, hash, SESSION_COOKIE, CSRF_COOKIE };
