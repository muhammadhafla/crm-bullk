import { z } from 'zod';

/**
 * Advanced Contact Search and Filtering Service
 */
export interface SearchFilters {
  // Basic filters
  search?: string;
  tags?: string[];
  source?: string[];
  isVerified?: boolean;
  isBlocked?: boolean;
  autoDetected?: boolean;
  
  // Date filters
  createdFrom?: Date;
  createdTo?: Date;
  updatedFrom?: Date;
  updatedTo?: Date;
  
  // Custom field filters
  customFields?: Record<string, any>;
  
  // Contact details
  hasName?: boolean;
  hasEmail?: boolean;
  phoneStartsWith?: string;
  emailDomain?: string;
  
  // Pagination
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ContactSearchResult {
  contacts: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  facets: {
    totalCount: number;
    bySource: Record<string, number>;
    byTags: Record<string, number>;
    byVerification: {
      verified: number;
      unverified: number;
    };
    byBlockStatus: {
      blocked: number;
      unblocked: number;
    };
    byAutoDetection: {
      autoDetected: number;
      manual: number;
    };
  };
}

/**
 * Contact Tag Management Service
 */
export interface TagOperations {
  addTags: string[];
  removeTags: string[];
  replaceTags?: string[];
}

export interface BulkContactOperation {
  operation: 'add_tags' | 'remove_tags' | 'update_status' | 'merge_contacts' | 'export';
  contactIds: string[];
  data?: any;
}

/**
 * Advanced Contact Search Service
 */
export class AdvancedContactSearchService {
  constructor(private prisma: any) {}

  /**
   * Advanced search with multiple filters and facets
   */
  async searchContacts(
    userId: string,
    filters: SearchFilters,
    includeFacets: boolean = true
  ): Promise<ContactSearchResult> {
    const {
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = filters;

    const pageNum = Math.max(1, page);
    const limitNum = Math.min(100, Math.max(1, limit));
    const skip = (pageNum - 1) * limitNum;

    // Build the where clause with tenant isolation
    const whereClause = this.buildWhereClause(userId, filters);

    // Execute queries in parallel for performance
    const [contacts, totalCount, facets] = await Promise.all([
      // Main search query
      this.prisma.contact.findMany({
        where: whereClause,
        skip,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
        include: {
          segments: {
            include: {
              segment: true,
            },
          },
        },
      }),
      
      // Total count for pagination
      this.prisma.contact.count({ where: whereClause }),
      
      // Facets for analytics (optional, can be expensive)
      includeFacets ? this.generateFacets(userId) : null,
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);

    return {
      contacts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      facets: facets || {
        totalCount: 0,
        bySource: {},
        byTags: {},
        byVerification: { verified: 0, unverified: 0 },
        byBlockStatus: { blocked: 0, unblocked: 0 },
        byAutoDetection: { autoDetected: 0, manual: 0 },
      },
    };
  }

  /**
   * Build complex where clause from filters
   */
  private buildWhereClause(userId: string, filters: SearchFilters): any {
    const where: any = { userId };

    // Text search across multiple fields
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Tag filtering (OR logic - matches any of the specified tags)
    if (filters.tags && filters.tags.length > 0) {
      where.tags = {
        hasSome: filters.tags,
      };
    }

    // Source filtering
    if (filters.source && filters.source.length > 0) {
      where.source = {
        in: filters.source,
      };
    }

    // Boolean filters
    if (filters.isVerified !== undefined) {
      where.isVerified = filters.isVerified;
    }

    if (filters.isBlocked !== undefined) {
      where.isBlocked = filters.isBlocked;
    }

    if (filters.autoDetected !== undefined) {
      where.autoDetected = filters.autoDetected;
    }

    // Date range filters
    if (filters.createdFrom || filters.createdTo) {
      where.createdAt = {};
      if (filters.createdFrom) where.createdAt.gte = filters.createdFrom;
      if (filters.createdTo) where.createdAt.lte = filters.createdTo;
    }

    if (filters.updatedFrom || filters.updatedTo) {
      where.updatedAt = {};
      if (filters.updatedFrom) where.updatedAt.gte = filters.updatedFrom;
      if (filters.updatedTo) where.updatedAt.lte = filters.updatedTo;
    }

    // Contact detail filters
    if (filters.hasName !== undefined) {
      if (filters.hasName) {
        where.name = { not: null };
      } else {
        where.name = null;
      }
    }

    if (filters.hasEmail !== undefined) {
      if (filters.hasEmail) {
        where.email = { not: null };
      } else {
        where.email = null;
      }
    }

    if (filters.phoneStartsWith) {
      where.phone = { startsWith: filters.phoneStartsWith };
    }

    if (filters.emailDomain) {
      where.email = {
        endsWith: `@${filters.emailDomain}`,
        mode: 'insensitive',
      };
    }

    // Custom field filtering (JSON query)
    if (filters.customFields) {
      for (const [key, value] of Object.entries(filters.customFields)) {
        where.customFields = {
          path: [key],
          equals: value,
        };
      }
    }

    return where;
  }

  /**
   * Generate search facets for analytics
   */
  private async generateFacets(userId: string): Promise<ContactSearchResult['facets']> {
    const [totalCount, bySource, byTags, verificationStats, blockStats, autoDetectionStats] = await Promise.all([
      // Total count
      this.prisma.contact.count({ where: { userId } }),

      // Source distribution
      this.prisma.contact.groupBy({
        by: ['source'],
        where: { userId },
        _count: { id: true },
      }),

      // Tag distribution (flatten tags array)
      this.prisma.contact.findMany({
        where: { userId },
        select: { tags: true },
      }),

      // Verification status
      this.prisma.contact.groupBy({
        by: ['isVerified'],
        where: { userId },
        _count: { id: true },
      }),

      // Block status
      this.prisma.contact.groupBy({
        by: ['isBlocked'],
        where: { userId },
        _count: { id: true },
      }),

      // Auto-detection status
      this.prisma.contact.groupBy({
        by: ['autoDetected'],
        where: { userId },
        _count: { id: true },
      }),
    ]);

    // Process bySource
    const bySourceMap: Record<string, number> = {};
    bySource.forEach((item: any) => {
      bySourceMap[item.source || 'unknown'] = item._count.id;
    });

    // Process byTags
    const tagCounts: Record<string, number> = {};
    byTags.forEach((contact: any) => {
      if (contact.tags && Array.isArray(contact.tags)) {
        contact.tags.forEach((tag: any) => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    // Process verification stats
    const verification = { verified: 0, unverified: 0 };
    verificationStats.forEach((item: any) => {
      if (item.isVerified) {
        verification.verified = item._count.id;
      } else {
        verification.unverified = item._count.id;
      }
    });

    // Process block stats
    const blockStatus = { blocked: 0, unblocked: 0 };
    blockStats.forEach((item: any) => {
      if (item.isBlocked) {
        blockStatus.blocked = item._count.id;
      } else {
        blockStatus.unblocked = item._count.id;
      }
    });

    // Process auto-detection stats
    const autoDetection = { autoDetected: 0, manual: 0 };
    autoDetectionStats.forEach((item: any) => {
      if (item.autoDetected) {
        autoDetection.autoDetected = item._count.id;
      } else {
        autoDetection.manual = item._count.id;
      }
    });

    return {
      totalCount,
      bySource: bySourceMap,
      byTags: tagCounts,
      byVerification: verification,
      byBlockStatus: blockStatus,
      byAutoDetection: autoDetection,
    };
  }

  /**
   * Bulk tag operations on contacts
   */
  async bulkTagOperations(
    userId: string,
    operation: TagOperations,
    contactIds?: string[]
  ): Promise<{ updated: number; errors: string[] }> {
    const result = { updated: 0, errors: [] as string[] };

    try {
      // Get contacts to update
      const whereClause = contactIds 
        ? { userId, id: { in: contactIds } }
        : { userId };

      const contacts = await this.prisma.contact.findMany({
        where: whereClause,
        select: { id: true, tags: true },
      });

      for (const contact of contacts) {
        try {
          let newTags = [...(contact.tags || [])];

          if (operation.replaceTags) {
            newTags = operation.replaceTags;
          } else {
            if (operation.addTags) {
              newTags = [...new Set([...newTags, ...operation.addTags])];
            }
            if (operation.removeTags) {
              newTags = newTags.filter(tag => !operation.removeTags!.includes(tag));
            }
          }

          await this.prisma.contact.update({
            where: { id: contact.id },
            data: { 
              tags: newTags,
              updatedAt: new Date(),
            },
          });

          result.updated++;
        } catch (error) {
          result.errors.push(`Failed to update contact ${contact.id}: ${error}`);
        }
      }

      return result;
    } catch (error) {
      throw new Error(`Bulk tag operation failed: ${error}`);
    }
  }

  /**
   * Bulk contact operations
   */
  async bulkContactOperations(
    userId: string,
    operation: BulkContactOperation
  ): Promise<{ 
    success: number; 
    failed: number; 
    errors: string[];
    data?: any;
  }> {
    const result = { success: 0, failed: 0, errors: [] as string[] };

    try {
      switch (operation.operation) {
        case 'add_tags':
        case 'remove_tags':
          return this.handleBulkTagOperation(userId, operation);
        
        case 'update_status':
          return this.handleBulkStatusUpdate(userId, operation);
        
        case 'merge_contacts':
          return this.handleBulkMerge(userId, operation);
        
        case 'export':
          return this.handleBulkExport(userId, operation);
        
        default:
          throw new Error(`Unsupported operation: ${operation.operation}`);
      }
    } catch (error) {
      result.errors.push(`Operation failed: ${error}`);
      return result;
    }
  }

  /**
   * Handle bulk tag operations
   */
  private async handleBulkTagOperation(
    userId: string,
    operation: BulkContactOperation
  ): Promise<any> {
    if (!operation.data?.tags) {
      throw new Error('Tags data is required for tag operations');
    }

    const tagOps: TagOperations = {
      addTags: operation.operation === 'add_tags' ? operation.data.tags : [],
      removeTags: operation.operation === 'remove_tags' ? operation.data.tags : [],
    };

    return this.bulkTagOperations(userId, tagOps, operation.contactIds);
  }

  /**
   * Handle bulk status updates
   */
  private async handleBulkStatusUpdate(
    userId: string,
    operation: BulkContactOperation
  ): Promise<any> {
    if (!operation.data) {
      throw new Error('Status data is required');
    }

    const result = { success: 0, failed: 0, errors: [] as string[] };

    for (const contactId of operation.contactIds) {
      try {
        const updateData: any = {};
        
        if (operation.data.isVerified !== undefined) {
          updateData.isVerified = operation.data.isVerified;
        }
        if (operation.data.isBlocked !== undefined) {
          updateData.isBlocked = operation.data.isBlocked;
        }
        if (operation.data.customFields) {
          updateData.customFields = operation.data.customFields;
        }

        await this.prisma.contact.update({
          where: { id: contactId },
          data: { ...updateData, updatedAt: new Date() },
        });

        result.success++;
      } catch (error) {
        result.failed++;
        result.errors.push(`Failed to update contact ${contactId}: ${error}`);
      }
    }

    return result;
  }

  /**
   * Handle bulk contact merge operations
   */
  private async handleBulkMerge(
    userId: string,
    operation: BulkContactOperation
  ): Promise<any> {
    if (operation.contactIds.length < 2) {
      throw new Error('At least 2 contacts required for merge operation');
    }

    if (!operation.data?.targetContactId) {
      throw new Error('Target contact ID is required for merge operation');
    }

    const targetContactId = operation.data.targetContactId;
    const sourceContactIds = operation.contactIds.filter(id => id !== targetContactId);

    const result = { success: 0, failed: 0, errors: [] as string[] };

    // Get target contact
    const targetContact = await this.prisma.contact.findFirst({
      where: { id: targetContactId, userId },
    });

    if (!targetContact) {
      throw new Error('Target contact not found');
    }

    for (const sourceId of sourceContactIds) {
      try {
        const sourceContact = await this.prisma.contact.findFirst({
          where: { id: sourceId, userId },
        });

        if (!sourceContact) {
          result.failed++;
          result.errors.push(`Source contact ${sourceId} not found`);
          continue;
        }

        // Merge contact data (target takes precedence, but merge missing data)
        const mergedData = {
          name: targetContact.name || sourceContact.name,
          email: targetContact.email || sourceContact.email,
          tags: [...new Set([...(targetContact.tags || []), ...(sourceContact.tags || [])])],
          customFields: { ...(sourceContact.customFields || {}), ...(targetContact.customFields || {}) },
          isVerified: targetContact.isVerified || sourceContact.isVerified,
          isBlocked: targetContact.isBlocked || sourceContact.isBlocked,
          updatedAt: new Date(),
        };

        // Update target contact
        await this.prisma.contact.update({
          where: { id: targetContactId },
          data: mergedData,
        });

        // Delete source contact
        await this.prisma.contact.delete({
          where: { id: sourceId },
        });

        result.success++;
      } catch (error) {
        result.failed++;
        result.errors.push(`Failed to merge contact ${sourceId}: ${error}`);
      }
    }

    return result;
  }

  /**
   * Handle bulk export operations
   */
  private async handleBulkExport(
    userId: string,
    operation: BulkContactOperation
  ): Promise<any> {
    const contacts = await this.prisma.contact.findMany({
      where: { 
        userId,
        id: { in: operation.contactIds },
      },
    });

    return {
      success: contacts.length,
      failed: 0,
      errors: [],
      data: contacts,
    };
  }

  /**
   * Get contact suggestions based on search patterns
   */
  async getContactSuggestions(userId: string, query: string, limit: number = 10): Promise<any[]> {
    const suggestions = await this.prisma.contact.findMany({
      where: {
        userId,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        tags: true,
      },
      take: limit,
    });

    return suggestions;
  }

  /**
   * Validate search filters
   */
  static validateSearchFilters(filters: SearchFilters): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate pagination
    if (filters.page && filters.page < 1) {
      errors.push('Page must be greater than 0');
    }
    if (filters.limit && (filters.limit < 1 || filters.limit > 100)) {
      errors.push('Limit must be between 1 and 100');
    }

    // Validate date ranges
    if (filters.createdFrom && filters.createdTo && filters.createdFrom > filters.createdTo) {
      errors.push('createdFrom must be before createdTo');
    }
    if (filters.updatedFrom && filters.updatedTo && filters.updatedFrom > filters.updatedTo) {
      errors.push('updatedFrom must be before updatedTo');
    }

    // Validate sort field
    const allowedSortFields = ['name', 'phone', 'email', 'createdAt', 'updatedAt', 'isVerified', 'isBlocked'];
    if (filters.sortBy && !allowedSortFields.includes(filters.sortBy)) {
      errors.push(`sortBy must be one of: ${allowedSortFields.join(', ')}`);
    }

    // Validate sort order
    if (filters.sortOrder && !['asc', 'desc'].includes(filters.sortOrder)) {
      errors.push('sortOrder must be either "asc" or "desc"');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Export schemas for validation
 */
export const searchFiltersSchema = z.object({
  search: z.string().optional(),
  tags: z.array(z.string()).optional(),
  source: z.array(z.string()).optional(),
  isVerified: z.boolean().optional(),
  isBlocked: z.boolean().optional(),
  autoDetected: z.boolean().optional(),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
  updatedFrom: z.string().datetime().optional(),
  updatedTo: z.string().datetime().optional(),
  customFields: z.record(z.any()).optional(),
  hasName: z.boolean().optional(),
  hasEmail: z.boolean().optional(),
  phoneStartsWith: z.string().optional(),
  emailDomain: z.string().optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  sortBy: z.enum(['name', 'phone', 'email', 'createdAt', 'updatedAt', 'isVerified', 'isBlocked']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});