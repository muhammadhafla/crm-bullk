import { FastifyPluginAsync } from 'fastify';
import Redis from 'ioredis';

/**
 * Rate limiting utility for per-tenant request throttling
 * Uses Redis for distributed rate limiting across multiple server instances
 */

interface RateLimiterConfig {
  windowMs: number;        // Time window in milliseconds
  maxRequests: number;     // Maximum requests per window
  skipFailedRequests: boolean; // Skip counting failed requests
  keyGenerator: (request: any) => string; // Custom key generator
}

interface RateLimiterStore {
  redis: Redis;
  config: RateLimiterConfig;
}

/**
 * Create rate limiter middleware for Fastify
 */
export function createRateLimiter(redis: Redis, config: RateLimiterConfig): FastifyPluginAsync {
  return async (fastify) => {
    // Rate limiting middleware
    fastify.decorate('tenantRateLimit', async (request: any, reply: any) => {
      try {
        const key = config.keyGenerator(request);
        const now = Date.now();
        const window = Math.floor(now / config.windowMs);
        const redisKey = `rate_limit:${key}:${window}`;

        // Use Redis pipeline for atomic operations
        const pipeline = redis.pipeline();
        pipeline.incr(redisKey);
        pipeline.expire(redisKey, Math.ceil(config.windowMs / 1000));
        
        const results = await pipeline.exec();
        const current = results?.[0]?.[1] as number || 0;

        // Set rate limit headers
        reply.header('X-RateLimit-Limit', config.maxRequests.toString());
        reply.header('X-RateLimit-Remaining', Math.max(0, config.maxRequests - current).toString());
        reply.header('X-RateLimit-Reset', new Date((window + 1) * config.windowMs).toISOString());

        // Check if limit exceeded
        if (current > config.maxRequests) {
          const retryAfter = Math.ceil(config.windowMs / 1000);
          reply.header('Retry-After', retryAfter.toString());
          
          return reply.status(429).send({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter,
          });
        }
      } catch (error) {
        // Log error but don't block request if Redis is unavailable
        fastify.log.error({ err: error }, 'Rate limiter error');
      }
    });

    // Cleanup expired keys periodically
    setInterval(async () => {
      try {
        const pattern = 'rate_limit:*';
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } catch (error) {
        fastify.log.error({ err: error }, 'Rate limiter cleanup error');
      }
    }, 60000); // Cleanup every minute
  };
}

/**
 * Pre-configured rate limiters for different endpoints
 */
export const rateLimiterConfigs = {
  // Bulk sending: 1 request per 10 seconds per tenant
  bulk: {
    windowMs: 10000, // 10 seconds
    maxRequests: 1,
    skipFailedRequests: true,
    keyGenerator: (request: any) => {
      const tenantId = request.user?.tenantId || request.ip;
      return `bulk:${tenantId}`;
    },
  },

  // Evolution API test: 5 requests per minute per tenant
  evolutionTest: {
    windowMs: 60000, // 1 minute
    maxRequests: 5,
    skipFailedRequests: false,
    keyGenerator: (request: any) => {
      const tenantId = request.user?.tenantId || request.ip;
      return `evolution_test:${tenantId}`;
    },
  },

  // General API: 100 requests per minute per tenant
  general: {
    windowMs: 60000, // 1 minute
    maxRequests: 100,
    skipFailedRequests: true,
    keyGenerator: (request: any) => {
      const tenantId = request.user?.tenantId || request.ip;
      return `general:${tenantId}`;
    },
  },

  // Authentication: 5 login attempts per minute per IP
  auth: {
    windowMs: 60000, // 1 minute
    maxRequests: 5,
    skipFailedRequests: false,
    keyGenerator: (request: any) => {
      return `auth:${request.ip}`;
    },
  },
};

/**
 * BullMQ job limiter for per-tenant queue control
 */
export class TenantJobLimiter {
  private redis: Redis;
  private config: {
    maxConcurrency: number;    // Maximum concurrent jobs per tenant
    minDelay: number;         // Minimum delay between jobs (ms)
  };

  constructor(redis: Redis, config = { maxConcurrency: 5, minDelay: 5000 }) {
    this.redis = redis;
    this.config = config;
  }

  /**
   * Check if tenant can enqueue a new job
   */
  async canEnqueue(tenantId: string): Promise<boolean> {
    const key = `job_limit:${tenantId}`;
    const now = Date.now();

    // Check active jobs count
    const activeJobs = await this.redis.scard(`active_jobs:${tenantId}`);
    if (activeJobs >= this.config.maxConcurrency) {
      return false;
    }

    // Check minimum delay between jobs
    const lastJobKey = `last_job:${tenantId}`;
    const lastJobTime = await this.redis.get(lastJobKey);
    if (lastJobTime && (now - parseInt(lastJobTime)) < this.config.minDelay) {
      return false;
    }

    return true;
  }

  /**
   * Mark job as active for tenant
   */
  async markJobActive(tenantId: string, jobId: string): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.sadd(`active_jobs:${tenantId}`, jobId);
    pipeline.expire(`active_jobs:${tenantId}`, 300); // 5 minutes
    pipeline.set(`last_job:${tenantId}`, Date.now().toString());
    pipeline.expire(`last_job:${tenantId}`, 300); // 5 minutes
    
    await pipeline.exec();
  }

  /**
   * Mark job as completed for tenant
   */
  async markJobCompleted(tenantId: string, jobId: string): Promise<void> {
    await this.redis.srem(`active_jobs:${tenantId}`, jobId);
  }

  /**
   * Get tenant job statistics
   */
  async getTenantStats(tenantId: string): Promise<{
    activeJobs: number;
    canEnqueue: boolean;
    lastJobTime: number | null;
  }> {
    const activeJobs = await this.redis.scard(`active_jobs:${tenantId}`);
    const lastJobTime = await this.redis.get(`last_job:${tenantId}`);
    
    return {
      activeJobs,
      canEnqueue: await this.canEnqueue(tenantId),
      lastJobTime: lastJobTime ? parseInt(lastJobTime) : null,
    };
  }
}