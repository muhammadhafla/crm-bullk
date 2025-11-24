import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createEvolutionAPIService } from '../../services/evolutionApi';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: any;
    verifyJWT: any;
    prisma: any;
    io: any;
  }
}

const whatsappRoutes: FastifyPluginAsync = async (fastify) => {
  // Validation schemas
  const sendMessageSchema = z.object({
    contactId: z.string().optional(),
    phone: z.string().optional(),
    message: z.string().min(1),
    messageType: z.enum(['text', 'image', 'document', 'audio', 'video', 'sticker']).default('text'),
    mediaUrl: z.string().url().optional(),
    mediaCaption: z.string().optional(),
    fileName: z.string().optional(),
    delay: z.number().min(0).optional(),
    linkPreview: z.boolean().optional(),
    mentionsEveryOne: z.boolean().optional(),
    mentioned: z.array(z.string()).optional(),
  });

  const sendBulkMessageSchema = z.object({
    campaignId: z.string(),
    contacts: z.array(z.object({
      contactId: z.string(),
      phone: z.string(),
      message: z.string(),
      variables: z.record(z.string()).optional(),
    })),
    delay: z.number().min(0).default(5000),
    retryOnFailure: z.boolean().default(true),
  });

  // Get WhatsApp instance status
  fastify.get('/status', {
    preHandler: [fastify.verifyJWT],
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const evolutionService = await createEvolutionAPIService(fastify.prisma, tenantId);

      const status = await evolutionService.getConnectionState();
      
      reply.send({
        instance: evolutionService.getCredentials().instanceName,
        status: status.instance?.state || 'unknown',
        statusInfo: status.instance,
      });
    } catch (error) {
      console.error(error);
      reply.status(500).send({ 
        error: 'Failed to get WhatsApp status',
        message: error.message,
      });
    }
  });

  // Get QR Code for WhatsApp connection
  fastify.get('/qr', {
    preHandler: [fastify.verifyJWT],
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const evolutionService = await createEvolutionAPIService(fastify.prisma, tenantId);

      const qrData = await evolutionService.getQRCode();
      
      reply.send({
        instance: evolutionService.getCredentials().instanceName,
        qr: qrData.code || qrData.pairingCode,
        pairingCode: qrData.pairingCode,
        count: qrData.count || 1,
      });
    } catch (error) {
      console.error(error);
      reply.status(500).send({ 
        error: 'Failed to get QR code',
        message: error.message,
      });
    }
  });

  // Send single message
  fastify.post('/send', {
    preHandler: [fastify.verifyJWT],
    schema: {
      body: {
        type: 'object',
        required: ['message'],
        properties: {
          contactId: { type: 'string' },
          phone: { type: 'string' },
          message: { type: 'string', minLength: 1 },
          messageType: { type: 'string', enum: ['text', 'image', 'document', 'audio', 'video', 'sticker'] },
          mediaUrl: { type: 'string', format: 'url' },
          mediaCaption: { type: 'string' },
          fileName: { type: 'string' },
          delay: { type: 'number', minimum: 0 },
          linkPreview: { type: 'boolean' },
          mentionsEveryOne: { type: 'boolean' },
          mentioned: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const { 
        contactId, 
        phone, 
        message, 
        messageType, 
        mediaUrl, 
        mediaCaption, 
        fileName,
        delay,
        linkPreview,
        mentionsEveryOne,
        mentioned
      } = sendMessageSchema.parse(request.body);
      
      const evolutionService = await createEvolutionAPIService(fastify.prisma, tenantId);

      let targetPhone: string;
      let contactInfo = null;
      
      // Get phone from contactId or use provided phone
      if (contactId) {
        const contact = await fastify.prisma.contact.findFirst({
          where: {
            id: contactId,
            userId: tenantId,
          },
        });

        if (!contact) {
          return reply.status(404).send({ error: 'Contact not found' });
        }

        targetPhone = contact.phone;
        contactInfo = contact;
      } else if (phone) {
        targetPhone = phone;
      } else {
        return reply.status(400).send({ error: 'Either contactId or phone is required' });
      }

      // Prepare message options
      const messageOptions = {
        delay,
        linkPreview,
        mentionsEveryOne,
        mentioned,
      };

      let result;
      
      // Send message based on type using the new Evolution API service
      switch (messageType) {
        case 'text':
          result = await evolutionService.sendTextMessage(targetPhone, message, messageOptions);
          break;
          
        case 'image':
          if (!mediaUrl) {
            return reply.status(400).send({ error: 'Media URL is required for image messages' });
          }
          result = await evolutionService.sendMediaMessage(targetPhone, 'image', mediaUrl, {
            caption: mediaCaption || message,
            fileName,
            ...messageOptions
          });
          break;
          
        case 'document':
          if (!mediaUrl) {
            return reply.status(400).send({ error: 'Media URL is required for document messages' });
          }
          result = await evolutionService.sendMediaMessage(targetPhone, 'document', mediaUrl, {
            caption: mediaCaption || message,
            fileName,
            ...messageOptions
          });
          break;
          
        case 'audio':
          if (!mediaUrl) {
            return reply.status(400).send({ error: 'Media URL is required for audio messages' });
          }
          result = await evolutionService.sendAudioMessage(targetPhone, mediaUrl, messageOptions);
          break;
          
        case 'video':
          if (!mediaUrl) {
            return reply.status(400).send({ error: 'Media URL is required for video messages' });
          }
          result = await evolutionService.sendMediaMessage(targetPhone, 'video', mediaUrl, {
            caption: mediaCaption || message,
            fileName,
            ...messageOptions
          });
          break;
          
        case 'sticker':
          if (!mediaUrl) {
            return reply.status(400).send({ error: 'Media URL is required for sticker messages' });
          }
          result = await evolutionService.sendSticker(targetPhone, mediaUrl, messageOptions);
          break;
          
        default:
          result = await evolutionService.sendTextMessage(targetPhone, message, messageOptions);
      }

      // Log message to database for tracking
      await fastify.prisma.messageLog.create({
        data: {
          id: result.key?.id || `${Date.now()}`,
          contactId: contactId || null,
          phone: targetPhone,
          message,
          messageType,
          status: 'SENT',
          userId: tenantId,
          channel: 'WHATSAPP',
          sentAt: new Date(),
        },
      });

      // Emit real-time event
      (fastify as any).io?.to(tenantId)?.emit('message:sent', {
        messageId: result.key?.id,
        contactId,
        phone: targetPhone,
        status: 'SENT',
      });

      reply.send({
        success: true,
        messageId: result.key?.id,
        phone: targetPhone,
        status: 'SENT',
        result,
      });
    } catch (error) {
      console.error(error);
      reply.status(500).send({ 
        error: 'Failed to send message',
        message: error.message,
      });
    }
  });

  // Get message delivery status
  fastify.get('/status/:messageId', {
    preHandler: [fastify.verifyJWT],
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const { messageId } = request.params as { messageId: string };
      
      const evolutionService = await createEvolutionAPIService(fastify.prisma, tenantId);
      
      // Get message status from Evolution API
      const status = await evolutionService.getMessageStatus(messageId);

      const messageStatus = status?.key?.fromMe ? 'SENT' : 'UNKNOWN';
      
      // Update in our database
      await fastify.prisma.messageLog.updateMany({
        where: {
          id: messageId,
          userId: tenantId,
        },
        data: {
          status: messageStatus,
          updatedAt: new Date(),
        },
      });

      reply.send({
        messageId,
        status: messageStatus,
        evolutionStatus: status,
      });
    } catch (error) {
      console.error(error);
      reply.status(500).send({ 
        error: 'Failed to get message status',
        message: error.message,
      });
    }
  });

  // Get chat history with contact
  fastify.get('/chat/:contactId', {
    preHandler: [fastify.verifyJWT],
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const { contactId } = request.params as { contactId: string };
      const { page = '1', limit = '50' } = request.query as any;
      
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      // Get contact info
      const contact = await fastify.prisma.contact.findFirst({
        where: {
          id: contactId,
          userId: tenantId,
        },
      });

      if (!contact) {
        return reply.status(404).send({ error: 'Contact not found' });
      }

      const evolutionService = await createEvolutionAPIService(fastify.prisma, tenantId);
      
      // Get chat history from Evolution API
      const messages = await evolutionService.getChatHistory(contact.phone, pageNum, limitNum);

      // Get our local message logs
      const localMessages = await fastify.prisma.messageLog.findMany({
        where: {
          userId: tenantId,
          phone: contact.phone,
        },
        orderBy: { createdAt: 'desc' },
        take: limitNum,
      });

      reply.send({
        contact: {
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
        },
        messages,
        localMessages,
        pagination: {
          page: pageNum,
          limit: limitNum,
          hasMore: messages.length === limitNum,
        },
      });
    } catch (error) {
      console.error(error);
      reply.status(500).send({ 
        error: 'Failed to get chat history',
        message: error.message,
      });
    }
  });

  // Disconnect/reset WhatsApp instance
  fastify.post('/disconnect', {
    preHandler: [fastify.verifyJWT],
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const evolutionService = await createEvolutionAPIService(fastify.prisma, tenantId);

      // Disconnect instance
      await evolutionService.logout();

      reply.send({
        message: 'WhatsApp instance disconnected successfully',
        instance: evolutionService.getCredentials().instanceName,
      });
    } catch (error) {
      console.error(error);
      reply.status(500).send({ 
        error: 'Failed to disconnect WhatsApp',
        message: error.message,
      });
    }
  });

  // Restart WhatsApp instance
  fastify.post('/restart', {
    preHandler: [fastify.verifyJWT],
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const evolutionService = await createEvolutionAPIService(fastify.prisma, tenantId);

      const result = await evolutionService.restartInstance();

      reply.send({
        message: 'WhatsApp instance restarted successfully',
        instance: result.instance,
      });
    } catch (error) {
      console.error(error);
      reply.status(500).send({ 
        error: 'Failed to restart WhatsApp',
        message: error.message,
      });
    }
  });

  // Check if phone number is WhatsApp
  fastify.post('/check-whatsapp', {
    preHandler: [fastify.verifyJWT],
    schema: {
      body: {
        type: 'object',
        required: ['phone'],
        properties: {
          phone: { type: 'string' },
        },
      },
    },
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const { phone } = request.body as { phone: string };
      
      const evolutionService = await createEvolutionAPIService(fastify.prisma, tenantId);
      
      const result = await evolutionService.checkWhatsAppNumber(phone);
      
      reply.send({
        phone,
        isWhatsApp: result[0]?.exists || false,
        jid: result[0]?.jid || null,
      });
    } catch (error) {
      console.error(error);
      reply.status(500).send({ 
        error: 'Failed to check WhatsApp number',
        message: error.message,
      });
    }
  });

  // Mark messages as read
  fastify.post('/mark-read', {
    preHandler: [fastify.verifyJWT],
    schema: {
      body: {
        type: 'object',
        required: ['messages'],
        properties: {
          messages: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                remoteJid: { type: 'string' },
                fromMe: { type: 'boolean' },
                id: { type: 'string' },
              },
              required: ['remoteJid', 'fromMe', 'id'],
            },
          },
        },
      },
    },
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const { messages } = request.body as { messages: any[] };
      
      const evolutionService = await createEvolutionAPIService(fastify.prisma, tenantId);
      
      const result = await evolutionService.markMessageAsRead(messages);
      
      reply.send({
        success: true,
        result,
      });
    } catch (error) {
      console.error(error);
      reply.status(500).send({ 
        error: 'Failed to mark messages as read',
        message: error.message,
      });
    }
  });

  // Archive chat
  fastify.post('/archive-chat', {
    preHandler: [fastify.verifyJWT],
    schema: {
      body: {
        type: 'object',
        required: ['chatId', 'lastMessage'],
        properties: {
          chatId: { type: 'string' },
          lastMessage: { type: 'object' },
          archive: { type: 'boolean', default: true },
        },
      },
    },
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const { chatId, lastMessage, archive } = request.body;
      
      const evolutionService = await createEvolutionAPIService(fastify.prisma, tenantId);
      
      const result = await evolutionService.archiveChat(chatId, lastMessage, archive);
      
      reply.send({
        success: true,
        result,
      });
    } catch (error) {
      console.error(error);
      reply.status(500).send({ 
        error: 'Failed to archive chat',
        message: error.message,
      });
    }
  });

  // Send contact
  fastify.post('/send-contact', {
    preHandler: [fastify.verifyJWT],
    schema: {
      body: {
        type: 'object',
        required: ['phone', 'contact'],
        properties: {
          phone: { type: 'string' },
          contact: {
            type: 'object',
            properties: {
              fullName: { type: 'string' },
              wuid: { type: 'string' },
              phoneNumber: { type: 'string' },
              organization: { type: 'string' },
              email: { type: 'string' },
              url: { type: 'string' },
            },
          },
        },
      },
    },
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const { phone, contact } = request.body;
      
      const evolutionService = await createEvolutionAPIService(fastify.prisma, tenantId);
      
      const result = await evolutionService.sendContact(phone, [contact]);
      
      reply.send({
        success: true,
        result,
      });
    } catch (error) {
      console.error(error);
      reply.status(500).send({ 
        error: 'Failed to send contact',
        message: error.message,
      });
    }
  });

  // Send reaction
  fastify.post('/send-reaction', {
    preHandler: [fastify.verifyJWT],
    schema: {
      body: {
        type: 'object',
        required: ['messageKey', 'reaction'],
        properties: {
          messageKey: {
            type: 'object',
            properties: {
              remoteJid: { type: 'string' },
              fromMe: { type: 'boolean' },
              id: { type: 'string' },
            },
            required: ['remoteJid', 'fromMe', 'id'],
          },
          reaction: { type: 'string' },
        },
      },
    },
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const { messageKey, reaction } = request.body;
      
      const evolutionService = await createEvolutionAPIService(fastify.prisma, tenantId);
      
      const result = await evolutionService.sendReaction(messageKey, reaction);
      
      reply.send({
        success: true,
        result,
      });
    } catch (error) {
      console.error(error);
      reply.status(500).send({ 
        error: 'Failed to send reaction',
        message: error.message,
      });
    }
  });

  // Get connection statistics
  fastify.get('/stats', {
    preHandler: [fastify.verifyJWT],
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      
      const [totalMessages, sentMessages, failedMessages, contactsCount] = await Promise.all([
        fastify.prisma.messageLog.count({
          where: { userId: tenantId, channel: 'WHATSAPP' },
        }),
        fastify.prisma.messageLog.count({
          where: { userId: tenantId, channel: 'WHATSAPP', status: 'SENT' },
        }),
        fastify.prisma.messageLog.count({
          where: { userId: tenantId, channel: 'WHATSAPP', status: 'FAILED' },
        }),
        fastify.prisma.contact.count({
          where: { userId: tenantId },
        }),
      ]);

      reply.send({
        totalMessages,
        sentMessages,
        failedMessages,
        successRate: totalMessages > 0 ? (sentMessages / totalMessages) * 100 : 0,
        contactsCount,
      });
    } catch (error) {
      console.error(error);
      reply.status(500).send({ 
        error: 'Failed to get WhatsApp statistics',
        message: error.message,
      });
    }
  });

  // Fetch all instances (admin feature)
  fastify.get('/instances', {
    preHandler: [fastify.verifyJWT],
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      
      const evolutionService = await createEvolutionAPIService(fastify.prisma, tenantId);
      const instances = await evolutionService.fetchInstances();
      
      reply.send({
        instances,
      });
    } catch (error) {
      console.error(error);
      reply.status(500).send({ 
        error: 'Failed to fetch instances',
        message: error.message,
      });
    }
  });
};

export default whatsappRoutes;