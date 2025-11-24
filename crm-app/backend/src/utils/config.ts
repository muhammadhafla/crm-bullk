import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),
  
  // Redis
  REDIS_URL: z.string().url(),
  
  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  
  // Server
  PORT: z.string().transform(Number).default('3001'),
  HOST: z.string().default('localhost'),
  
  // Evolution API
  EVOLUTION_API_BASE_URL: z.string().url(),
  EVOLUTION_API_KEY: z.string(),
  
  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PREFIX: z.string().default('/api/v1'),
  
  // CORS
  CORS_ORIGIN: z.string(),
  SOCKET_IO_CORS_ORIGIN: z.string(),
  
  // Security
  BCRYPT_ROUNDS: z.string().transform(Number).default('12'),
  SESSION_SECRET: z.string(),
  
  // Rate limiting
  RATE_LIMIT_MAX: z.string().transform(Number).default('100'),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
  
  // WhatsApp
  WHATSAPP_DEFAULT_DELAY: z.string().transform(Number).default('5000'),
  WHATSAPP_MAX_RETRIES: z.string().transform(Number).default('3'),
  WHATSAPP_RETRY_DELAY: z.string().transform(Number).default('30000'),
  
  // Logging
  LOG_LEVEL: z.string().default('info'),
});

export const config = envSchema.parse(process.env);

export type Config = typeof config;