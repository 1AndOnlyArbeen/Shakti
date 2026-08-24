// Optional Redis connection.
//
// The whole point of this module is that Redis is NEVER required. If REDIS_URL
// is unset — or set but unreachable — every consumer falls back to its
// in-process behaviour and the app keeps serving. That is what makes the local
// container swappable for a managed instance later: change REDIS_URL, restart,
// done. Nothing else in the codebase learns where Redis lives.
//
//   local compose : redis://redis:6379
//   host-run dev  : redis://localhost:6379
//   managed (TLS) : rediss://default:<password>@<host>:6379
//
// Consumers should call getRedis() and handle null, or check isRedisReady()
// before choosing a Redis-backed path.
import Redis from 'ioredis';

let client = null;
let ready = false;
let warned = false;

export function isRedisConfigured() {
    return Boolean(process.env.REDIS_URL);
}

export function isRedisReady() {
    return ready;
}

export function getRedis() {
    if (!isRedisConfigured()) return null;
    if (client) return client;

    const url = process.env.REDIS_URL;

    client = new Redis(url, {
        // Fail fast and keep failing quietly. Without a bounded strategy ioredis
        // retries forever and floods the log; without lazyConnect it dials on
        // import, before we know whether anything wants it.
        lazyConnect: false,
        maxRetriesPerRequest: 2,
        enableOfflineQueue: false,
        connectTimeout: 5000,
        retryStrategy(times) {
            // 200ms, 400ms, ... capped at 10s. Never gives up entirely, so a
            // Redis that comes back later is picked up without a restart.
            return Math.min(times * 200, 10000);
        },
        // Managed providers (Upstash, Redis Cloud, ElastiCache in-transit) use
        // rediss://. ioredis needs TLS switched on explicitly for that scheme.
        ...(url.startsWith('rediss://') ? { tls: {} } : {}),
    });

    client.on('ready', () => {
        ready = true;
        warned = false;
        console.log('[redis] connected');
    });

    client.on('end', () => {
        ready = false;
    });

    client.on('error', (err) => {
        ready = false;
        // One line per outage, not one per retry.
        if (!warned) {
            warned = true;
            console.warn(`[redis] unavailable (${err.message}) — falling back to in-process behaviour`);
        }
    });

    return client;
}

// Called on shutdown so a restart does not leave a socket hanging.
export async function closeRedis() {
    if (!client) return;
    try {
        await client.quit();
    } catch {
        client.disconnect();
    }
    client = null;
    ready = false;
}

export default getRedis;
