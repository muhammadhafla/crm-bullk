import { decryptEvolutionApiKey } from '../utils/encryption';

export interface EvolutionCredentials {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
}

export interface EvolutionMessageData {
  number: string;
  text?: string;
  textMessage?: { text: string };
  media?: string;
  caption?: string;
  fileName?: string;
  mediatype?: string;
  mimetype?: string;
  delay?: number;
  linkPreview?: boolean;
  mentionsEveryOne?: boolean;
  mentioned?: string[];
  quoted?: {
    key: { id: string };
    message: { conversation: string };
  };
}

export interface EvolutionContact {
  fullName?: string;
  wuid?: string;
  phoneNumber?: string;
  organization?: string;
  email?: string;
  url?: string;
}

export interface EvolutionSettings {
  rejectCall?: boolean;
  msgCall?: string;
  groupsIgnore?: boolean;
  alwaysOnline?: boolean;
  readMessages?: boolean;
  readStatus?: boolean;
  syncFullHistory?: boolean;
}

export interface EvolutionWebhook {
  enabled?: boolean;
  url?: string;
  webhookByEvents?: boolean;
  webhookBase64?: boolean;
  events?: string[];
}

export interface EvolutionPresenceOptions {
  presence?: 'available' | 'composing' | 'recording' | 'paused';
  delay?: number;
  number?: string;
}

export class EvolutionAPIService {
  constructor(private credentials: EvolutionCredentials) {}

  getCredentials() {
    return this.credentials;
  }

  /**
   * Make a request to Evolution API
   */
  private async makeRequest(endpoint: string, method: string = 'GET', data?: any): Promise<any> {
    const url = `${this.credentials.baseUrl}${endpoint}`;
    
    const options: RequestInit = {
      method,
      headers: {
        'apikey': this.credentials.apiKey,
        'Content-Type': 'application/json',
      },
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        const errorData = JSON.parse(errorText);
        
        if (response.status === 403) {
          throw new Error(`API Access Forbidden: ${errorData.response?.message?.[0] || errorText}`);
        } else if (response.status === 404) {
          throw new Error(`Instance Not Found: ${errorData.response?.message?.[0] || errorText}`);
        } else {
          throw new Error(`Evolution API error (${response.status}): ${errorData.message || errorText}`);
        }
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return response.json();
      }
      return response.text();
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Network error: ${error.message}`);
      }
      throw error;
    }
  }

  // === INSTANCE MANAGEMENT ===

  /**
   * Get API information
   */
  async getApiInfo(): Promise<any> {
    return this.makeRequest('');
  }

  /**
   * Create a new instance
   */
  async createInstance(instanceData: {
    instanceName: string;
    token?: string;
    qrcode?: boolean;
    number?: string;
    integration?: string;
    rejectCall?: boolean;
    msgCall?: string;
    groupsIgnore?: boolean;
    alwaysOnline?: boolean;
    readMessages?: boolean;
    readStatus?: boolean;
    syncFullHistory?: boolean;
    webhook?: EvolutionWebhook;
  }): Promise<any> {
    return this.makeRequest('/instance/create', 'POST', {
      ...instanceData,
      token: instanceData.token || '',
      qrcode: instanceData.qrcode !== false,
      integration: instanceData.integration || 'WHATSAPP-BAILEYS',
      rejectCall: instanceData.rejectCall || false,
      groupsIgnore: instanceData.groupsIgnore !== false,
      alwaysOnline: instanceData.alwaysOnline || false,
      readMessages: instanceData.readMessages !== false,
      readStatus: instanceData.readStatus !== false,
      syncFullHistory: instanceData.syncFullHistory || false,
    });
  }

  /**
   * Fetch all instances
   */
  async fetchInstances(): Promise<any> {
    return this.makeRequest('/instance/fetchInstances');
  }

  /**
   * Get connection state
   */
  async getConnectionState(): Promise<any> {
    return this.makeRequest(`/instance/connectionState/${this.credentials.instanceName}`);
  }

  /**
   * Get connection QR code
   */
  async getQRCode(): Promise<any> {
    return this.makeRequest(`/instance/connect/${this.credentials.instanceName}`);
  }

  /**
   * Restart instance
   */
  async restartInstance(): Promise<any> {
    return this.makeRequest(`/instance/restart/${this.credentials.instanceName}`, 'PUT');
  }

  /**
   * Logout instance
   */
  async logout(): Promise<any> {
    return this.makeRequest(`/instance/logout/${this.credentials.instanceName}`, 'DELETE');
  }

  /**
   * Delete instance
   */
  async deleteInstance(): Promise<any> {
    return this.makeRequest(`/instance/delete/${this.credentials.instanceName}`, 'DELETE');
  }

  // === SETTINGS MANAGEMENT ===

  /**
   * Set instance presence
   */
  async setPresence(presence: 'available' | 'unavailable' = 'available'): Promise<any> {
    return this.makeRequest(`/instance/setPresence/${this.credentials.instanceName}`, 'POST', {
      presence
    });
  }

  /**
   * Set webhook
   */
  async setWebhook(webhook: EvolutionWebhook): Promise<any> {
    return this.makeRequest(`/webhook/set/${this.credentials.instanceName}`, 'POST', {
      enabled: webhook.enabled !== false,
      url: webhook.url || '',
      webhookByEvents: webhook.webhookByEvents || false,
      webhookBase64: webhook.webhookBase64 || false,
      events: webhook.events || ['APPLICATION_STARTUP']
    });
  }

  /**
   * Find webhook
   */
  async findWebhook(): Promise<any> {
    return this.makeRequest(`/webhook/find/${this.credentials.instanceName}`);
  }

  /**
   * Set instance settings
   */
  async setSettings(settings: EvolutionSettings): Promise<any> {
    return this.makeRequest(`/settings/set/${this.credentials.instanceName}`, 'POST', {
      rejectCall: settings.rejectCall || false,
      msgCall: settings.msgCall || '',
      groupsIgnore: settings.groupsIgnore !== false,
      alwaysOnline: settings.alwaysOnline || false,
      readMessages: settings.readMessages !== false,
      readStatus: settings.readStatus !== false,
      syncFullHistory: settings.syncFullHistory || false
    });
  }

  /**
   * Find instance settings
   */
  async findSettings(): Promise<any> {
    return this.makeRequest(`/settings/find/${this.credentials.instanceName}`);
  }

  // === MESSAGE FUNCTIONS ===

  /**
   * Send plain text message
   */
  async sendTextMessage(phone: string, text: string, options: {
    delay?: number;
    linkPreview?: boolean;
    mentionsEveryOne?: boolean;
    mentioned?: string[];
    quoted?: any;
  } = {}): Promise<any> {
    const messageData = {
      number: this.normalizePhone(phone),
      text,
      delay: options.delay,
      linkPreview: options.linkPreview,
      mentionsEveryOne: options.mentionsEveryOne,
      mentioned: options.mentioned,
      quoted: options.quoted
    };

    return this.makeRequest(`/message/sendText/${this.credentials.instanceName}`, 'POST', messageData);
  }

  /**
   * Send status message
   */
  async sendStatusMessage(type: 'text', content: string, caption?: string): Promise<any> {
    const messageData = {
      type,
      content,
      caption,
      backgroundColor: '#000000',
      font: 1,
      allContacts: true
    };

    return this.makeRequest(`/message/sendStatus/${this.credentials.instanceName}`, 'POST', messageData);
  }

  /**
   * Send media message (image, document, video)
   */
  async sendMediaMessage(phone: string, mediaType: string, mediaUrl: string, options: {
    caption?: string;
    fileName?: string;
    delay?: number;
    linkPreview?: boolean;
    mentionsEveryOne?: boolean;
    mentioned?: string[];
    quoted?: any;
  } = {}): Promise<any> {
    let mediatype = mediaType;
    let mimetype = '';

    // Set appropriate mimetype based on media type
    switch (mediaType.toLowerCase()) {
      case 'image':
        mimetype = 'image/jpeg';
        break;
      case 'document':
        mimetype = 'application/pdf';
        break;
      case 'video':
        mimetype = 'video/mp4';
        break;
    }

    const messageData = {
      number: this.normalizePhone(phone),
      mediatype,
      mimetype,
      caption: options.caption,
      media: mediaUrl,
      fileName: options.fileName || `${mediaType}-${Date.now()}`,
      delay: options.delay,
      linkPreview: options.linkPreview,
      mentionsEveryOne: options.mentionsEveryOne,
      mentioned: options.mentioned,
      quoted: options.quoted
    };

    return this.makeRequest(`/message/sendMedia/${this.credentials.instanceName}`, 'POST', messageData);
  }

  /**
   * Send audio message
   */
  async sendAudioMessage(phone: string, audioUrl: string, options: {
    delay?: number;
    mentionsEveryOne?: boolean;
    mentioned?: string[];
    quoted?: any;
  } = {}): Promise<any> {
    const messageData = {
      number: this.normalizePhone(phone),
      audio: audioUrl,
      delay: options.delay,
      mentionsEveryOne: options.mentionsEveryOne,
      mentioned: options.mentioned,
      quoted: options.quoted
    };

    return this.makeRequest(`/message/sendWhatsAppAudio/${this.credentials.instanceName}`, 'POST', messageData);
  }

  /**
   * Send sticker
   */
  async sendSticker(phone: string, stickerUrl: string, options: {
    delay?: number;
    mentionsEveryOne?: boolean;
    mentioned?: string[];
    quoted?: any;
  } = {}): Promise<any> {
    const messageData = {
      number: this.normalizePhone(phone),
      sticker: stickerUrl,
      delay: options.delay,
      mentionsEveryOne: options.mentionsEveryOne,
      mentioned: options.mentioned,
      quoted: options.quoted
    };

    return this.makeRequest(`/message/sendSticker/${this.credentials.instanceName}`, 'POST', messageData);
  }

  /**
   * Send contact
   */
  async sendContact(phone: string, contacts: EvolutionContact[]): Promise<any> {
    const messageData = {
      number: this.normalizePhone(phone),
      contact: contacts
    };

    return this.makeRequest(`/message/sendContact/${this.credentials.instanceName}`, 'POST', messageData);
  }

  /**
   * Send reaction
   */
  async sendReaction(messageKey: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  }, reaction: string): Promise<any> {
    const messageData = {
      key: messageKey,
      reaction
    };

    return this.makeRequest(`/message/sendReaction/${this.credentials.instanceName}`, 'POST', messageData);
  }

  /**
   * Send list message
   */
  async sendListMessage(phone: string, title: string, description: string, buttonText: string, footerText: string, rows: any[], options: {
    delay?: number;
    linkPreview?: boolean;
    mentionsEveryOne?: boolean;
    mentioned?: string[];
    quoted?: any;
  } = {}): Promise<any> {
    const messageData = {
      number: this.normalizePhone(phone),
      title,
      description,
      buttonText,
      footerText,
      values: rows,
      delay: options.delay,
      linkPreview: options.linkPreview,
      mentionsEveryOne: options.mentionsEveryOne,
      mentioned: options.mentioned,
      quoted: options.quoted
    };

    return this.makeRequest(`/message/sendList/${this.credentials.instanceName}`, 'POST', messageData);
  }

  /**
   * Send buttons message
   */
  async sendButtonsMessage(phone: string, title: string, description: string, buttons: any[], options: {
    footer?: string;
    delay?: number;
    linkPreview?: boolean;
    mentionsEveryOne?: boolean;
    mentioned?: string[];
    quoted?: any;
  } = {}): Promise<any> {
    const messageData = {
      number: this.normalizePhone(phone),
      title,
      description,
      footer: options.footer,
      buttons,
      delay: options.delay,
      linkPreview: options.linkPreview,
      mentionsEveryOne: options.mentionsEveryOne,
      mentioned: options.mentioned,
      quoted: options.quoted
    };

    return this.makeRequest(`/message/sendButtons/${this.credentials.instanceName}`, 'POST', messageData);
  }

  // === CHAT MANAGEMENT ===

  /**
   * Check if WhatsApp number exists
   */
  async checkWhatsAppNumber(number: string): Promise<any> {
    return this.makeRequest(`/chat/whatsappNumbers/${this.credentials.instanceName}`, 'POST', {
      numbers: [this.normalizePhone(number)]
    });
  }

  /**
   * Mark message as read
   */
  async markMessageAsRead(messageKeys: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  }[]): Promise<any> {
    return this.makeRequest(`/chat/markMessageAsRead/${this.credentials.instanceName}`, 'POST', {
      readMessages: messageKeys
    });
  }

  /**
   * Mark chat as unread
   */
  async markChatUnread(chatId: string, lastMessage: any): Promise<any> {
    return this.makeRequest(`/chat/markChatUnread/${this.credentials.instanceName}`, 'POST', {
      lastMessage,
      chat: chatId
    });
  }

  /**
   * Archive chat
   */
  async archiveChat(chatId: string, lastMessage: any, archive: boolean = true): Promise<any> {
    return this.makeRequest(`/chat/archiveChat/${this.credentials.instanceName}`, 'POST', {
      lastMessage: { key: lastMessage },
      archive,
      chat: chatId
    });
  }

  /**
   * Delete message for everyone
   */
  async deleteMessageForEveryone(messageKey: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
    participant?: string;
  }): Promise<any> {
    return this.makeRequest(`/chat/deleteMessageForEveryone/${this.credentials.instanceName}`, 'DELETE', messageKey);
  }

  /**
   * Update message
   */
  async updateMessage(messageKey: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  }, text: string): Promise<any> {
    const messageData = {
      number: 0, // This seems to be from the original doc but might not be needed
      text,
      key: messageKey
    };

    return this.makeRequest(`/chat/updateMessage/${this.credentials.instanceName}`, 'POST', messageData);
  }

  /**
   * Send presence
   */
  async sendPresence(options: EvolutionPresenceOptions): Promise<any> {
    return this.makeRequest(`/chat/sendPresence/${this.credentials.instanceName}`, 'POST', {
      number: options.number,
      options: {
        delay: options.delay,
        presence: options.presence || 'composing'
      }
    });
  }

  /**
   * Update block status
   */
  async updateBlockStatus(number: string, status: 'block' | 'unblock'): Promise<any> {
    return this.makeRequest(`/message/updateBlockStatus/${this.credentials.instanceName}`, 'POST', {
      number: this.normalizePhone(number),
      status
    });
  }

  // === PROFILE MANAGEMENT ===

  /**
   * Fetch profile picture URL
   */
  async fetchProfilePictureUrl(number: string): Promise<any> {
    return this.makeRequest(`/chat/fetchProfilePictureUrl/${this.credentials.instanceName}`, 'POST', {
      number: this.normalizePhone(number)
    });
  }

  /**
   * Find contacts
   */
  async findContacts(where: any = {}): Promise<any> {
    return this.makeRequest(`/chat/findContacts/${this.credentials.instanceName}`, 'POST', { where });
  }

  /**
   * Find messages
   */
  async findMessages(where: any = {}): Promise<any> {
    return this.makeRequest(`/chat/findMessages/${this.credentials.instanceName}`, 'POST', { where });
  }

  /**
   * Find status message
   */
  async findStatusMessage(where: any = {}, limit?: number): Promise<any> {
    return this.makeRequest(`/chat/findStatusMessage/${this.credentials.instanceName}`, 'POST', {
      where,
      limit
    });
  }

  /**
   * Find chats
   */
  async findChats(): Promise<any> {
    return this.makeRequest(`/chat/findChats/${this.credentials.instanceName}`, 'POST');
  }

  /**
   * Fetch business profile
   */
  async fetchBusinessProfile(number: string): Promise<any> {
    return this.makeRequest(`/chat/fetchBusinessProfile/${this.credentials.instanceName}`, 'POST', {
      number: this.normalizePhone(number)
    });
  }

  /**
   * Fetch profile
   */
  async fetchProfile(number: string): Promise<any> {
    return this.makeRequest(`/chat/fetchProfile/${this.credentials.instanceName}`, 'POST', {
      number: this.normalizePhone(number)
    });
  }

  /**
   * Update profile name
   */
  async updateProfileName(name: string): Promise<any> {
    return this.makeRequest(`/chat/updateProfileName/${this.credentials.instanceName}`, 'POST', { name });
  }

  /**
   * Update profile status
   */
  async updateProfileStatus(status: string): Promise<any> {
    return this.makeRequest(`/chat/updateProfileStatus/${this.credentials.instanceName}`, 'POST', { status });
  }

  /**
   * Update profile picture
   */
  async updateProfilePicture(picture: string): Promise<any> {
    return this.makeRequest(`/chat/updateProfilePicture/${this.credentials.instanceName}`, 'POST', { picture });
  }

  /**
   * Remove profile picture
   */
  async removeProfilePicture(): Promise<any> {
    return this.makeRequest(`/chat/removeProfilePicture/${this.credentials.instanceName}`, 'DELETE');
  }

  /**
   * Fetch privacy settings
   */
  async fetchPrivacySettings(): Promise<any> {
    return this.makeRequest(`/chat/fetchPrivacySettings/${this.credentials.instanceName}`);
  }

  /**
   * Update privacy settings
   */
  async updatePrivacySettings(settings: {
    readreceipts?: string;
    profile?: string;
    status?: string;
    online?: string;
    last?: string;
    groupadd?: string;
  }): Promise<any> {
    return this.makeRequest(`/chat/updatePrivacySettings/${this.credentials.instanceName}`, 'POST', settings);
  }

  // === WEBSOCKET MANAGEMENT ===

  /**
   * Set websocket
   */
  async setWebsocket(websocket: {
    enabled?: boolean;
    events?: string[];
  }): Promise<any> {
    return this.makeRequest(`/websocket/set/${this.credentials.instanceName}`, 'POST', {
      websocket: {
        enabled: websocket.enabled !== false,
        events: websocket.events || ['APPLICATION_STARTUP']
      }
    });
  }

  /**
   * Find websocket
   */
  async findWebsocket(): Promise<any> {
    return this.makeRequest(`/websocket/find/${this.credentials.instanceName}`);
  }

  // === UTILITY METHODS ===

  /**
   * Get message status
   */
  async getMessageStatus(messageId: string): Promise<any> {
    const messages = await this.findMessages({
      key: { id: messageId }
    });
    return messages.messages?.[0] || null;
  }

  /**
   * Get chat history
   */
  async getChatHistory(phone: string, page: number = 1, limit: number = 50): Promise<any> {
    const messages = await this.findMessages({
      key: { remoteJid: this.normalizePhone(phone) }
    });
    return messages.messages || [];
  }

  /**
   * Check if connected
   */
  async isConnected(): Promise<boolean> {
    try {
      const status = await this.getConnectionState();
      return status.instance?.state === 'open';
    } catch (error) {
      return false;
    }
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
   * Check if number is WhatsApp
   */
  async isWhatsAppNumber(phone: string): Promise<boolean> {
    try {
      const result = await this.checkWhatsAppNumber(phone);
      return result[0]?.exists || false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get base64 from media message
   */
  async getBase64FromMediaMessage(messageKey: any, convertToMp4: boolean = true): Promise<any> {
    return this.makeRequest(`/chat/getBase64FromMediaMessage/${this.credentials.instanceName}`, 'POST', {
      message: { key: messageKey },
      convertToMp4
    });
  }
}

/**
 * Factory function to create EvolutionAPIService from user
 */
export async function createEvolutionAPIService(prisma: any, userId: string): Promise<EvolutionAPIService> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      evolutionUrl: true,
      evolutionApiKey: true,
      instanceName: true,
    },
  });

  if (!user?.evolutionUrl || !user?.evolutionApiKey || !user?.instanceName) {
    throw new Error('Evolution API credentials not configured');
  }

  const apiKey = decryptEvolutionApiKey(user.evolutionApiKey);

  if (!apiKey) {
    throw new Error('Failed to decrypt Evolution API key');
  }

  const credentials: EvolutionCredentials = {
    baseUrl: user.evolutionUrl,
    apiKey,
    instanceName: user.instanceName,
  };

  return new EvolutionAPIService(credentials);
}