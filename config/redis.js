// config/redis.js
const { createClient } = require('redis');

let redisClient;

async function connectRedis() {
    if (redisClient) return redisClient; // singleton

    redisClient = createClient({
        url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
        password: process.env.REDIS_PASSWORD || undefined,
        database: Number(process.env.REDIS_DB || 0),
        socket: {
            reconnectStrategy: (retries) => {
                if (retries > 10) return new Error('Max retries reached');
                return Math.min(retries * 50, 500); // exponential backoff
            },
        },
    });

    redisClient.on('error', (err) => {
        console.error('[Redis] Client Error:', err.message);
    });

    redisClient.on('connect', () => {
        console.log('[Redis] Client Connected');
    });

    redisClient.on('ready', () => {
        console.log('[Redis] Client Ready');
    });

    redisClient.on('reconnecting', () => {
        console.warn('[Redis] Reconnecting...');
    });

    // Kết nối ngay (async)
    try {
        await redisClient.connect();
        console.log('[Redis] Connected successfully!');
    } catch (err) {
        console.error('[Redis] Connection failed:', err.message);
        // Không throw, để app chạy tiếp (fallback như bạn muốn)
    }

    return redisClient;
}

// Export client + helper connect (gọi 1 lần ở server start)
module.exports = {
    getRedisClient: () => redisClient,  // hàm trả về giá trị hiện tại
    connectRedis,
    closeRedis: async () => {
        if (redisClient?.isOpen) {
            await redisClient.quit();
            console.log('[Redis] Closed');
        }
    }
};