import { createEvolutionAPIService } from './evolutionApi';
import { generateRandomId } from '../utils/encryption';

export interface ContactDetectionOptions {
  autoCreateUnknown: boolean;
  autoUpdateExisting: boolean;
  dedupThreshold: number; // similarity threshold for deduplication
  syncIntervalMinutes: number;
}

export interface DetectedContact {
  name?: string;
  phone: string;
  email?: string;
  isWhatsAppUser: boolean;
  lastSeen?: Date;
  profile?: {
    status?: string;
    picture?: string;
  };
}

export interface ContactMatch {
  existingContact?: any;
  similarity: number;
  matchType: 'EXACT' | 'SIMILAR' | 'FUZZY' | 'PHONE_NORMALIZED';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * Contact Detection Service for WhatsApp Auto-Discovery
 */
export class ContactDetectionService {
  constructor(
    private prisma: any,
    private evolutionService: any,
    private options: ContactDetectionOptions
  ) {}

  /**
   * Auto-detect new contacts from WhatsApp chats
   */
  async detectNewContacts(userId: string): Promise<{
    detected: DetectedContact[];
    created: number;
    updated: number;
    skipped: number;
  }> {
    const detected: DetectedContact[] = [];
    const results = {
      detected: 0,
      created: 0,
      updated: 0,
      skipped: 0,
    };

    try {
      // Get chat history to detect contacts
      const chats = await this.evolutionService.getChatHistory('', 1, 100);
      
      if (chats?.messages) {
        const phoneNumbers = new Set<string>();
        
        // Extract unique phone numbers from chat messages
        for (const message of chats.messages) {
          if (message.key?.remoteJid) {
            const phone = this.extractPhoneFromJid(message.key.remoteJid);
            if (phone) {
              phoneNumbers.add(phone);
            }
          }
        }

        // Process each detected phone number
        for (const phone of phoneNumbers) {
          try {
            const detectedContact = await this.detectContactDetails(phone);
            if (detectedContact) {
              detected.push(detectedContact);
              
              // Handle contact creation/update
              const match = await this.findContactMatch(userId, detectedContact);
              
              if (match.existingContact) {
                if (this.options.autoUpdateExisting && match.confidence === 'HIGH') {
                  await this.updateExistingContact(match.existingContact.id, detectedContact);
                  results.updated++;
                } else {
                  results.skipped++;
                }
              } else {
                if (this.options.autoCreateUnknown) {
                  await this.createNewContact(userId, detectedContact);
                  results.created++;
                } else {
                  // Store for manual review
                  await this.storeForReview(userId, detectedContact);
                  results.detected++;
                }
              }
            }
          } catch (error) {
            console.error(`Error processing contact ${phone}:`, error);
          }
        }
      }

      return {
        detected: detected,
        created: results.created,
        updated: results.updated,
        skipped: results.skipped,
      };
    } catch (error) {
      console.error('Error in detectNewContacts:', error);
      throw error;
    }
  }

  /**
   * Detect contact details from phone number
   */
  private async detectContactDetails(phone: string): Promise<DetectedContact | null> {
    try {
      const normalizedPhone = this.normalizePhone(phone);
      
      // Get contact info from WhatsApp
      const contactInfo = await this.evolutionService.getChatHistory(normalizedPhone, 1, 1);
      
      const detected: DetectedContact = {
        phone: normalizedPhone,
        isWhatsAppUser: true,
      };

      // Extract name from chat history if available
      if (contactInfo?.messages?.[0]?.pushName) {
        detected.name = contactInfo.messages[0].pushName;
      }

      return detected;
    } catch (error) {
      console.error(`Error detecting contact details for ${phone}:`, error);
      return null;
    }
  }

  /**
   * Find existing contact match with deduplication
   */
  private async findContactMatch(userId: string, detected: DetectedContact): Promise<ContactMatch> {
    const tenantId = userId;

    // 1. Exact phone match (highest priority)
    const exactMatch = await this.prisma.contact.findFirst({
      where: {
        userId: tenantId,
        phone: detected.phone,
      },
    });

    if (exactMatch) {
      return {
        existingContact: exactMatch,
        similarity: 1.0,
        matchType: 'EXACT',
        confidence: 'HIGH',
      };
    }

    // 2. Normalized phone match
    const normalizedPhone = this.normalizePhone(detected.phone);
    const normalizedMatch = await this.prisma.contact.findFirst({
      where: {
        userId: tenantId,
        phone: { contains: normalizedPhone.replace(/\D/g, '') },
      },
    });

    if (normalizedMatch) {
      return {
        existingContact: normalizedMatch,
        similarity: 0.95,
        matchType: 'PHONE_NORMALIZED',
        confidence: 'HIGH',
      };
    }

    // 3. Name similarity match (if name available)
    if (detected.name) {
      const nameSimilarContacts = await this.prisma.contact.findMany({
        where: {
          userId: tenantId,
          name: {
            contains: detected.name,
            mode: 'insensitive',
          },
        },
        take: 5,
      });

      if (nameSimilarContacts.length > 0) {
        const bestMatch = nameSimilarContacts[0];
        const similarity = this.calculateNameSimilarity(detected.name, bestMatch.name || '');
        
        if (similarity > this.options.dedupThreshold) {
          return {
            existingContact: bestMatch,
            similarity,
            matchType: 'SIMILAR',
            confidence: similarity > 0.8 ? 'HIGH' : 'MEDIUM',
          };
        }
      }
    }

    return { similarity: 0, matchType: 'FUZZY', confidence: 'LOW' };
  }

  /**
   * Calculate name similarity using Levenshtein distance
   */
  private calculateNameSimilarity(name1: string, name2: string): number {
    const len1 = name1.length;
    const len2 = name2.length;
    
    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;

    const matrix: number[][] = [];
    
    // Initialize matrix
    for (let i = 0; i <= len2; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= len1; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= len2; i++) {
      for (let j = 1; j <= len1; j++) {
        if (name2.charAt(i - 1) === name1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    const distance = matrix[len2][len1];
    return 1 - distance / Math.max(len1, len2);
  }

  /**
   * Update existing contact with new information
   */
  private async updateExistingContact(contactId: string, detected: DetectedContact): Promise<void> {
    await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        name: detected.name || undefined,
        isVerified: true,
        autoDetected: true,
        detectedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Create new contact from detected contact
   */
  private async createNewContact(userId: string, detected: DetectedContact): Promise<void> {
    const tenantId = userId;
    const externalId = generateRandomId();

    await this.prisma.contact.create({
      data: {
        name: detected.name,
        phone: detected.phone,
        email: detected.email,
        userId: tenantId,
        externalId,
        source: 'WHATSAPP_AUTO',
        autoDetected: true,
        detectedAt: new Date(),
        isVerified: true,
      },
    });
  }

  /**
   * Store detected contact for manual review
   */
  private async storeForReview(userId: string, detected: DetectedContact): Promise<void> {
    // This could store to a separate table for manual review
    // For now, we'll use a simple approach with custom fields
    const tenantId = userId;
    const externalId = generateRandomId();

    await this.prisma.contact.create({
      data: {
        name: detected.name,
        phone: detected.phone,
        email: detected.email,
        userId: tenantId,
        externalId,
        source: 'WHATSAPP_DETECTED',
        autoDetected: true,
        detectedAt: new Date(),
        isVerified: false,
      },
    });
  }

  /**
   * Normalize phone number
   */
  private normalizePhone(phone: string): string {
    let normalized = phone.replace(/[^\d+]/g, '');
    
    if (!normalized.startsWith('+')) {
      if (normalized.startsWith('0')) {
        normalized = '+62' + normalized.substring(1);
      } else if (normalized.length === 8) {
        normalized = '+628' + normalized;
      } else {
        normalized = '+' + normalized;
      }
    }
    
    return normalized;
  }

  /**
   * Extract phone number from WhatsApp JID
   */
  private extractPhoneFromJid(jid: string): string | null {
    // WhatsApp JID format: phone@s.whatsapp.net
    const match = jid.match(/^(\d+)@s\.whatsapp\.net$/);
    if (match) {
      return match[1];
    }
    return null;
  }

  /**
   * Batch detect contacts from multiple sources
   */
  async batchDetectContacts(userId: string, sources: string[] = ['whatsapp']): Promise<{
    whatsapp: { detected: number; created: number; updated: number };
    total: number;
  }> {
    const results: {
      whatsapp: { detected: number; created: number; updated: number };
      total: number;
    } = {
      whatsapp: { detected: 0, created: 0, updated: 0 },
      total: 0,
    };

    for (const source of sources) {
      try {
        switch (source.toLowerCase()) {
          case 'whatsapp':
            const waResult = await this.detectNewContacts(userId);
            results.whatsapp = {
              detected: waResult.detected.length,
              created: waResult.created,
              updated: waResult.updated,
            };
            break;
          // Future implementations for other sources
          case 'telegram':
            // TODO: Implement Telegram detection
            break;
          case 'tiktok':
            // TODO: Implement TikTok detection
            break;
        }
      } catch (error) {
        console.error(`Error detecting contacts from ${source}:`, error);
      }
    }

    results.total = results.whatsapp.detected;

    return results;
  }

  /**
   * Get contact suggestions for merging
   */
  async getMergeSuggestions(userId: string): Promise<any[]> {
    const tenantId = userId;
    
    const contacts = await this.prisma.contact.findMany({
      where: { userId: tenantId },
      orderBy: { createdAt: 'desc' },
    });

    const suggestions: any[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < contacts.length; i++) {
      const contact1 = contacts[i];
      if (processed.has(contact1.id)) continue;

      const duplicates: any[] = [];

      for (let j = i + 1; j < contacts.length; j++) {
        const contact2 = contacts[j];
        if (processed.has(contact2.id)) continue;

        const similarity = this.calculateSimilarity(contact1, contact2);
        
        if (similarity > this.options.dedupThreshold) {
          duplicates.push({
            contact: contact2,
            similarity,
            reasons: this.getSimilarityReasons(contact1, contact2),
          });
          processed.add(contact2.id);
        }
      }

      if (duplicates.length > 0) {
        suggestions.push({
          primary: contact1,
          duplicates: duplicates.sort((a, b) => b.similarity - a.similarity),
        });
      }

      processed.add(contact1.id);
    }

    return suggestions;
  }

  /**
   * Calculate similarity between two contacts
   */
  private calculateSimilarity(contact1: any, contact2: any): number {
    let score = 0;
    let factors = 0;

    // Phone number similarity
    if (contact1.phone && contact2.phone) {
      const phone1 = contact1.phone.replace(/\D/g, '');
      const phone2 = contact2.phone.replace(/\D/g, '');
      
      if (phone1 === phone2) {
        score += 1.0;
      } else if (this.arePhoneNumbersRelated(phone1, phone2)) {
        score += 0.8;
      }
      factors++;
    }

    // Name similarity
    if (contact1.name && contact2.name) {
      score += this.calculateNameSimilarity(contact1.name, contact2.name);
      factors++;
    }

    // Email similarity
    if (contact1.email && contact2.email) {
      if (contact1.email.toLowerCase() === contact2.email.toLowerCase()) {
        score += 1.0;
      }
      factors++;
    }

    return factors > 0 ? score / factors : 0;
  }

  /**
   * Check if phone numbers are related (e.g., same person with different formats)
   */
  private arePhoneNumbersRelated(phone1: string, phone2: string): boolean {
    // Remove country codes and compare
    const clean1 = phone1.replace(/^[91]?62/, '');
    const clean2 = phone2.replace(/^[91]?62/, '');
    
    // Check if one is a substring of the other (allowing for formatting)
    return clean1.includes(clean2) || clean2.includes(clean1);
  }

  /**
   * Get reasons for similarity
   */
  private getSimilarityReasons(contact1: any, contact2: any): string[] {
    const reasons: string[] = [];

    if (contact1.phone && contact2.phone) {
      const phone1 = contact1.phone.replace(/\D/g, '');
      const phone2 = contact2.phone.replace(/\D/g, '');
      
      if (phone1 === phone2) {
        reasons.push('Same phone number');
      } else if (this.arePhoneNumbersRelated(phone1, phone2)) {
        reasons.push('Related phone numbers');
      }
    }

    if (contact1.name && contact2.name) {
      const similarity = this.calculateNameSimilarity(contact1.name, contact2.name);
      if (similarity > 0.8) {
        reasons.push('Similar names');
      }
    }

    if (contact1.email && contact2.email) {
      if (contact1.email.toLowerCase() === contact2.email.toLowerCase()) {
        reasons.push('Same email address');
      }
    }

    return reasons;
  }
}

/**
 * Factory function to create ContactDetectionService
 */
export async function createContactDetectionService(
  prisma: any,
  userId: string,
  options?: Partial<ContactDetectionOptions>
): Promise<ContactDetectionService> {
  const evolutionService = await createEvolutionAPIService(prisma, userId);
  
  const defaultOptions: ContactDetectionOptions = {
    autoCreateUnknown: false,
    autoUpdateExisting: true,
    dedupThreshold: 0.7,
    syncIntervalMinutes: 30,
    ...options,
  };

  return new ContactDetectionService(prisma, evolutionService, defaultOptions);
}