import fp from 'fastify-plugin';
import { Server, Socket } from 'socket.io';

declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
    emitToTenant: (tenantId: string, event: string, data: any) => void;
    emitToCampaign: (campaignId: string, event: string, data: any) => void;
  }
}

interface AuthenticatedSocket extends Socket {
  userId?: string;
  tenantId?: string;
}

export const socketPlugin = fp(async (fastify) => {
  const io = new Server(fastify.server, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
    },
  });

  // Store io instance
  fastify.decorate('io', io);

  // Helper function to emit to tenant room
  const emitToTenant = (tenantId: string, event: string, data: any) => {
    io.to(`tenant_${tenantId}`).emit(event, data);
  };

  // Helper function to emit to campaign room
  const emitToCampaign = (campaignId: string, event: string, data: any) => {
    io.to(`campaign_${campaignId}`).emit(event, data);
  };

  // Expose helper functions via fastify instance
  fastify.decorate('emitToTenant', emitToTenant);
  fastify.decorate('emitToCampaign', emitToCampaign);

  // Handle socket connections
  io.on('connection', async (socket: AuthenticatedSocket) => {
    console.log(`🔌 Client connected: ${socket.id}`);
    
    // Handle authentication
    socket.on('authenticate', async (token: string) => {
      try {
        // Verify JWT token
        const decoded = fastify.jwt.verify(token) as any;
        const userId = decoded.userId;
        const tenantId = decoded.userId; // Tenant ID = User ID

        if (!userId) {
          socket.emit('authentication_error', { message: 'Invalid token' });
          return;
        }

        // Store user info in socket
        socket.userId = userId;
        socket.tenantId = tenantId;

        // Join tenant room
        socket.join(`tenant_${tenantId}`);
        
        // Join user room for direct messages
        socket.join(`user_${userId}`);

        console.log(`🔐 User ${userId} authenticated and joined tenant room`);
        socket.emit('authenticated', { userId, tenantId });

      } catch (error) {
        console.error('Socket authentication failed:', error);
        socket.emit('authentication_error', { message: 'Authentication failed' });
      }
    });

    // Handle room joining
    socket.on('join_campaign_room', (campaignId: string) => {
      if (socket.tenantId) {
        socket.join(`campaign_${campaignId}`);
        console.log(`📢 Client ${socket.id} joined campaign room: campaign_${campaignId}`);
      }
    });

    socket.on('leave_campaign_room', (campaignId: string) => {
      socket.leave(`campaign_${campaignId}`);
      console.log(`📢 Client ${socket.id} left campaign room: campaign_${campaignId}`);
    });

    // Legacy support for old event names
    socket.on('join_user_room', (userId: string) => {
      socket.join(`user_${userId}`);
      console.log(`👤 Client ${socket.id} joined user room: user_${userId}`);
    });

    socket.on('join-tenant', (tenantId: string) => {
      socket.join(`tenant_${tenantId}`);
      console.log(`🏢 Client ${socket.id} joined tenant room: tenant_${tenantId}`);
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`🔌 Client ${socket.id} disconnected: ${reason}`);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`❌ Socket error from ${socket.id}:`, error);
    });
  });

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    await io.close();
  });
}, {
  name: 'socket-plugin'
});