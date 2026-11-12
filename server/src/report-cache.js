import Redis from 'ioredis';

// API cache connections fail quickly; a Redis outage must not block patient writes.
export function connectReportRedis(url, logger = console) {
  const redis = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 1000,
    commandTimeout: 1000,
    retryStrategy: (attempt) => Math.min(attempt * 250, 3000),
  });
  let warned = false;
  redis.on('error', () => {
    if (!warned) logger.warn('Redis unavailable; report caching is bypassed.');
    warned = true;
  });
  redis.on('ready', () => {
    warned = false;
  });
  redis.connect().catch(() => {});
  return redis;
}

export function createReportCache(redis, { ttl = 300, prefix = 'sweety' } = {}) {
  const index = (userId) => `${prefix}:reports:${userId}:keys`;
  const key = (userId, revision, date) => `${prefix}:reports:${userId}:v${revision}:${date}`;
  const ready = () => redis.status === 'ready';
  return {
    isReady: ready,
    async get(userId, revision, date) {
      if (!ready()) return null;
      try {
        const value = await redis.get(key(userId, revision, date));
        return value ? JSON.parse(value) : null;
      } catch {
        return null;
      }
    },
    async set(userId, revision, date, report) {
      if (!ready()) return;
      const cacheKey = key(userId, revision, date);
      try {
        await redis
          .multi()
          .set(cacheKey, JSON.stringify(report), 'EX', ttl)
          .sadd(index(userId), cacheKey)
          .expire(index(userId), ttl)
          .exec();
      } catch {
        /* Database revision still prevents serving stale results. */
      }
    },
    async invalidate(userId) {
      if (!ready()) return;
      try {
        const keys = await redis.smembers(index(userId));
        if (keys.length) await redis.unlink(...keys);
        await redis.del(index(userId));
      } catch {
        /* Old revision keys become unreachable and expire automatically. */
      }
    },
  };
}
