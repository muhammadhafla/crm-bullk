import { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { generateRefreshToken, hashRefreshToken } from '../utils/encryption';
import fastifyJwt from '@fastify/jwt';

declare module 'fastify' {
  interface FastifyInstance {
    jwt: typeof fastifyJwt;
    authenticate: any;
    verifyJWT: any;
  }
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Register validation schemas
  const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().min(1),
    branchId: z.string().optional(), // Optional for multi-tenant approach
  });

  const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
  });

  const refreshTokenSchema = z.object({
    refreshToken: z.string(),
  });

  const updateCredentialsSchema = z.object({
    evolutionUrl: z.string().url(),
    evolutionApiKey: z.string().min(1),
    instanceName: z.string().min(1),
  });

  // Tenant-aware JWT verification middleware
  fastify.decorate('verifyJWT', async (request: any, reply: any) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'No valid authorization header' });
      }

      const token = authHeader.split(' ')[1];
      const decoded = fastify.jwt.verify(token);
      
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

  // Register new user
  fastify.post('/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password', 'name', 'branchId'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          name: { type: 'string', minLength: 1 },
          branchId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { email, password, name, branchId } = registerSchema.parse(request.body);

      // Check if user already exists
      const existingUser = await fastify.prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return reply.status(400).send({
          error: 'User already exists',
          message: 'An account with this email already exists',
        });
      }

      // Verify branch exists
      const branch = await fastify.prisma.branch.findUnique({
        where: { id: branchId },
      });

      if (!branch) {
        return reply.status(400).send({
          error: 'Invalid branch',
          message: 'The specified branch does not exist',
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS || '12'));

      // Create user
      const user = await fastify.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          ...(branchId && { branchId }),
          role: 'USER',
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          branchId: true,
          createdAt: true,
        },
      });

      // Generate JWT tokens
      const accessToken = fastify.jwt.sign({
        userId: user.id,
        tenantId: user.id, // Simplified tenant isolation
        email: user.email,
        role: user.role
      }, { expiresIn: '30m' });

      // Generate refresh token
      const refreshToken = generateRefreshToken();
      const tokenHash = hashRefreshToken(refreshToken);
      
      // Store refresh token (expires in 30 days)
      await fastify.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      });

      // Set refresh token as httpOnly cookie
      reply.setCookie('refreshToken', refreshToken, {
        httpOnly: true,
        path: '/api/v1/auth/refresh',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });

      reply.send({
        user,
        accessToken,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Login user
  fastify.post('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { email, password } = loginSchema.parse(request.body);

      // Find user
      const user = await fastify.prisma.user.findUnique({
        where: { email },
        include: {
          branch: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      });

      if (!user) {
        return reply.status(401).send({
          error: 'Invalid credentials',
          message: 'Email or password is incorrect',
        });
      }

      if (!user.isActive) {
        return reply.status(401).send({
          error: 'Account disabled',
          message: 'Your account has been disabled',
        });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return reply.status(401).send({
          error: 'Invalid credentials',
          message: 'Email or password is incorrect',
        });
      }

      // Update last login
      await fastify.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Generate JWT tokens
      const accessToken = fastify.jwt.sign({
        userId: user.id,
        tenantId: user.id, // Simplified tenant isolation
        email: user.email,
        role: user.role,
        branchId: user.branchId,
      }, { expiresIn: '30m' });

      // Generate refresh token
      const refreshToken = generateRefreshToken();
      const tokenHash = hashRefreshToken(refreshToken);
      
      // Store refresh token (expires in 30 days)
      await fastify.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      });

      // Set refresh token as httpOnly cookie
      reply.setCookie('refreshToken', refreshToken, {
        httpOnly: true,
        path: '/api/v1/auth/refresh',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });

      reply.send({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          branchId: user.branchId,
          branch: user.branch,
          evolutionInstance: user.evolutionInstance,
          evolutionUrl: user.evolutionUrl,
          instanceName: user.instanceName,
        },
        accessToken,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get current user profile
  fastify.get('/profile', {
    preHandler: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const userId = request.user.userId;

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        include: {
          branch: {
            select: {
              id: true,
              name: true,
              code: true,
              address: true,
            },
          },
        },
      });

      if (!user) {
        return reply.status(404).send({
          error: 'User not found',
          message: 'User profile not found',
        });
      }

      reply.send({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        branchId: user.branchId,
        branch: user.branch,
        evolutionInstance: user.evolutionInstance,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Refresh token endpoint
  fastify.post('/refresh', async (request, reply) => {
    try {
      const { refreshToken } = request.cookies || {};

      if (!refreshToken) {
        return reply.status(401).send({ error: 'No refresh token provided' });
      }

      const tokenHash = hashRefreshToken(refreshToken);
      
      // Find valid refresh token
      const refreshTokenRecord = await fastify.prisma.refreshToken.findFirst({
        where: {
          tokenHash,
          expiresAt: { gt: new Date() },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              role: true,
              branchId: true,
              isActive: true,
            },
          },
        },
      });

      if (!refreshTokenRecord || !refreshTokenRecord.user.isActive) {
        return reply.status(401).send({ error: 'Invalid or expired refresh token' });
      }

      // Generate new access token
      const accessToken = fastify.jwt.sign({
        userId: refreshTokenRecord.user.id,
        tenantId: refreshTokenRecord.user.id,
        email: refreshTokenRecord.user.email,
        role: refreshTokenRecord.user.role,
        branchId: refreshTokenRecord.user.branchId,
      }, { expiresIn: '30m' });

      reply.send({ accessToken });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Logout endpoint
  fastify.post('/logout', {
    preHandler: [fastify.verifyJWT],
  }, async (request: any, reply) => {
    try {
      const refreshToken = request.cookies.refreshToken;
      
      if (refreshToken) {
        const tokenHash = hashRefreshToken(refreshToken);
        await fastify.prisma.refreshToken.deleteMany({
          where: { tokenHash },
        });
      }

      reply.clearCookie('refreshToken', { path: '/api/v1/auth/refresh' });
      reply.send({ message: 'Logged out successfully' });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Test Evolution API connection
  fastify.get('/evolution/test', {
    preHandler: [fastify.verifyJWT],
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const user = await fastify.prisma.user.findUnique({
        where: { id: tenantId },
        select: {
          evolutionUrl: true,
          evolutionApiKey: true,
          instanceName: true,
        },
      });

      if (!user?.evolutionUrl || !user?.evolutionApiKey || !user?.instanceName) {
        return reply.status(400).send({ ok: false, error: 'Evolution credentials not configured' });
      }

      const { decryptEvolutionApiKey } = await import('../utils/encryption');
      const apiKey = decryptEvolutionApiKey(user.evolutionApiKey);

      // Test connection to Evolution API
      const response = await fetch(`${user.evolutionUrl}/status/${user.instanceName}`, {
        headers: {
          apikey: apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return reply.status(400).send({ ok: false, error: 'Failed to connect to Evolution API' });
      }

      const status = await response.json();
      reply.send({ ok: true, status });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ ok: false, error: 'Connection test failed' });
    }
  });

  // Update Evolution API credentials
  fastify.put('/evolution/credentials', {
    preHandler: [fastify.verifyJWT],
    schema: {
      body: {
        type: 'object',
        required: ['evolutionUrl', 'evolutionApiKey', 'instanceName'],
        properties: {
          evolutionUrl: { type: 'string', format: 'url' },
          evolutionApiKey: { type: 'string', minLength: 1 },
          instanceName: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const { evolutionUrl, evolutionApiKey, instanceName } = updateCredentialsSchema.parse(request.body);

      const { encryptEvolutionCredentials } = await import('../utils/encryption');
      const encryptedCredentials = encryptEvolutionCredentials(evolutionUrl, evolutionApiKey, instanceName);

      const updatedUser = await fastify.prisma.user.update({
        where: { id: tenantId },
        data: encryptedCredentials,
        select: {
          id: true,
          email: true,
          evolutionUrl: true,
          evolutionApiKey: true,
          instanceName: true,
        },
      });

      reply.send({
        message: 'Evolution API credentials updated successfully',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          evolutionUrl: updatedUser.evolutionUrl,
          instanceName: updatedUser.instanceName,
        },
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to update credentials' });
    }
  });

  // Update user profile
  fastify.put('/profile', {
    preHandler: [fastify.verifyJWT],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          evolutionInstance: { type: 'string' },
        },
      },
    },
  }, async (request: any, reply) => {
    try {
      const userId = request.user.userId;
      const { name, evolutionInstance } = request.body;

      const updatedUser = await fastify.prisma.user.update({
        where: { id: userId },
        data: {
          ...(name && { name }),
          ...(evolutionInstance && { evolutionInstance }),
        },
        include: {
          branch: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      });

      reply.send({
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        branchId: updatedUser.branchId,
        branch: updatedUser.branch,
        evolutionInstance: updatedUser.evolutionInstance,
        evolutionUrl: updatedUser.evolutionUrl,
        instanceName: updatedUser.instanceName,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Internal server error' });
    }
  });
};

export default authRoutes;