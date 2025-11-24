import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyJwt from '@fastify/jwt';
import fastifySensible from '@fastify/sensible';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUI from '@fastify/swagger-ui';
import fastifySocketIO from 'fastify-socket.io';

import { config } from './utils/config';
import { prismaPlugin } from './plugins/prisma';
import { redisPlugin } from './plugins/redis';
import { createRateLimiter, rateLimiterConfigs, TenantJobLimiter } from './utils/rateLimiter';
import { BulkMessageWorker } from './workers/bulkWorker';

import authRoutes from './routes/auth';
import contactsRoutes from './routes/contacts';
import bulkRoutes from './routes/bulk';
import whatsappRoutes from './routes/channels/whatsapp';
import telegramRoutes from './routes/channels/telegram';
import tiktokRoutes from './routes/channels/tiktok';

async function buildServer() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport: config.NODE_ENV === 'development' ? {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      } : undefined,
    },
  });

  // Register plugins
  await app.register(fastifyCors, {
    origin: config.CORS_ORIGIN,
    credentials: true,
  });

  await app.register(fastifyHelmet);
  await app.register(fastifySensible);
  
  await app.register(fastifyJwt, {
    secret: config.JWT_SECRET,
  });

  await app.register(fastifySwagger, {
    swagger: {
      info: {
        title: 'CRM Multi-User & Multi-Channel API',
        description: 'WhatsApp Bulk Messaging with Redis Queue System',
        version: '1.0.0',
        contact: {
          name: 'CRM Team',
          email: 'admin@crm.com',
        },
      },
      host: `${config.HOST}:${config.PORT}`,
      schemes: ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json'],
    },
  });

  await app.register(fastifySwaggerUI, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    staticCSP: true,
    transformSpecification: (swaggerObject) => {
      return swaggerObject;
    },
  });

  await app.register(fastifySocketIO, {
    cors: {
      origin: config.SOCKET_IO_CORS_ORIGIN,
      methods: ['GET', 'POST'],
    },
  });

  // Database and Redis plugins
  await app.register(prismaPlugin);
  await app.register(redisPlugin);

  // Rate limiter plugins
  const tenantJobLimiter = new TenantJobLimiter(app.redis, {
    maxConcurrency: 5,
    minDelay: 5000,
  });

  await app.register(createRateLimiter(app.redis, rateLimiterConfigs.general));

  // Initialize Bulk Message Worker
  const bulkWorker = new BulkMessageWorker({
    redis: app.redis,
    prisma: app.prisma,
    concurrency: 3, // Process 3 messages concurrently
    maxRetries: 3,
    tenantJobLimiter,
    io: app.io, // Pass Socket.IO instance for real-time events
  });

  app.log.info('🚀 Bulk Message Worker initialized');

  // Decorators
  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  app.decorate('verifyJWT', async (request: any, reply: any) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'No valid authorization header' });
      }

      const token = authHeader.split(' ')[1];
      const decoded = app.jwt.verify(token) as any;
      
      // Set tenant context from JWT payload
      request.user = {
        userId: decoded.userId,
        tenantId: decoded.userId, // Tenant ID = User ID for simpler isolation
        role: decoded.role
      };
    } catch (err) {
      reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  // Health check
  app.get('/health', async () => {
    return { status: 'OK', timestamp: new Date().toISOString() };
  });

  // API routes
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(contactsRoutes, { prefix: '/api/v1/contacts' });
  await app.register(bulkRoutes, { prefix: '/api/v1/bulk' });
  await app.register(whatsappRoutes, { prefix: '/api/v1/channels/whatsapp' });
  await app.register(telegramRoutes, { prefix: '/api/v1/channels/telegram' });
  await app.register(tiktokRoutes, { prefix: '/api/v1/channels/tiktok' });

  // Graceful shutdown handling
  const gracefulShutdown = async (signal: string) => {
    app.log.info(`🛑 Received ${signal}, starting graceful shutdown...`);
    
    try {
      // Close the bulk worker
      if (bulkWorker) {
        await bulkWorker.close();
        app.log.info('✅ Bulk Message Worker closed');
      }
      
      // Close Fastify
      await app.close();
      app.log.info('✅ Fastify server closed');
      
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  // Register graceful shutdown handlers
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  return app;
}

async function start() {
  try {
    const app = await buildServer();
    const address = await app.listen({ 
      port: config.PORT, 
      host: config.HOST 
    });
    
    app.log.info(`🚀 CRM Server running on ${address}`);
    app.log.info(`📚 API Documentation: http://${config.HOST}:${config.PORT}/docs`);
  } catch (err) {
    console.error('❌ Error starting server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

export { buildServer };