import fp from 'fastify-plugin';
import Redis from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

export const redisPlugin = fp(async (fastify) => {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  redis.on('connect', () => {
    fastify.log.info('🔗 Redis connected successfully');
  });

  redis.on('error', (err) => {
    fastify.log.error('❌ Redis connection error:', err);
  });

  fastify.decorate('redis', redis);

  fastify.addHook('onClose', async (fastify) => {
    await fastify.redis.quit();
  });
}, {
  name: 'redis-plugin'
});