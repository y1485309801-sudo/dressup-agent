export function createRateLimiter({
  limit = 30,
  windowMs = 60_000,
  now = Date.now
} = {}) {
  const clients = new Map();

  return function rateLimit(req, res, next) {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const currentTime = now();
    const existing = clients.get(key);

    if (!existing || currentTime >= existing.resetAt) {
      clients.set(key, { count: 1, resetAt: currentTime + windowMs });
      return next();
    }

    existing.count += 1;
    if (existing.count > limit) {
      res.set('Retry-After', String(Math.ceil((existing.resetAt - currentTime) / 1000)));
      return res.status(429).json({ error: 'RATE_LIMITED' });
    }

    return next();
  };
}
