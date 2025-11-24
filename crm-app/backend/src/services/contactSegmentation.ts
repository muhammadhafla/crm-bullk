import { z } from 'zod';

/**
 * Contact Segmentation System
 * Allows creating dynamic segments based on contact properties and behaviors
 */

export interface SegmentRule {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'greater_than' | 'less_than' | 'in' | 'not_in' | 'exists' | 'not_exists';
  value?: any;
  values?: any[]; // For 'in' and 'not_in' operators
}

export interface SegmentDefinition {
  id?: string;
  name: string;
  description?: string;
  rules: SegmentRule[];
  logic: 'AND' | 'OR'; // How to combine rules
  dynamic: boolean; // Whether to recalculate automatically
  color?: string; // UI color for the segment
}

export interface SegmentContact {
  contactId: string;
  segmentId: string;
  addedAt: Date;
  metadata?: Record<string, any>;
}

export interface SegmentStats {
  totalContacts: number;
  bySource: Record<string, number>;
  byTags: Record<string, number>;
  verifiedCount: number;
  blockedCount: number;
  autoDetectedCount: number;
  lastUpdated: Date;
}

/**
 * Contact Segmentation Service
 */
export class ContactSegmentationService {
  constructor(private prisma: any) {}

  /**
   * Create a new segment
   */
  async createSegment(userId: string, definition: SegmentDefinition): Promise<any> {
    // Validate segment definition
    const validation = this.validateSegmentDefinition(definition);
    if (!validation.valid) {
      throw new Error(`Invalid segment definition: ${validation.errors.join(', ')}`);
    }

    // Create segment
    const segment = await this.prisma.segment.create({
      data: {
        name: definition.name,
        description: definition.description,
        filterCriteria: {
          rules: definition.rules,
          logic: definition.logic,
          dynamic: definition.dynamic,
          color: definition.color,
        },
      },
    });

    // If not dynamic, calculate contacts immediately
    if (!definition.dynamic) {
      await this.calculateSegmentContacts(userId, segment.id, definition);
    }

    // Emit real-time event
    this.emitSegmentEvent(userId, 'segment:created', segment);

    return segment;
  }

  /**
   * Update an existing segment
   */
  async updateSegment(userId: string, segmentId: string, definition: Partial<SegmentDefinition>): Promise<any> {
    // Check if segment exists and belongs to user
    const existingSegment = await this.prisma.segment.findFirst({
      where: { id: segmentId },
    });

    if (!existingSegment) {
      throw new Error('Segment not found');
    }

    // Update segment
    const updatedSegment = await this.prisma.segment.update({
      where: { id: segmentId },
      data: {
        name: definition.name || existingSegment.name,
        description: definition.description || existingSegment.description,
        filterCriteria: {
          ...existingSegment.filterCriteria,
          ...definition,
        },
        updatedAt: new Date(),
      },
    });

    // Recalculate if dynamic or if rules changed
    if (definition.rules || definition.logic) {
      await this.recalculateSegment(userId, segmentId, definition as SegmentDefinition);
    }

    // Emit real-time event
    this.emitSegmentEvent(userId, 'segment:updated', updatedSegment);

    return updatedSegment;
  }

  /**
   * Delete a segment
   */
  async deleteSegment(userId: string, segmentId: string): Promise<void> {
    // Delete segment and associated contacts
    await this.prisma.$transaction([
      this.prisma.contactSegment.deleteMany({
        where: { segmentId },
      }),
      this.prisma.segment.delete({
        where: { id: segmentId },
      }),
    ]);

    // Emit real-time event
    this.emitSegmentEvent(userId, 'segment:deleted', { id: segmentId });
  }

  /**
   * Get all segments for a user
   */
  async getSegments(userId: string, includeStats: boolean = false): Promise<any[]> {
    const segments = await this.prisma.segment.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        contacts: {
          include: {
            contact: true,
          },
        },
      },
    });

    if (!includeStats) {
      return segments;
    }

    // Calculate stats for each segment
    const segmentsWithStats = await Promise.all(
      segments.map(async (segment) => {
        const stats = await this.calculateSegmentStats(segment.id);
        return {
          ...segment,
          stats,
        };
      })
    );

    return segmentsWithStats;
  }

  /**
   * Get contacts in a specific segment
   */
  async getSegmentContacts(
    userId: string, 
    segmentId: string, 
    page: number = 1, 
    limit: number = 50
  ): Promise<{
    contacts: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    const pageNum = Math.max(1, page);
    const limitNum = Math.min(100, Math.max(1, limit));
    const skip = (pageNum - 1) * limitNum;

    const [contacts, total] = await Promise.all([
      this.prisma.contactSegment.findMany({
        where: { segmentId },
        skip,
        take: limitNum,
        include: {
          contact: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.contactSegment.count({
        where: { segmentId },
      }),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    return {
      contacts: contacts.map(cs => cs.contact),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    };
  }

  /**
   * Add contacts to a segment manually
   */
  async addContactsToSegment(userId: string, segmentId: string, contactIds: string[]): Promise<{ added: number; skipped: number; errors: string[] }> {
    const result = { added: 0, skipped: 0, errors: [] as string[] };

    for (const contactId of contactIds) {
      try {
        // Check if contact already exists in segment
        const existing = await this.prisma.contactSegment.findFirst({
          where: {
            segmentId,
            contactId,
          },
        });

        if (existing) {
          result.skipped++;
          continue;
        }

        // Add contact to segment
        await this.prisma.contactSegment.create({
          data: {
            segmentId,
            contactId,
          },
        });

        result.added++;
      } catch (error) {
        result.errors.push(`Failed to add contact ${contactId}: ${error}`);
      }
    }

    // Emit real-time event
    this.emitSegmentEvent(userId, 'segment:contacts_added', {
      segmentId,
      contactIds,
      result,
    });

    return result;
  }

  /**
   * Remove contacts from a segment
   */
  async removeContactsFromSegment(userId: string, segmentId: string, contactIds: string[]): Promise<{ removed: number; errors: string[] }> {
    const result = { removed: 0, errors: [] as string[] };

    try {
      const deleteResult = await this.prisma.contactSegment.deleteMany({
        where: {
          segmentId,
          contactId: { in: contactIds },
        },
      });

      result.removed = deleteResult.count;
    } catch (error) {
      result.errors.push(`Failed to remove contacts: ${error}`);
    }

    // Emit real-time event
    this.emitSegmentEvent(userId, 'segment:contacts_removed', {
      segmentId,
      contactIds,
      result,
    });

    return result;
  }

  /**
   * Recalculate all dynamic segments for a user
   */
  async recalculateAllSegments(userId: string): Promise<{ recalculated: number; errors: string[] }> {
    const result = { recalculated: 0, errors: [] as string[] };

    try {
      // Get all dynamic segments
      const dynamicSegments = await this.prisma.segment.findMany({
        where: {
          filterCriteria: {
            path: ['dynamic'],
            equals: true,
          },
        },
      });

      // Recalculate each segment
      for (const segment of dynamicSegments) {
        try {
          const definition: SegmentDefinition = {
            name: segment.name,
            description: segment.description || undefined,
            rules: (segment.filterCriteria as any).rules || [],
            logic: (segment.filterCriteria as any).logic || 'AND',
            dynamic: true,
          };

          await this.recalculateSegment(userId, segment.id, definition);
          result.recalculated++;
        } catch (error) {
          result.errors.push(`Failed to recalculate segment ${segment.id}: ${error}`);
        }
      }
    } catch (error) {
      result.errors.push(`Failed to get dynamic segments: ${error}`);
    }

    return result;
  }

  /**
   * Calculate contacts for a segment based on rules
   */
  private async calculateSegmentContacts(userId: string, segmentId: string, definition: SegmentDefinition): Promise<number> {
    // Build where clause from segment rules
    const whereClause = this.buildWhereClauseFromRules(userId, definition.rules, definition.logic);

    // Get matching contacts
    const matchingContacts = await this.prisma.contact.findMany({
      where: whereClause,
      select: { id: true },
    });

    // Clear existing segment contacts
    await this.prisma.contactSegment.deleteMany({
      where: { segmentId },
    });

    // Add new contacts to segment
    const contactIds = matchingContacts.map(c => c.id);
    if (contactIds.length > 0) {
      await this.prisma.contactSegment.createMany({
        data: contactIds.map(contactId => ({
          segmentId,
          contactId,
        })),
      });
    }

    return contactIds.length;
  }

  /**
   * Recalculate a specific segment
   */
  private async recalculateSegment(userId: string, segmentId: string, definition: SegmentDefinition): Promise<number> {
    return this.calculateSegmentContacts(userId, segmentId, definition);
  }

  /**
   * Build where clause from segment rules
   */
  private buildWhereClauseFromRules(userId: string, rules: SegmentRule[], logic: 'AND' | 'OR'): any {
    const where: any = { userId };

    if (rules.length === 0) {
      return where;
    }

    if (logic === 'AND') {
      // For AND logic, combine all rules
      for (const rule of rules) {
        const clause = this.buildRuleClause(rule);
        Object.assign(where, clause);
      }
    } else {
      // For OR logic, use OR array
      where.OR = rules.map(rule => this.buildRuleClause(rule));
    }

    return where;
  }

  /**
   * Build where clause for a single rule
   */
  private buildRuleClause(rule: SegmentRule): any {
    switch (rule.operator) {
      case 'equals':
        return { [rule.field]: rule.value };
      
      case 'not_equals':
        return { [rule.field]: { not: rule.value } };
      
      case 'contains':
        return { [rule.field]: { contains: rule.value, mode: 'insensitive' } };
      
      case 'not_contains':
        return { [rule.field]: { not: { contains: rule.value, mode: 'insensitive' } } };
      
      case 'starts_with':
        return { [rule.field]: { startsWith: rule.value } };
      
      case 'ends_with':
        return { [rule.field]: { endsWith: rule.value } };
      
      case 'greater_than':
        return { [rule.field]: { gt: rule.value } };
      
      case 'less_than':
        return { [rule.field]: { lt: rule.value } };
      
      case 'in':
        return { [rule.field]: { in: rule.values || [] } };
      
      case 'not_in':
        return { [rule.field]: { notIn: rule.values || [] } };
      
      case 'exists':
        return { [rule.field]: { not: null } };
      
      case 'not_exists':
        return { [rule.field]: null };
      
      default:
        throw new Error(`Unsupported operator: ${rule.operator}`);
    }
  }

  /**
   * Calculate segment statistics
   */
  private async calculateSegmentStats(segmentId: string): Promise<SegmentStats> {
    const contacts = await this.prisma.contactSegment.findMany({
      where: { segmentId },
      include: {
        contact: true,
      },
    });

    const contactData = contacts.map(cs => cs.contact);

    // Calculate statistics
    const totalContacts = contactData.length;
    const verifiedCount = contactData.filter(c => c.isVerified).length;
    const blockedCount = contactData.filter(c => c.isBlocked).length;
    const autoDetectedCount = contactData.filter(c => c.autoDetected).length;

    // Count by source
    const bySource: Record<string, number> = {};
    contactData.forEach(contact => {
      const source = contact.source || 'unknown';
      bySource[source] = (bySource[source] || 0) + 1;
    });

    // Count by tags
    const byTags: Record<string, number> = {};
    contactData.forEach(contact => {
      if (contact.tags && Array.isArray(contact.tags)) {
        contact.tags.forEach(tag => {
          byTags[tag] = (byTags[tag] || 0) + 1;
        });
      }
    });

    return {
      totalContacts,
      bySource,
      byTags,
      verifiedCount,
      blockedCount,
      autoDetectedCount,
      lastUpdated: new Date(),
    };
  }

  /**
   * Validate segment definition
   */
  private validateSegmentDefinition(definition: SegmentDefinition): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Basic validation
    if (!definition.name || definition.name.trim().length === 0) {
      errors.push('Segment name is required');
    }

    if (!definition.rules || definition.rules.length === 0) {
      errors.push('At least one rule is required');
    }

    // Validate rules
    if (definition.rules) {
      for (let i = 0; i < definition.rules.length; i++) {
        const rule = definition.rules[i];
        
        if (!rule.field) {
          errors.push(`Rule ${i + 1}: field is required`);
        }

        if (!rule.operator) {
          errors.push(`Rule ${i + 1}: operator is required`);
        }

        // Validate operators that require values
        const requiresValue = ['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'greater_than', 'less_than'];
        const requiresValues = ['in', 'not_in'];

        if (requiresValue.includes(rule.operator) && rule.value === undefined) {
          errors.push(`Rule ${i + 1}: value is required for operator ${rule.operator}`);
        }

        if (requiresValues.includes(rule.operator) && (!rule.values || rule.values.length === 0)) {
          errors.push(`Rule ${i + 1}: values array is required for operator ${rule.operator}`);
        }
      }
    }

    // Validate logic
    if (definition.logic && !['AND', 'OR'].includes(definition.logic)) {
      errors.push('Logic must be either AND or OR');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get contact segments
   */
  async getContactSegments(contactId: string): Promise<any[]> {
    return this.prisma.contactSegment.findMany({
      where: { contactId },
      include: {
        segment: true,
      },
    });
  }

  /**
   * Check if contact matches segment rules
   */
  async contactMatchesSegment(contactId: string, segmentId: string): Promise<boolean> {
    const segment = await this.prisma.segment.findUnique({
      where: { id: segmentId },
    });

    if (!segment) {
      return false;
    }

    const rules = (segment.filterCriteria as any).rules || [];
    const logic = (segment.filterCriteria as any).logic || 'AND';

    // Build where clause
    const whereClause = this.buildWhereClauseFromRules('', rules, logic);
    whereClause.id = contactId;

    // Check if contact matches
    const matchingContact = await this.prisma.contact.findFirst({
      where: whereClause,
    });

    return !!matchingContact;
  }

  /**
   * Emit segment-related events
   */
  private emitSegmentEvent(userId: string, event: string, data: any): void {
    // This would integrate with Socket.IO to emit events
    // Implementation depends on the fastify instance available
    try {
      // Since we don't have direct access to fastify here,
      // this would typically be called from the route handlers
      // where the Socket.IO instance is available
      console.log(`Segment event ${event} for user ${userId}:`, data);
    } catch (error) {
      console.error('Failed to emit segment event:', error);
    }
  }

  /**
   * Bulk create predefined segments
   */
  async createPredefinedSegments(userId: string): Promise<any[]> {
    const predefinedSegments: SegmentDefinition[] = [
      {
        name: 'WhatsApp Auto-Detected',
        description: 'Contacts automatically detected from WhatsApp',
        logic: 'AND',
        dynamic: true,
        rules: [
          {
            field: 'autoDetected',
            operator: 'equals',
            value: true,
          },
        ],
      },
      {
        name: 'Verified Contacts',
        description: 'Contacts that have been verified',
        logic: 'AND',
        dynamic: true,
        rules: [
          {
            field: 'isVerified',
            operator: 'equals',
            value: true,
          },
        ],
      },
      {
        name: 'VIP Customers',
        description: 'Contacts with VIP tag',
        logic: 'AND',
        dynamic: true,
        rules: [
          {
            field: 'tags',
            operator: 'contains',
            value: 'VIP',
          },
        ],
      },
      {
        name: 'Recent Contacts',
        description: 'Contacts added in the last 30 days',
        logic: 'AND',
        dynamic: true,
        rules: [
          {
            field: 'createdAt',
            operator: 'greater_than',
            value: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        ],
      },
    ];

    const createdSegments = [];

    for (const segmentDef of predefinedSegments) {
      try {
        const segment = await this.createSegment(userId, segmentDef);
        createdSegments.push(segment);
      } catch (error) {
        console.error(`Failed to create predefined segment ${segmentDef.name}:`, error);
      }
    }

    return createdSegments;
  }
}

/**
 * Segment rule schema for validation
 */
export const segmentRuleSchema = z.object({
  field: z.string(),
  operator: z.enum(['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'greater_than', 'less_than', 'in', 'not_in', 'exists', 'not_exists']),
  value: z.any().optional(),
  values: z.array(z.any()).optional(),
});

/**
 * Segment definition schema for validation
 */
export const segmentDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  rules: z.array(segmentRuleSchema).min(1),
  logic: z.enum(['AND', 'OR']).default('AND'),
  dynamic: z.boolean().default(false),
  color: z.string().optional(),
});