import crypto from 'node:crypto';

const KEYLEN = 64;
const N = 16384;
const R = 8;
const P = 1;

export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) {
    throw new Error('Пароль должен содержать от 12 до 200 символов');
  }
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.scryptSync(password, salt, KEYLEN, { N, r: R, p: P }).toString('base64url');
  return `scrypt$${N}$${R}$${P}$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [algorithm, n, r, p, salt, hash] = String(stored).split('$');
    if (algorithm !== 'scrypt') return false;
    const derived = crypto.scryptSync(password, salt, KEYLEN, { N: Number(n), r: Number(r), p: Number(p) });
    const expected = Buffer.from(hash, 'base64url');
    return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}
