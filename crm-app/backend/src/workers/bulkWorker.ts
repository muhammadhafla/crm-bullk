import { Worker, Queue, QueueEvents, JobsOptions } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { decryptEvolutionApiKey } from '../utils/encryption';
import { TenantJobLimiter } from '../utils/rateLimiter';
import { Server } from 'socket.io';

/**
 * Tenant-aware Bulk Message Worker
 * Processes bulk messaging jobs with proper tenant isolation and security
 */

interface WorkerConfig {
  redis: Redis;
  prisma: PrismaClient;
  concurrency: number;
  maxRetries: number;
  tenantJobLimiter: TenantJobLimiter;
  io?: Server;
}

interface MessageJobData {
  tenantId: string;
  userId: string;
  campaignId: string;
  contactId: string;
  contactPhone: string;
  contactName?: string;
  messageContent: string;
  messageVariables: Record<string, string>;
  messageId: string;
}

export class BulkMessageWorker {
  private worker!: Worker;
  private queueEvents!: QueueEvents;
  private config: WorkerConfig;
  private ioInstance: Server | null = null;

  constructor(config: WorkerConfig) {
    this.config = config;
    this.ioInstance = config.io || null;
    this.initializeWorker();
  }

  private initializeWorker() {
    const queueName = 'bulkQueue';
    
    this.worker = new Worker<MessageJobData>(
      queueName,
      this.processMessage.bind(this),
      {
        connection: this.config.redis,
        concurrency: this.config.concurrency,
        maxStalledCount: 3,
        stalledInterval: 30000,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
      }
    );

    this.queueEvents = new QueueEvents(queueName, {
      connection: this.config.redis,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // Job completed
    this.worker.on('completed', async (job) => {
      try {
        const { tenantId, campaignId, contactId } = job.data;
        
        // Mark job as completed for tenant
        await this.config.tenantJobLimiter.markJobCompleted(tenantId, job.id as string);
        
        // Log completion
        console.log(`✅ Job completed: ${job.id} for tenant ${tenantId}`);
        
        // Emit Socket.IO event to tenant
        await this.emitToTenant(tenantId, 'message_status_updated', {
          jobId: job.id,
          campaignId,
          contactId,
          status: 'SENT',
          sentAt: new Date().toISOString(),
        });

        // Emit to campaign room
        await this.emitToCampaign(campaignId, 'campaign_status_updated', {
          campaignId,
          messageStatus: 'SENT',
          contactId,
          timestamp: new Date().toISOString(),
        });

      } catch (error) {
        console.error('Error handling job completion:', error);
      }
    });

    // Job failed
    this.worker.on('failed', async (job, error) => {
      try {
        const { tenantId, campaignId, contactId } = job?.data || {};
        
        // Mark job as completed (it failed, so we remove from active)
        if (tenantId && job) {
          await this.config.tenantJobLimiter.markJobCompleted(tenantId, job.id as string);
        }
        
        console.error(`❌ Job failed: ${job?.id} for tenant ${tenantId}:`, error);
        
        // Emit failure event
        if (tenantId) {
          await this.emitToTenant(tenantId, 'message_status_updated', {
            jobId: job?.id,
            campaignId,
            contactId,
            status: 'FAILED',
            errorMessage: error.message,
          });

          // Emit to campaign room
          await this.emitToCampaign(campaignId, 'campaign_status_updated', {
            campaignId,
            messageStatus: 'FAILED',
            contactId,
            error: error.message,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (handlerError) {
        console.error('Error handling job failure:', handlerError);
      }
    });

    // Job progress
    this.worker.on('progress', async (job, progress) => {
      try {
        const { tenantId, campaignId } = job.data;
        
        await this.emitToTenant(tenantId, 'campaign_status_updated', {
          campaignId,
          progress,
          timestamp: new Date().toISOString(),
        });

        await this.emitToCampaign(campaignId, 'campaign_status_updated', {
          campaignId,
          progress,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Error handling job progress:', error);
      }
    });
  }

  private async processMessage(job: any): Promise<any> {
    const data: MessageJobData = job.data;
    const { tenantId, contactPhone, contactName, messageContent, messageVariables, campaignId, contactId } = data;

    try {
      // Check if tenant can process this job
      const canProcess = await this.config.tenantJobLimiter.canEnqueue(tenantId);
      if (!canProcess) {
        throw new Error('Rate limit exceeded for tenant');
      }

      // Mark job as active for tenant
      await this.config.tenantJobLimiter.markJobActive(tenantId, job.id as string);

      // Emit campaign started event
      await this.emitToTenant(tenantId, 'bulk_campaign_started', {
        campaignId,
        jobId: job.id,
        contactId,
        timestamp: new Date().toISOString(),
      });

      await this.emitToCampaign(campaignId, 'bulk_campaign_started', {
        campaignId,
        contactId,
        timestamp: new Date().toISOString(),
      });

      // Get tenant's Evolution API credentials
      const user = await this.config.prisma.user.findUnique({
        where: { id: tenantId },
        select: {
          evolutionUrl: true,
          evolutionApiKey: true,
          instanceName: true,
          email: true,
        },
      });

      if (!user?.evolutionUrl || !user?.evolutionApiKey || !user?.instanceName) {
        throw new Error('Evolution API credentials not configured');
      }

      // Decrypt API key
      const apiKey = decryptEvolutionApiKey(user.evolutionApiKey);
      if (!apiKey) {
        throw new Error('Failed to decrypt Evolution API key');
      }

      // Update job progress
      job.updateProgress(10);

      // Prepare message with variables
      let finalMessage = messageContent;
      if (messageVariables && Object.keys(messageVariables).length > 0) {
        finalMessage = this.replaceVariables(messageContent, messageVariables, {
          name: contactName || '',
          phone: contactPhone,
        });
      }

      // Update job progress
      job.updateProgress(25);

      // Send message via Evolution API
      const evolutionResponse = await this.sendWhatsAppMessage(
        user.evolutionUrl,
        user.instanceName,
        apiKey,
        contactPhone,
        finalMessage
      );

      // Update job progress
      job.updateProgress(75);

      // Create message record
      const message = await this.config.prisma.message.create({
        data: {
          id: `msg_${contactId}_${Date.now()}`,
          content: finalMessage,
          variables: messageVariables,
          status: 'SENT',
          sentAt: new Date(),
          campaign: {
            connect: { id: campaignId },
          },
          contact: {
            connect: { id: contactId },
          },
          channel: {
            connect: {
              id: await this.getOrCreateWhatsAppChannel(tenantId),
            },
          },
        },
      });

      // Update job progress
      job.updateProgress(90);

      // Log to MessageLog for audit
      await this.config.prisma.messageLog.create({
        data: {
          tenantId,
          number: contactPhone,
          status: 'sent',
          response: evolutionResponse,
          itemId: message.id,
          message: {
            connect: { id: message.id },
          },
        },
      });

      // Update campaign statistics
      await this.updateCampaignStats(campaignId);

      // Update job progress to completion
      job.updateProgress(100);

      // Emit campaign completed event
      await this.emitToTenant(tenantId, 'bulk_campaign_completed', {
        campaignId,
        jobId: job.id,
        contactId,
        messageId: message.id,
        timestamp: new Date().toISOString(),
      });

      await this.emitToCampaign(campaignId, 'bulk_campaign_completed', {
        campaignId,
        contactId,
        messageId: message.id,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        messageId: message.id,
        status: 'SENT',
        response: evolutionResponse,
      };

    } catch (error) {
      // Log error to MessageLog
      await this.config.prisma.messageLog.create({
        data: {
          tenantId,
          number: contactPhone,
          status: 'failed',
          response: { error: error instanceof Error ? error.message : 'Unknown error' },
        },
      });

      // Update message status if it exists
      await this.config.prisma.message.updateMany({
        where: {
          campaignId,
          contactId,
        },
        data: {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          retryCount: {
            increment: 1,
          },
        },
      });

      throw error;
    }
  }

  private replaceVariables(
    content: string,
    variables: Record<string, string>,
    context: { name: string; phone: string }
  ): string {
    let result = content;

    // Replace context variables
    result = result.replace(/\{\{name\}\}/gi, context.name);
    result = result.replace(/\{\{phone\}\}/gi, context.phone);

    // Replace custom variables
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
      result = result.replace(regex, value);
    });

    return result;
  }

  private async sendWhatsAppMessage(
    evolutionUrl: string,
    instanceName: string,
    apiKey: string,
    phone: string,
    message: string
  ): Promise<any> {
    const url = `${evolutionUrl}/message/sendText/${instanceName}`;
    
    const payload = {
      number: phone,
      textMessage: {
        text: message,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Evolution API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;
    
    // Check if the response indicates success
    if (data.key?.fromMe === false && data.key?.remoteJid) {
      return data;
    } else {
      throw new Error(`Evolution API returned unexpected response: ${JSON.stringify(data)}`);
    }
  }

  private async getOrCreateWhatsAppChannel(tenantId: string): Promise<string> {
    // Find existing WhatsApp channel for tenant
    let channel = await this.config.prisma.channel.findFirst({
      where: {
        userId: tenantId,
        type: 'WHATSAPP',
        isActive: true,
      },
    });

    if (!channel) {
      // Create default WhatsApp channel
      channel = await this.config.prisma.channel.create({
        data: {
          userId: tenantId,
          name: 'WhatsApp',
          type: 'WHATSAPP',
          isActive: true,
          status: 'CONNECTED',
          config: {},
        },
      });
    }

    return channel.id;
  }

  private async updateCampaignStats(campaignId: string): Promise<void> {
    const stats = await this.config.prisma.message.groupBy({
      by: ['status'],
      where: {
        campaignId,
      },
      _count: {
        status: true,
      },
    });

    const sentMessages = stats.find((s: any) => ['SENT', 'DELIVERED', 'READ'].includes(s.status))?._count.status || 0;
    const failedMessages = stats.find((s: any) => s.status === 'FAILED')?._count.status || 0;
    const deliveredMessages = stats.find((s: any) => ['DELIVERED', 'READ'].includes(s.status))?._count.status || 0;

    await this.config.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        sentMessages,
        failedMessages,
        updatedAt: new Date(),
      },
    });

    // Emit updated stats
    await this.emitToCampaign(campaignId, 'campaign_status_updated', {
      campaignId,
      totalSent: sentMessages,
      totalFailed: failedMessages,
      totalDelivered: deliveredMessages,
      timestamp: new Date().toISOString(),
    });
  }

  private async emitToTenant(tenantId: string, event: string, data: any): Promise<void> {
    try {
      if (this.ioInstance) {
        this.ioInstance.to(`tenant_${tenantId}`).emit(event, data);
        console.log(`📡 Emitted ${event} to tenant ${tenantId}:`, data);
      } else {
        console.log(`📡 Would emit ${event} to tenant ${tenantId}:`, data);
      }
    } catch (error) {
      console.error('Error emitting to tenant:', error);
    }
  }

  private async emitToCampaign(campaignId: string, event: string, data: any): Promise<void> {
    try {
      if (this.ioInstance) {
        this.ioInstance.to(`campaign_${campaignId}`).emit(event, data);
        console.log(`📡 Emitted ${event} to campaign ${campaignId}:`, data);
      } else {
        console.log(`📡 Would emit ${event} to campaign ${campaignId}:`, data);
      }
    } catch (error) {
      console.error('Error emitting to campaign:', error);
    }
  }

  public async close(): Promise<void> {
    await this.worker.close();
    await this.queueEvents.close();
  }

  public getWorker(): Worker {
    return this.worker;
  }
}