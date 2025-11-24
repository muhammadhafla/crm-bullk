import { PrismaClient } from '@prisma/client';
import { Server } from 'socket.io';

/**
 * Real-time Contact Sync Service
 * Handles real-time notifications when contacts are added, updated, or synchronized
 */

interface ContactSyncConfig {
  prisma: PrismaClient;
  io: Server;
}

export class ContactSyncService {
  private prisma: PrismaClient;
  private io: Server;

  constructor(config: ContactSyncConfig) {
    this.prisma = config.prisma;
    this.io = config.io;
  }

  /**
   * Emit contact sync event to tenant room
   */
  private emitToTenant(tenantId: string, event: string, data: any): void {
    try {
      this.io.to(`tenant_${tenantId}`).emit(event, data);
      console.log(`📡 Contact Sync: Emitted ${event} to tenant ${tenantId}`);
    } catch (error) {
      console.error('Error emitting contact sync event:', error);
    }
  }

  /**
   * Emit contact detected event
   */
  emitContactDetected(tenantId: string, contact: any, source: 'whatsapp' | 'manual' | 'import'): void {
    this.emitToTenant(tenantId, 'contact_detected', {
      contact: {
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        source,
        detectedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit contact added event
   */
  emitContactAdded(tenantId: string, contact: any): void {
    this.emitToTenant(tenantId, 'contact_added', {
      contact: {
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        tags: contact.tags,
        segments: contact.segments,
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit contact updated event
   */
  emitContactUpdated(tenantId: string, contact: any, changes: string[]): void {
    this.emitToTenant(tenantId, 'contact_updated', {
      contact: {
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        tags: contact.tags,
        segments: contact.segments,
      },
      changes,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit contact deleted event
   */
  emitContactDeleted(tenantId: string, contactId: string, contactName: string): void {
    this.emitToTenant(tenantId, 'contact_deleted', {
      contactId,
      contactName,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit bulk import started event
   */
  emitBulkImportStarted(tenantId: string, importId: string, totalContacts: number): void {
    this.emitToTenant(tenantId, 'bulk_import_started', {
      importId,
      totalContacts,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit bulk import progress event
   */
  emitBulkImportProgress(tenantId: string, importId: string, processed: number, total: number, newContacts: number = 0): void {
    this.emitToTenant(tenantId, 'bulk_import_progress', {
      importId,
      processed,
      total,
      newContacts,
      progress: Math.round((processed / total) * 100),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit bulk import completed event
   */
  emitBulkImportCompleted(tenantId: string, importId: string, total: number, newContacts: number, updatedContacts: number): void {
    this.emitToTenant(tenantId, 'bulk_import_completed', {
      importId,
      total,
      newContacts,
      updatedContacts,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit bulk import failed event
   */
  emitBulkImportFailed(tenantId: string, importId: string, error: string): void {
    this.emitToTenant(tenantId, 'bulk_import_failed', {
      importId,
      error,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit segment membership changed event
   */
  emitSegmentMembershipChanged(tenantId: string, contactId: string, segmentId: string, segmentName: string, action: 'added' | 'removed'): void {
    this.emitToTenant(tenantId, 'segment_membership_changed', {
      contactId,
      segmentId,
      segmentName,
      action,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit duplicate contacts detected event
   */
  emitDuplicatesDetected(tenantId: string, duplicates: Array<{contactId: string, duplicateOf: string, confidence: number}>): void {
    this.emitToTenant(tenantId, 'duplicates_detected', {
      duplicates,
      count: duplicates.length,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle WhatsApp contact discovery
   */
  async handleWhatsAppContactDiscovery(tenantId: string, discoveredContacts: any[]): Promise<void> {
    try {
      console.log(`🔍 Processing ${discoveredContacts.length} discovered contacts for tenant ${tenantId}`);

      // Emit discovery started
      this.emitToTenant(tenantId, 'contact_discovery_started', {
        totalContacts: discoveredContacts.length,
        timestamp: new Date().toISOString(),
      });

      let processed = 0;
      let newContacts = 0;
      let updatedContacts = 0;
      const duplicates: Array<{contactId: string, duplicateOf: string, confidence: number}> = [];

      for (const discoveredContact of discoveredContacts) {
        processed++;

        try {
          // Normalize phone number
          const normalizedPhone = this.normalizePhoneNumber(discoveredContact.phone);
          
          // Check for existing contact
          const existingContact = await this.prisma.contact.findFirst({
            where: {
              userId: tenantId,
              OR: [
                { phone: normalizedPhone },
                { phone: discoveredContact.phone },
              ],
            },
          });

          if (existingContact) {
            // Check if update is needed
            const hasChanges = this.hasContactChanges(existingContact, discoveredContact);
            
            if (hasChanges) {
              // Update existing contact
              await this.prisma.contact.update({
                where: { id: existingContact.id },
                data: {
                  name: discoveredContact.name || existingContact.name,
                  email: discoveredContact.email || existingContact.email,
                  lastSeen: new Date(),
                  source: 'whatsapp',
                },
              });
              updatedContacts++;
              
              // Emit update event
              this.emitContactUpdated(tenantId, existingContact, ['name', 'email', 'lastSeen']);
            }

            // Check for potential duplicates
            const duplicateConfidence = this.calculateDuplicateConfidence(existingContact, discoveredContact);
            if (duplicateConfidence > 0.8) {
              duplicates.push({
                contactId: existingContact.id,
                duplicateOf: discoveredContact.phone,
                confidence: duplicateConfidence,
              });
            }
          } else {
            // Create new contact
            const newContact = await this.prisma.contact.create({
              data: {
                userId: tenantId,
                name: discoveredContact.name || 'Unknown',
                phone: normalizedPhone,
                email: discoveredContact.email,
                source: 'whatsapp',
                tags: [],
              },
            });
            newContacts++;
            
            // Emit new contact event
            this.emitContactDetected(tenantId, newContact, 'whatsapp');
          }

          // Emit progress for every 10 contacts
          if (processed % 10 === 0) {
            this.emitBulkImportProgress(tenantId, 'whatsapp_discovery', processed, discoveredContacts.length, newContacts);
          }

        } catch (contactError) {
          console.error(`Error processing contact ${discoveredContact.phone}:`, contactError);
        }
      }

      // Emit discovery completed
      this.emitToTenant(tenantId, 'contact_discovery_completed', {
        totalProcessed: processed,
        newContacts,
        updatedContacts,
        duplicates: duplicates.length,
        timestamp: new Date().toISOString(),
      });

      // Emit duplicates if found
      if (duplicates.length > 0) {
        this.emitDuplicatesDetected(tenantId, duplicates);
      }

    } catch (error) {
      console.error('Error in WhatsApp contact discovery:', error);
      this.emitToTenant(tenantId, 'contact_discovery_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Normalize phone number for consistent storage
   */
  private normalizePhoneNumber(phone: string): string {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Handle Indonesian numbers
    if (cleaned.startsWith('62')) {
      return '+' + cleaned;
    } else if (cleaned.startsWith('0')) {
      return '+62' + cleaned.substring(1);
    } else if (cleaned.length === 10 || cleaned.length === 11) {
      return '+62' + cleaned;
    }
    
    return '+' + cleaned;
  }

  /**
   * Check if contact has meaningful changes
   */
  private hasContactChanges(existing: any, incoming: any): boolean {
    const nameChanged = incoming.name && existing.name !== incoming.name;
    const emailChanged = incoming.email && existing.email !== incoming.email;
    
    return nameChanged || emailChanged;
  }

  /**
   * Calculate duplicate confidence score
   */
  private calculateDuplicateConfidence(existing: any, incoming: any): number {
    let score = 0;
    
    // Phone number similarity (exact match = 1.0)
    if (existing.phone === incoming.phone) {
      score += 1.0;
    }
    
    // Name similarity (simple check)
    if (existing.name && incoming.name) {
      if (existing.name.toLowerCase() === incoming.name.toLowerCase()) {
        score += 0.5;
      } else if (existing.name.toLowerCase().includes(incoming.name.toLowerCase()) || 
                 incoming.name.toLowerCase().includes(existing.name.toLowerCase())) {
        score += 0.3;
      }
    }
    
    // Email similarity
    if (existing.email && incoming.email) {
      if (existing.email.toLowerCase() === incoming.email.toLowerCase()) {
        score += 0.3;
      }
    }
    
    return Math.min(score, 1.0);
  }
}