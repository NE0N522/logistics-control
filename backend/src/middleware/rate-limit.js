import crypto from 'node:crypto';
import { ApiError } from './error-handler.js';

export function createRateLimiter({ windowMs, max, keyGenerator = (req) => req.ip || 'unknown' }) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = keyGenerator(req);
    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    existing.count += 1;
    if (existing.count > max) {
      const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return next(new ApiError(429, 'Слишком много запросов, повторите позже', 'RATE_LIMITED'));
    }
    return next();
  };
}

export const loginRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
export const integrationRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: (req) => {
    const key = req.header('X-API-Key') || 'missing';
    const keyHash = crypto.createHash('sha256').update(key, 'utf8').digest('hex');
    return `${req.ip || 'unknown'}:${keyHash}`;
  }
});
