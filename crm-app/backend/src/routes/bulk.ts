import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: any;
    verifyJWT: any;
    tenantRateLimit: any;
  }
}

const bulkRoutes: FastifyPluginAsync = async (fastify) => {
  // Validate bulk send request
  const bulkSendSchema = z.object({
    campaignId: z.string(),
    contacts: z.array(z.object({
      id: z.string(),
      phone: z.string(),
      name: z.string().optional(),
    })),
    messageTemplate: z.object({
      content: z.string(),
      variables: z.record(z.string()).optional(),
    }),
    options: z.object({
      minDelay: z.number().min(1000).max(60000).default(5000),
      maxDelay: z.number().min(1000).max(120000).default(30000),
      retryFailed: z.boolean().default(false),
      maxRetries: z.number().min(1).max(5).default(3),
    }).optional(),
  });

  /**
   * GET /api/v1/bulk/campaigns
   * Get all campaigns for the current tenant
   */
  fastify.get('/campaigns', {
    preHandler: [fastify.verifyJWT],
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;

      const campaigns = await fastify.prisma.campaign.findMany({
        where: { userId: tenantId },
        include: {
          messages: {
            select: {
              id: true,
              status: true,
              createdAt: true,
            },
          },
          _count: {
            select: {
              messages: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      reply.send(campaigns);
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch campaigns' });
    }
  });

  /**
   * POST /api/v1/bulk/campaigns
   * Create a new campaign with tenant isolation
   */
  fastify.post('/campaigns', {
    preHandler: [fastify.verifyJWT],
    schema: {
      body: {
        type: 'object',
        required: ['name', 'description'],
        properties: {
          name: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          minDelay: { type: 'number', minimum: 1000, maximum: 60000 },
          maxDelay: { type: 'number', minimum: 1000, maximum: 120000 },
          startAt: { type: 'string' },
          endAt: { type: 'string' },
        },
      },
    },
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const { name, description, minDelay = 5000, maxDelay = 30000, startAt, endAt } = request.body;

      // Get user and branch info
      const user = await fastify.prisma.user.findUnique({
        where: { id: tenantId },
        include: { branch: true },
      });

      if (!user?.branchId) {
        return reply.status(400).send({
          error: 'User branch not configured',
          message: 'Please ensure your account is associated with a branch',
        });
      }

      // Create campaign
      const campaign = await fastify.prisma.campaign.create({
        data: {
          name,
          description,
          userId: tenantId,
          branchId: user.branchId,
          minDelay,
          maxDelay,
          startAt: startAt ? new Date(startAt) : null,
          endAt: endAt ? new Date(endAt) : null,
          status: 'DRAFT',
        },
      });

      reply.send({
        message: 'Campaign created successfully',
        campaign,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to create campaign' });
    }
  });

  /**
   * GET /api/v1/bulk/campaigns/:id
   * Get a specific campaign with all related data
   */
  fastify.get('/campaigns/:id', {
    preHandler: [fastify.verifyJWT],
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const campaignId = request.params.id;

      const campaign = await fastify.prisma.campaign.findFirst({
        where: {
          id: campaignId,
          userId: tenantId,
        },
        include: {
          messages: {
            include: {
              contact: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
          jobQueues: {
            orderBy: { createdAt: 'desc' },
          },
          templates: true,
          _count: {
            select: {
              messages: true,
            },
          },
        },
      });

      if (!campaign) {
        return reply.status(404).send({
          error: 'Campaign not found',
          message: 'The specified campaign does not exist or does not belong to your account',
        });
      }

      reply.send(campaign);
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch campaign' });
    }
  });

  /**
   * POST /api/v1/bulk/send
   * Send bulk messages with tenant-aware rate limiting
   */
  fastify.post('/send', {
    preHandler: [
      fastify.verifyJWT,
      fastify.tenantRateLimit,
    ],
    schema: {
      body: {
        type: 'object',
        required: ['campaignId', 'contacts', 'messageTemplate'],
        properties: {
          campaignId: { type: 'string' },
          contacts: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'phone'],
              properties: {
                id: { type: 'string' },
                phone: { type: 'string' },
                name: { type: 'string' },
              },
            },
          },
          messageTemplate: {
            type: 'object',
            required: ['content'],
            properties: {
              content: { type: 'string' },
              variables: { type: 'object' },
            },
          },
          options: {
            type: 'object',
            properties: {
              minDelay: { type: 'number', minimum: 1000, maximum: 60000 },
              maxDelay: { type: 'number', minimum: 1000, maximum: 120000 },
              retryFailed: { type: 'boolean' },
              maxRetries: { type: 'number', minimum: 1, maximum: 5 },
            },
          },
        },
      },
    },
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const { campaignId, contacts, messageTemplate, options = {} } = bulkSendSchema.parse(request.body);

      // Verify campaign belongs to tenant
      const campaign = await fastify.prisma.campaign.findFirst({
        where: {
          id: campaignId,
          userId: tenantId,
        },
        include: {
          messages: true,
        },
      });

      if (!campaign) {
        return reply.status(404).send({
          error: 'Campaign not found',
          message: 'The specified campaign does not exist or does not belong to your account',
        });
      }

      // Check Evolution API credentials
      const user = await fastify.prisma.user.findUnique({
        where: { id: tenantId },
        select: {
          evolutionUrl: true,
          evolutionApiKey: true,
          instanceName: true,
        },
      });

      if (!user?.evolutionUrl || !user?.evolutionApiKey || !user?.instanceName) {
        return reply.status(400).send({
          error: 'Evolution API credentials not configured',
          message: 'Please configure your Evolution API credentials in Settings',
        });
      }

      // Create jobs for each contact with tenant context
      const { Queue } = await import('bullmq');
      const bulkQueue = new Queue('bulkQueue', {
        connection: fastify.redis,
        defaultJobOptions: {
          removeOnComplete: true,
          attempts: options.maxRetries || 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          delay: options.minDelay || 5000,
        },
      });

      const jobPromises = contacts.map((contact, index) => {
        const delay = (options.minDelay || 5000) + Math.random() * ((options.maxDelay || 30000) - (options.minDelay || 5000));
        
        return bulkQueue.add('sendMessage', {
          tenantId,
          userId: tenantId,
          campaignId,
          contactId: contact.id,
          contactPhone: contact.phone,
          contactName: contact.name,
          messageContent: messageTemplate.content,
          messageVariables: messageTemplate.variables || {},
          messageId: `msg_${contact.id}_${Date.now()}`,
        }, {
          delay: Math.floor(delay),
          priority: index, // Process in order
        });
      });

      await Promise.all(jobPromises);

      // Update campaign status
      await fastify.prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: 'ACTIVE',
          totalMessages: contacts.length,
        },
      });

      reply.send({
        message: 'Bulk send initiated successfully',
        campaignId,
        totalMessages: contacts.length,
        estimatedTime: Math.ceil(contacts.length * (options.minDelay || 5000) / 1000 / 60), // minutes
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to initiate bulk send' });
    }
  });

  /**
   * GET /api/v1/bulk/campaign/:id/status
   * Get campaign status with tenant isolation
   */
  fastify.get('/campaign/:id/status', {
    preHandler: [fastify.verifyJWT],
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const campaignId = request.params.id;

      const campaign = await fastify.prisma.campaign.findFirst({
        where: {
          id: campaignId,
          userId: tenantId,
        },
        include: {
          messages: {
            select: {
              id: true,
              status: true,
              sentAt: true,
              deliveredAt: true,
              errorMessage: true,
              contactId: true,
            },
            orderBy: { createdAt: 'desc' },
          },
          jobQueues: {
            select: {
              id: true,
              status: true,
              progress: true,
              scheduledAt: true,
            },
          },
        },
      });

      if (!campaign) {
        return reply.status(404).send({
          error: 'Campaign not found',
          message: 'The specified campaign does not exist or does not belong to your account',
        });
      }

      // Calculate statistics
      const totalMessages = campaign.messages.length;
      const sentMessages = campaign.messages.filter(m => ['SENT', 'DELIVERED', 'READ'].includes(m.status)).length;
      const deliveredMessages = campaign.messages.filter(m => ['DELIVERED', 'READ'].includes(m.status)).length;
      const failedMessages = campaign.messages.filter(m => m.status === 'FAILED').length;

      reply.send({
        campaign: {
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          totalMessages: campaign.totalMessages,
          sentMessages,
          deliveredMessages,
          failedMessages,
          createdAt: campaign.createdAt,
          updatedAt: campaign.updatedAt,
        },
        messages: campaign.messages,
        queueJobs: campaign.jobQueues,
        statistics: {
          total: totalMessages,
          sent: sentMessages,
          delivered: deliveredMessages,
          failed: failedMessages,
          pending: totalMessages - sentMessages,
          successRate: totalMessages > 0 ? Math.round((sentMessages / totalMessages) * 100) : 0,
        },
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch campaign status' });
    }
  });

  /**
   * POST /api/v1/bulk/campaign/:id/pause
   * Pause a running campaign
   */
  fastify.post('/campaign/:id/pause', {
    preHandler: [fastify.verifyJWT],
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const campaignId = request.params.id;

      // Verify campaign belongs to tenant
      const campaign = await fastify.prisma.campaign.findFirst({
        where: {
          id: campaignId,
          userId: tenantId,
        },
      });

      if (!campaign) {
        return reply.status(404).send({
          error: 'Campaign not found',
          message: 'The specified campaign does not exist or does not belong to your account',
        });
      }

      // Pause the campaign
      await fastify.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'PAUSED' },
      });

      // Pause queued jobs
      const { Queue } = await import('bullmq');
      const bulkQueue = new Queue('bulkQueue', { connection: fastify.redis });
      await bulkQueue.pause();

      reply.send({
        message: 'Campaign paused successfully',
        campaignId,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to pause campaign' });
    }
  });

  /**
   * POST /api/v1/bulk/campaign/:id/resume
   * Resume a paused campaign
   */
  fastify.post('/campaign/:id/resume', {
    preHandler: [fastify.verifyJWT],
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const campaignId = request.params.id;

      // Verify campaign belongs to tenant
      const campaign = await fastify.prisma.campaign.findFirst({
        where: {
          id: campaignId,
          userId: tenantId,
        },
      });

      if (!campaign) {
        return reply.status(404).send({
          error: 'Campaign not found',
          message: 'The specified campaign does not exist or does not belong to your account',
        });
      }

      // Resume the campaign
      await fastify.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'ACTIVE' },
      });

      // Resume queued jobs
      const { Queue } = await import('bullmq');
      const bulkQueue = new Queue('bulkQueue', { connection: fastify.redis });
      await bulkQueue.resume();

      reply.send({
        message: 'Campaign resumed successfully',
        campaignId,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to resume campaign' });
    }
  });

  /**
   * DELETE /api/v1/bulk/campaign/:id
   * Delete a campaign (only if not running)
   */
  fastify.delete('/campaign/:id', {
    preHandler: [fastify.verifyJWT],
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const campaignId = request.params.id;

      // Verify campaign belongs to tenant and is not active
      const campaign = await fastify.prisma.campaign.findFirst({
        where: {
          id: campaignId,
          userId: tenantId,
          status: { not: 'ACTIVE' },
        },
      });

      if (!campaign) {
        return reply.status(400).send({
          error: 'Cannot delete campaign',
          message: 'Campaign not found, does not belong to your account, or is currently running',
        });
      }

      // Delete related data
      await fastify.prisma.message.deleteMany({
        where: { campaignId },
      });

      await fastify.prisma.jobQueue.deleteMany({
        where: { campaignId },
      });

      await fastify.prisma.campaign.delete({
        where: { id: campaignId },
      });

      reply.send({
        message: 'Campaign deleted successfully',
        campaignId,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to delete campaign' });
    }
  });
};

export default bulkRoutes;