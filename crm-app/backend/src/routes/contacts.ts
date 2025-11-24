import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { generateRandomId } from '../utils/encryption';
import { createContactDetectionService } from '../services/contactDetection';
import { AdvancedContactSearchService } from '../services/advancedSearch';
import { ContactSegmentationService, segmentDefinitionSchema } from '../services/contactSegmentation';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: any;
    verifyJWT: any;
  }
}

const contactsRoutes: FastifyPluginAsync = async (fastify) => {
  // Validation schemas
  const createContactSchema = z.object({
    name: z.string().min(1),
    phone: z.string().min(1),
    email: z.string().email().optional(),
    tags: z.array(z.string()).optional(),
    customFields: z.record(z.any()).optional(),
  });

  const updateContactSchema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    tags: z.array(z.string()).optional(),
    customFields: z.record(z.any()).optional(),
    isBlocked: z.boolean().optional(),
    isVerified: z.boolean().optional(),
  });

  // Get all contacts for current user (tenant)
  fastify.get('/', {
    preHandler: [fastify.verifyJWT],
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const { page = '1', limit = '50', search = '', tags = '' } = request.query as any;
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // Build where clause with tenant isolation
      const where: any = {
        userId: tenantId,
      };

      // Add search functionality
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Add tag filtering
      if (tags) {
        const tagList = tags.split(',').map((t: string) => t.trim());
        where.tags = {
          hasSome: tagList,
        };
      }

      // Get contacts with pagination
      const [contacts, total] = await Promise.all([
        fastify.prisma.contact.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { createdAt: 'desc' },
        }),
        fastify.prisma.contact.count({ where }),
      ]);

      const totalPages = Math.ceil(total / limitNum);

      reply.send({
        contacts,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        },
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch contacts' });
    }
  });

  // Get contact by ID
  fastify.get('/:id', {
    preHandler: [fastify.verifyJWT],
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const { id } = request.params as { id: string };

      const contact = await fastify.prisma.contact.findFirst({
        where: {
          id,
          userId: tenantId,
        },
      });

      if (!contact) {
        return reply.status(404).send({ error: 'Contact not found' });
      }

      reply.send(contact);
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch contact' });
    }
  });

  // Create new contact
  fastify.post('/', {
    preHandler: [fastify.verifyJWT],
    schema: {
      body: {
        type: 'object',
        required: ['name', 'phone'],
        properties: {
          name: { type: 'string', minLength: 1 },
          phone: { type: 'string', minLength: 1 },
          email: { type: 'string', format: 'email' },
          tags: { type: 'array', items: { type: 'string' } },
          customFields: { type: 'object' },
        },
      },
    },
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const userId = request.user.userId;
      const { name, phone, email, tags, customFields } = createContactSchema.parse(request.body);

      // Check if contact already exists for this user
      const existingContact = await fastify.prisma.contact.findFirst({
        where: {
          userId: tenantId,
          phone,
        },
      });

      if (existingContact) {
        return reply.status(400).send({
          error: 'Contact already exists',
          message: 'A contact with this phone number already exists',
        });
      }

      // Normalize phone number (remove non-digits except +)
      const normalizedPhone = phone.replace(/[^\d+]/g, '');
      
      // Auto-assign external ID for tracking
      const externalId = generateRandomId();

      const contact = await fastify.prisma.contact.create({
        data: {
          name,
          phone: normalizedPhone,
          email,
          tags: tags || [],
          customFields: customFields || {},
          userId: tenantId,
          externalId,
          source: 'MANUAL',
        },
      });

      // Emit real-time event
      fastify.io.to(tenantId).emit('contact:created', contact);

      reply.status(201).send(contact);
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to create contact' });
    }
  });

  // Update contact
  fastify.put('/:id', {
    preHandler: [fastify.verifyJWT],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          email: { type: 'string', format: 'email' },
          tags: { type: 'array', items: { type: 'string' } },
          customFields: { type: 'object' },
          isBlocked: { type: 'boolean' },
          isVerified: { type: 'boolean' },
        },
      },
    },
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const { id } = request.params as { id: string };
      const data = updateContactSchema.parse(request.body);

      // Check if contact exists and belongs to user
      const existingContact = await fastify.prisma.contact.findFirst({
        where: {
          id,
          userId: tenantId,
        },
      });

      if (!existingContact) {
        return reply.status(404).send({ error: 'Contact not found' });
      }

      const contact = await fastify.prisma.contact.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });

      // Emit real-time event
      fastify.io.to(tenantId).emit('contact:updated', contact);

      reply.send(contact);
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to update contact' });
    }
  });

  // Delete contact
  fastify.delete('/:id', {
    preHandler: [fastify.verifyJWT],
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const { id } = request.params as { id: string };

      // Check if contact exists and belongs to user
      const existingContact = await fastify.prisma.contact.findFirst({
        where: {
          id,
          userId: tenantId,
        },
      });

      if (!existingContact) {
        return reply.status(404).send({ error: 'Contact not found' });
      }

      await fastify.prisma.contact.delete({
        where: { id },
      });

      // Emit real-time event
      fastify.io.to(tenantId).emit('contact:deleted', { id });

      reply.send({ message: 'Contact deleted successfully' });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to delete contact' });
    }
  });

  // Bulk import contacts
  fastify.post('/import', {
    preHandler: [fastify.verifyJWT],
    schema: {
      body: {
        type: 'object',
        required: ['contacts'],
        properties: {
          contacts: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'phone'],
              properties: {
                name: { type: 'string' },
                phone: { type: 'string' },
                email: { type: 'string', format: 'email' },
                tags: { type: 'array', items: { type: 'string' } },
                customFields: { type: 'object' },
              },
            },
          },
          overwrite: { type: 'boolean', default: false },
        },
      },
    },
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const { contacts, overwrite = false } = request.body as {
        contacts: any[];
        overwrite: boolean;
      };

      const results = {
        imported: 0,
        updated: 0,
        skipped: 0,
        errors: [] as string[],
      };

      for (const contactData of contacts) {
        try {
          const { name, phone, email, tags, customFields } = contactData;
          
          // Normalize phone number
          const normalizedPhone = phone.replace(/[^\d+]/g, '');
          
          const existingContact = await fastify.prisma.contact.findFirst({
            where: {
              userId: tenantId,
              phone: normalizedPhone,
            },
          });

          if (existingContact) {
            if (overwrite) {
              await fastify.prisma.contact.update({
                where: { id: existingContact.id },
                data: {
                  name,
                  email,
                  tags: tags || [],
                  customFields: customFields || {},
                  updatedAt: new Date(),
                },
              });
              results.updated++;
            } else {
              results.skipped++;
            }
          } else {
            const externalId = generateRandomId();
            
            await fastify.prisma.contact.create({
              data: {
                name,
                phone: normalizedPhone,
                email,
                tags: tags || [],
                customFields: customFields || {},
                userId: tenantId,
                externalId,
                source: 'IMPORT',
              },
            });
            results.imported++;
          }
        } catch (error) {
          results.errors.push(`Failed to import contact ${contactData.name}: ${error}`);
        }
      }

      // Emit real-time event
      fastify.io.to(tenantId).emit('contacts:imported', results);

      reply.send(results);
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to import contacts' });
    }
  });

  // Export contacts
  fastify.get('/export', {
    preHandler: [fastify.verifyJWT],
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const { format = 'csv' } = request.query as any;

      const contacts = await fastify.prisma.contact.findMany({
        where: { userId: tenantId },
        orderBy: { createdAt: 'desc' },
      });

      if (format === 'json') {
        reply.header('Content-Type', 'application/json');
        reply.header('Content-Disposition', 'attachment; filename="contacts.json"');
        return reply.send(JSON.stringify(contacts, null, 2));
      } else {
        // CSV format
        const csvHeaders = 'Name,Phone,Email,Tags,Created At,Updated At\n';
        const csvRows = contacts.map((contact: any) =>
          `"${contact.name}","${contact.phone}","${contact.email || ''}","${(contact.tags || []).join(', ')}","${contact.createdAt.toISOString()}","${contact.updatedAt.toISOString()}"`
        ).join('\n');
        
        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', 'attachment; filename="contacts.csv"');
        return reply.send(csvHeaders + csvRows);
      }
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to export contacts' });
    }
  });

  // Get contact statistics
  fastify.get('/stats', {
    preHandler: [fastify.verifyJWT],
  }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenantId;

      const [total, verified, blocked, bySource] = await Promise.all([
        fastify.prisma.contact.count({
          where: { userId: tenantId },
        }),
        fastify.prisma.contact.count({
          where: { userId: tenantId, isVerified: true },
        }),
        fastify.prisma.contact.count({
          where: { userId: tenantId, isBlocked: true },
        }),
        fastify.prisma.contact.groupBy({
          by: ['source'],
          where: { userId: tenantId },
          _count: { id: true },
        }),
      ]);

      reply.send({
        total,
        verified,
        blocked,
        bySource: bySource.reduce((acc: any, item: any) => {
          acc[item.source] = item._count.id;
          return acc;
        }, {}),
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch contact statistics' });
    }
  });

  // ========================================
  // ADVANCED FEATURES - PHASE 4 COMPLETION
  // ========================================

  // Auto-detect new contacts from WhatsApp
  fastify.post('/detect', {
    preHandler: [fastify.verifyJWT],
    schema: {
      body: {
        type: 'object',
        properties: {
          autoCreateUnknown: { type: 'boolean', default: false },
          autoUpdateExisting: { type: 'boolean', default: true },
          dedupThreshold: { type: 'number', default: 0.7 },
          syncIntervalMinutes: { type: 'number', default: 30 },
        },
      },
    },
  }, async (request: any, reply) => {
    try {
      const userId = request.user.userId;
      const options = request.body;

      const detectionService = await createContactDetectionService(
        fastify.prisma,
        userId,
        options
      );

      const result = await detectionService.detectNewContacts(userId);

      // Emit real-time event
      fastify.io.to(request.user.tenantId).emit('contacts:auto_detected', result);

      reply.send({
        message: 'Contact detection completed',
        ...result,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to detect contacts from WhatsApp' });
    }
  });

  // Get contact merge suggestions (deduplication)
  fastify.get('/merge-suggestions', {
    preHandler: [fastify.verifyJWT],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          threshold: { type: 'number', default: 0.7 },
        },
      },
    },
  }, async (request: any, reply) => {
    try {
      const userId = request.user.userId;
      const { threshold = 0.7 } = request.query as any;

      const detectionService = await createContactDetectionService(
        fastify.prisma,
        userId,
        { dedupThreshold: threshold }
      );

      const suggestions = await detectionService.getMergeSuggestions(userId);

      reply.send({
        suggestions,
        count: suggestions.length,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to get merge suggestions' });
    }
  });

  // Advanced search with filtering
  fastify.post('/search', {
    preHandler: [fastify.verifyJWT],
    schema: {
      body: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          source: { type: 'array', items: { type: 'string' } },
          isVerified: { type: 'boolean' },
          isBlocked: { type: 'boolean' },
          autoDetected: { type: 'boolean' },
          createdFrom: { type: 'string', format: 'date-time' },
          createdTo: { type: 'string', format: 'date-time' },
          updatedFrom: { type: 'string', format: 'date-time' },
          updatedTo: { type: 'string', format: 'date-time' },
          customFields: { type: 'object' },
          hasName: { type: 'boolean' },
          hasEmail: { type: 'boolean' },
          phoneStartsWith: { type: 'string' },
          emailDomain: { type: 'string' },
          page: { type: 'number', minimum: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100 },
          sortBy: { type: 'string' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'] },
          includeFacets: { type: 'boolean', default: true },
        },
      },
    },
  }, async (request: any, reply) => {
    try {
      const userId = request.user.userId;
      const filters = request.body;

      // Validate filters
      const validation = AdvancedContactSearchService.validateSearchFilters(filters);
      if (!validation.valid) {
        return reply.status(400).send({
          error: 'Invalid search filters',
          details: validation.errors,
        });
      }

      const searchService = new AdvancedContactSearchService(fastify.prisma);
      const result = await searchService.searchContacts(
        userId,
        filters,
        filters.includeFacets !== false
      );

      reply.send(result);
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to search contacts' });
    }
  });

  // Get contact suggestions (auto-complete)
  fastify.get('/suggestions', {
    preHandler: [fastify.verifyJWT],
    schema: {
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', minLength: 1 },
          limit: { type: 'number', default: 10, maximum: 20 },
        },
      },
    },
  }, async (request: any, reply) => {
    try {
      const userId = request.user.userId;
      const { q, limit = 10 } = request.query as any;

      const searchService = new AdvancedContactSearchService(fastify.prisma);
      const suggestions = await searchService.getContactSuggestions(userId, q, limit);

      reply.send({
        query: q,
        suggestions,
        count: suggestions.length,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to get contact suggestions' });
    }
  });

  // Bulk tag operations
  fastify.post('/bulk/tags', {
    preHandler: [fastify.verifyJWT],
    schema: {
      body: {
        type: 'object',
        required: ['operation'],
        properties: {
          operation: { type: 'string', enum: ['add_tags', 'remove_tags'] },
          contactIds: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  }, async (request: any, reply) => {
    try {
      const userId = request.user.userId;
      const { operation, contactIds, tags } = request.body;

      if (!tags || tags.length === 0) {
        return reply.status(400).send({ error: 'Tags are required' });
      }

      const searchService = new AdvancedContactSearchService(fastify.prisma);

      const tagOps = {
        addTags: operation === 'add_tags' ? tags : [],
        removeTags: operation === 'remove_tags' ? tags : [],
      };

      const result = await searchService.bulkTagOperations(userId, tagOps, contactIds);

      // Emit real-time event
      fastify.io.to(request.user.tenantId).emit('contacts:bulk_tags_updated', {
        operation,
        contactIds,
        tags,
        result,
      });

      reply.send({
        message: `Bulk ${operation} completed`,
        ...result,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to perform bulk tag operation' });
    }
  });

  // Merge duplicate contacts
  fastify.post('/merge', {
    preHandler: [fastify.verifyJWT],
    schema: {
      body: {
        type: 'object',
        required: ['contactIds', 'targetContactId'],
        properties: {
          contactIds: { type: 'array', items: { type: 'string' }, minItems: 2 },
          targetContactId: { type: 'string' },
        },
      },
    },
  }, async (request: any, reply) => {
    try {
      const userId = request.user.userId;
      const { contactIds, targetContactId } = request.body;

      const searchService = new AdvancedContactSearchService(fastify.prisma);

      const operation = {
        operation: 'merge_contacts' as const,
        contactIds: [...contactIds, targetContactId],
        data: { targetContactId },
      };

      const result = await searchService.bulkContactOperations(userId, operation);

      // Emit real-time event
      fastify.io.to(request.user.tenantId).emit('contacts:merged', {
        sourceContactIds: contactIds.filter((id: string) => id !== targetContactId),
        targetContactId,
        result,
      });

      reply.send({
        message: 'Contact merge completed',
        ...result,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to merge contacts' });
    }
  });

  // ========================================
  // CONTACT SEGMENTATION ROUTES
  // ========================================

  // Create a new segment
  fastify.post('/segments', {
    preHandler: [fastify.verifyJWT],
    schema: {
      body: segmentDefinitionSchema,
    },
  }, async (request: any, reply) => {
    try {
      const userId = request.user.userId;
      const segmentData = request.body;

      const segmentationService = new ContactSegmentationService(fastify.prisma);
      const segment = await segmentationService.createSegment(userId, segmentData);

      reply.status(201).send(segment);
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to create segment' });
    }
  });

  // Get all segments
  fastify.get('/segments', {
    preHandler: [fastify.verifyJWT],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          includeStats: { type: 'boolean', default: false },
        },
      },
    },
  }, async (request: any, reply) => {
    try {
      const userId = request.user.userId;
      const { includeStats = false } = request.query as any;

      const segmentationService = new ContactSegmentationService(fastify.prisma);
      const segments = await segmentationService.getSegments(userId, includeStats);

      reply.send({
        segments,
        count: segments.length,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch segments' });
    }
  });

  // Update a segment
  fastify.put('/segments/:segmentId', {
    preHandler: [fastify.verifyJWT],
    schema: {
      body: segmentDefinitionSchema.partial(),
    },
  }, async (request: any, reply) => {
    try {
      const userId = request.user.userId;
      const { segmentId } = request.params as { segmentId: string };
      const updateData = request.body;

      const segmentationService = new ContactSegmentationService(fastify.prisma);
      const segment = await segmentationService.updateSegment(userId, segmentId, updateData);

      reply.send(segment);
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to update segment' });
    }
  });

  // Delete a segment
  fastify.delete('/segments/:segmentId', {
    preHandler: [fastify.verifyJWT],
  }, async (request: any, reply) => {
    try {
      const userId = request.user.userId;
      const { segmentId } = request.params as { segmentId: string };

      const segmentationService = new ContactSegmentationService(fastify.prisma);
      await segmentationService.deleteSegment(userId, segmentId);

      reply.send({ message: 'Segment deleted successfully' });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to delete segment' });
    }
  });

  // Get contacts in a segment
  fastify.get('/segments/:segmentId/contacts', {
    preHandler: [fastify.verifyJWT],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100 },
        },
      },
    },
  }, async (request: any, reply) => {
    try {
      const userId = request.user.userId;
      const { segmentId } = request.params as { segmentId: string };
      const { page = 1, limit = 50 } = request.query as any;

      const segmentationService = new ContactSegmentationService(fastify.prisma);
      const result = await segmentationService.getSegmentContacts(userId, segmentId, page, limit);

      reply.send(result);
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch segment contacts' });
    }
  });

  // Add contacts to segment manually
  fastify.post('/segments/:segmentId/contacts', {
    preHandler: [fastify.verifyJWT],
    schema: {
      body: {
        type: 'object',
        required: ['contactIds'],
        properties: {
          contactIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  }, async (request: any, reply) => {
    try {
      const userId = request.user.userId;
      const { segmentId } = request.params as { segmentId: string };
      const { contactIds } = request.body;

      const segmentationService = new ContactSegmentationService(fastify.prisma);
      const result = await segmentationService.addContactsToSegment(userId, segmentId, contactIds);

      reply.send({
        message: 'Contacts added to segment',
        ...result,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to add contacts to segment' });
    }
  });

  // Remove contacts from segment
  fastify.delete('/segments/:segmentId/contacts', {
    preHandler: [fastify.verifyJWT],
    schema: {
      body: {
        type: 'object',
        required: ['contactIds'],
        properties: {
          contactIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  }, async (request: any, reply) => {
    try {
      const userId = request.user.userId;
      const { segmentId } = request.params as { segmentId: string };
      const { contactIds } = request.body;

      const segmentationService = new ContactSegmentationService(fastify.prisma);
      const result = await segmentationService.removeContactsFromSegment(userId, segmentId, contactIds);

      reply.send({
        message: 'Contacts removed from segment',
        ...result,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to remove contacts from segment' });
    }
  });

  // Recalculate all dynamic segments
  fastify.post('/segments/recalculate', {
    preHandler: [fastify.verifyJWT],
  }, async (request: any, reply) => {
    try {
      const userId = request.user.userId;

      const segmentationService = new ContactSegmentationService(fastify.prisma);
      const result = await segmentationService.recalculateAllSegments(userId);

      reply.send({
        message: 'Segments recalculation completed',
        ...result,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to recalculate segments' });
    }
  });

  // Create predefined segments
  fastify.post('/segments/predefined', {
    preHandler: [fastify.verifyJWT],
  }, async (request: any, reply) => {
    try {
      const userId = request.user.userId;

      const segmentationService = new ContactSegmentationService(fastify.prisma);
      const segments = await segmentationService.createPredefinedSegments(userId);

      reply.send({
        message: 'Predefined segments created',
        segments,
        count: segments.length,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to create predefined segments' });
    }
  });
};

export default contactsRoutes;