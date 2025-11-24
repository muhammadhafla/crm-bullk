# IMPLEMENTATION PLAN - CRM Bulk WhatsApp Messaging V1

## 🎯 **PHASE 1: MANUAL BULK MESSAGING (IMMEDIATE IMPLEMENTATION)**

### **User Flow: Manual Approach**
```
📝 ADMIN WORKFLOW
1. Admin prepare CSV/Excel file dengan kolom: phone_number, message_template
2. Upload file melalui interface
3. Preview messages (sample)
4. Configure delivery settings (rate, schedule)
5. Launch bulk campaign
6. Monitor progress real-time
7. Download results report
```

---

## 🏗️ **BACKEND IMPLEMENTATION**

### **1. Database Schema Extensions**

#### **1.1 Bulk Campaign Tables**
```sql
-- Bulk campaigns table
CREATE TABLE bulk_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    template_message TEXT NOT NULL,
    variables JSONB, -- Store variable definitions
    status VARCHAR(50) DEFAULT 'draft',
    total_recipients INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    rate_per_minute INTEGER DEFAULT 30,
    scheduled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Bulk campaign recipients
CREATE TABLE bulk_campaign_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES bulk_campaigns(id),
    phone_number VARCHAR(20) NOT NULL,
    personal_message TEXT NOT NULL, -- Final message after variable substitution
    status VARCHAR(50) DEFAULT 'pending',
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Message queue for processing
CREATE TABLE message_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES bulk_campaigns(id),
    recipient_id UUID REFERENCES bulk_campaign_recipients(id),
    phone_number VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'queued',
    priority INTEGER DEFAULT 5,
    scheduled_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP,
    error_count INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### **1.2 Variable Management**
```sql
-- Variable templates
CREATE TABLE message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    template_content TEXT NOT NULL,
    variables JSONB, -- ["name", "company", "tracking_number"]
    category VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### **2. Backend API Endpoints**

#### **2.1 Campaign Management**
```typescript
// POST /api/bulk/campaigns - Create campaign
interface CreateCampaignRequest {
  name: string;
  description?: string;
  template_message: string;
  variables: string[];
  rate_per_minute: number;
  scheduled_at?: string;
  recipients_file?: File; // CSV/Excel upload
}

// GET /api/bulk/campaigns - List campaigns
// GET /api/bulk/campaigns/:id - Get campaign details
// PUT /api/bulk/campaigns/:id - Update campaign
// DELETE /api/bulk/campaigns/:id - Delete campaign
```

#### **2.2 File Processing**
```typescript
// POST /api/bulk/upload-contacts - Upload contact file
interface UploadContactsRequest {
  file: File; // CSV/Excel
  template_variables: string[]; // Expected variables in template
}

// Response: { processed_count, errors, preview_data }
```

#### **2.3 Campaign Actions**
```typescript
// POST /api/bulk/campaigns/:id/launch - Start campaign
// POST /api/bulk/campaigns/:id/pause - Pause campaign
// POST /api/bulk/campaigns/:id/resume - Resume campaign
// POST /api/bulk/campaigns/:id/cancel - Cancel campaign
```

#### **2.4 Real-time Status**
```typescript
// GET /api/bulk/campaigns/:id/status - Get real-time status
interface CampaignStatus {
  campaign_id: string;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'failed';
  progress: {
    total: number;
    sent: number;
    delivered: number;
    failed: number;
    pending: number;
  };
  rate: {
    current_rate: number;
    estimated_completion: string;
  };
}
```

### **3. Core Services**

#### **3.1 Bulk Campaign Service**
```typescript
// src/services/bulkCampaignService.ts
export class BulkCampaignService {
  // Campaign CRUD
  async createCampaign(userId: string, data: CreateCampaignRequest): Promise<Campaign>
  async updateCampaign(campaignId: string, data: UpdateCampaignRequest): Promise<Campaign>
  async deleteCampaign(campaignId: string): Promise<void>
  
  // File processing
  async processContactFile(file: File, variables: string[]): Promise<ProcessedContacts>
  async validateTemplateVariables(template: string, variables: string[]): Promise<ValidationResult>
  
  // Campaign execution
  async launchCampaign(campaignId: string): Promise<void>
  async pauseCampaign(campaignId: string): Promise<void>
  async resumeCampaign(campaignId: string): Promise<void>
  async cancelCampaign(campaignId: string): Promise<void>
  
  // Personalization
  async generatePersonalizedMessages(template: string, contacts: Contact[]): Promise<PersonalizedMessage[]>
  async validatePersonalization(template: string, contact: Contact): Promise<ValidationResult>
}
```

#### **3.2 Message Queue Service**
```typescript
// src/services/messageQueueService.ts
export class MessageQueueService {
  // Queue management
  async addToQueue(campaignId: string, messages: QueuedMessage[]): Promise<void>
  async getNextMessage(): Promise<QueuedMessage | null>
  async markAsSent(messageId: string): Promise<void>
  async markAsDelivered(messageId: string): Promise<void>
  async markAsFailed(messageId: string, error: string): Promise<void>
  
  // Rate limiting
  async getCurrentRate(campaignId: string): Promise<number>
  async shouldDelayNextMessage(campaignId: string): Promise<boolean>
}
```

#### **3.3 File Processing Service**
```typescript
// src/services/fileProcessingService.ts
export class FileProcessingService {
  // File parsing
  async parseCSV(file: File): Promise<ContactData[]>
  async parseExcel(file: File): Promise<ContactData[]>
  async validateFileFormat(file: File): Promise<ValidationResult>
  
  // Data validation
  async validatePhoneNumbers(contacts: ContactData[]): Promise<ValidationResult>
  async detectTemplateVariables(contacts: ContactData[]): Promise<string[]>
}
```

### **4. Background Workers**

#### **4.1 Campaign Processor Worker**
```typescript
// src/workers/campaignProcessor.ts
export class CampaignProcessor {
  async processCampaignQueue(): Promise<void> {
    // Process messages from queue
    // Respect rate limits
    // Handle errors and retries
    // Update campaign status
  }
  
  private async processMessage(message: QueuedMessage): Promise<void> {
    try {
      // Send via Evolution API
      const result = await this.evolutionApi.sendTextMessage(
        message.phone_number,
        message.message
      );
      
      // Update status
      await this.messageQueueService.markAsDelivered(message.id);
      await this.updateCampaignProgress(message.campaign_id);
      
    } catch (error) {
      await this.handleSendError(message, error);
    }
  }
}
```

---

## 🎨 **FRONTEND IMPLEMENTATION**

### **1. Bulk Campaign Interface**

#### **1.1 Campaign Creation Page**
```
📝 CREATE BULK CAMPAIGN

Step 1: Campaign Details
├── Campaign Name
├── Description (optional)
└── Template Message (rich text editor)
    ├── Variable placeholders: {{name}}, {{company}}
    ├── Preview with sample data
    └── Character count

Step 2: Recipients
├── Upload File (CSV/Excel)
│   ├── Drag & drop interface
│   ├── Sample format download
│   └── Preview first 10 rows
├── Manual Entry (textarea)
│   ├── One contact per line: phone,message
│   └── Format validation
└── Variable Mapping
    ├── Auto-detect from template
    ├── Manual mapping interface
    └── Default value assignment

Step 3: Settings
├── Delivery Rate (messages per minute)
├── Schedule (immediate/scheduled)
├── Retry Failed Messages (yes/no)
└── Test Mode (send to 5 contacts first)

Step 4: Review & Launch
├── Campaign summary
├── Recipient count
├── Estimated time
└── Launch button
```

#### **1.2 Campaign Dashboard**
```
📊 BULK CAMPAIGN DASHBOARD

Active Campaigns:
├── Campaign A (Running)
│   ├── Progress bar: 1,247/2,000 (62%)
│   ├── Status: Delivering...
│   ├── Rate: 45 msg/min
│   └── ETA: 15 minutes
├── Campaign B (Paused)
│   ├── Progress: 345/1,500 (23%)
│   ├── Status: Paused by user
│   └── Resume button
└── Campaign C (Draft)
    ├── Status: Ready to launch
    └── Launch button

Recent Campaigns:
├── Completed campaigns list
├── Performance metrics
└── Download reports
```

#### **1.3 Real-time Campaign Monitor**
```
🚀 LIVE CAMPAIGN MONITOR

Campaign: Daily Delivery Update
├── Overall Progress
│   ├── Sent: 1,247/2,000 (62%)
│   ├── Delivered: 1,189 (95%)
│   ├── Failed: 58 (5%)
│   └── Pending: 753
├── Delivery Rate
│   ├── Current: 45 msg/min
│   ├── Target: 50 msg/min
│   └── ETA: 15 minutes remaining
├── Recent Activity
│   ├── 09:45 - Message sent to +628123456789
│   ├── 09:45 - Message delivered to +628123456790
│   ├── 09:44 - Failed: +628123456791 (invalid number)
│   └── 09:44 - Retry queued: +628123456792
├── Quick Actions
│   ├── Pause Campaign
│   ├── Adjust Rate
│   ├── View Failures
│   └── Export Report
└── Error Handling
    ├── Failed messages list
    ├── Retry failed button
    ├── Error analysis
    └── Manual intervention
```

### **2. Message Templates System**

#### **2.1 Template Library**
```
📚 MESSAGE TEMPLATES

Template Categories:
├── 📦 Delivery Updates
│   ├── Out for Delivery
│   ├── Delivered Confirmation
│   ├── Delayed Shipment
│   └── Failed Delivery
├── 📋 Customer Service
│   ├── Delivery Confirmation Request
│   ├── Service Quality Survey
│   ├── Payment Reminder
│   └── Complaint Follow-up
├── 🎯 Promotional
│   ├── New Service Announcement
│   ├── Discount Campaign
│   ├── Referral Program
│   └── Seasonal Greetings
└── ➕ Custom Templates
    ├── Create New Template
    ├── Import Templates
    └── Template Sharing

Template Editor:
├── Rich text editor
├── Variable insertion ({{variable}})
├── Preview with sample data
├── Save as template
└── Test template
```

### **3. File Upload Interface**

#### **3.1 Contact Upload**
```
📤 UPLOAD CONTACTS

Upload Methods:
├── CSV Upload
│   ├── Drag & drop zone
│   ├── File format requirements
│   ├── Sample CSV download
│   └── Upload progress
├── Excel Upload (.xlsx)
│   ├── Multi-sheet support
│   ├── Column mapping
│   └── Data validation
└── Manual Entry
    ├── Text area input
    ├── Format: phone,message
    └── Live validation

File Preview:
├── First 10 rows display
├── Column mapping interface
├── Variable detection
└── Data validation status

Validation Results:
├── Valid contacts: 1,247
├── Invalid numbers: 12
├── Missing variables: 3
└── Download error report
```

---

## 🔧 **TECHNICAL IMPLEMENTATION DETAILS**

### **1. File Processing Pipeline**

#### **1.1 CSV/Excel Parser**
```typescript
// Frontend: File upload component
const processFile = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch('/api/bulk/upload-contacts', {
    method: 'POST',
    body: formData
  });
  
  return response.json();
};

// Backend: File processing endpoint
export const uploadContacts = async (request: FastifyRequest) => {
  const file = await request.file();
  const processed = await fileProcessingService.parseCSV(file);
  const validation = await validateContacts(processed);
  
  return {
    processed_count: processed.length,
    errors: validation.errors,
    preview_data: processed.slice(0, 10)
  };
};
```

#### **1.2 Template Variable Engine**
```typescript
// Template variable substitution
export class TemplateEngine {
  substituteVariables(template: string, contact: ContactData): string {
    let message = template;
    
    // Replace {{variable}} with contact data
    const variables = this.extractVariables(template);
    
    variables.forEach(variable => {
      const value = contact[variable] || contact[variable.toLowerCase()] || `{{${variable}}}`;
      message = message.replace(new RegExp(`{{${variable}}}`, 'g'), value);
    });
    
    return message;
  }
  
  extractVariables(template: string): string[] {
    const matches = template.match(/{{(\w+)}}/g);
    return matches ? matches.map(match => match.replace(/[{}]/g, '')) : [];
  }
}
```

### **2. Rate Limiting Implementation**

#### **2.1 Campaign Rate Controller**
```typescript
export class RateController {
  private campaignRates: Map<string, number> = new Map();
  
  async shouldSendMessage(campaignId: string): Promise<boolean> {
    const currentRate = this.campaignRates.get(campaignId) || 0;
    const campaign = await this.getCampaign(campaignId);
    
    if (currentRate >= campaign.rate_per_minute) {
      return false;
    }
    
    // Increment rate counter
    this.campaignRates.set(campaignId, currentRate + 1);
    
    // Reset counter every minute
    setTimeout(() => {
      const rate = this.campaignRates.get(campaignId) || 0;
      this.campaignRates.set(campaignId, Math.max(0, rate - 1));
    }, 60000);
    
    return true;
  }
}
```

### **3. Real-time Updates**

#### **3.1 WebSocket Implementation**
```typescript
// Backend: WebSocket server for real-time updates
fastify.io.on('connection', (socket) => {
  socket.on('join_campaign', (campaignId) => {
    socket.join(`campaign_${campaignId}`);
  });
  
  socket.on('leave_campaign', (campaignId) => {
    socket.leave(`campaign_${campaignId}`);
  });
});

// Emit campaign updates
export const emitCampaignUpdate = (campaignId: string, update: CampaignUpdate) => {
  fastify.io.to(`campaign_${campaignId}`).emit('campaign_update', update);
};
```

#### **3.2 Frontend Real-time Hook**
```typescript
// Frontend: Real-time campaign updates
export const useCampaignUpdates = (campaignId: string) => {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  
  useEffect(() => {
    const socket = io();
    
    socket.emit('join_campaign', campaignId);
    
    socket.on('campaign_update', (update: CampaignUpdate) => {
      setCampaign(prev => ({
        ...prev,
        ...update,
        progress: {
          ...prev?.progress,
          ...update.progress
        }
      }));
    });
    
    return () => {
      socket.emit('leave_campaign', campaignId);
      socket.disconnect();
    };
  }, [campaignId]);
  
  return campaign;
};
```

---

## 📋 **IMPLEMENTATION PHASES**

### **Phase 1: Core Infrastructure (Week 1-2)**
- [ ] Database schema creation
- [ ] Basic campaign CRUD API
- [ ] File upload and processing
- [ ] Template variable engine
- [ ] Basic campaign interface

### **Phase 2: Message Processing (Week 3)**
- [ ] Message queue system
- [ ] Rate limiting implementation
- [ ] Background worker for message sending
- [ ] Evolution API integration
- [ ] Error handling and retry logic

### **Phase 3: Real-time Features (Week 4)**
- [ ] WebSocket implementation
- [ ] Real-time dashboard
- [ ] Progress tracking
- [ ] Campaign monitoring interface
- [ ] Live status updates

### **Phase 4: Advanced Features (Week 5-6)**
- [ ] Campaign templates system
- [ ] Advanced file validation
- [ ] Campaign analytics
- [ ] Report generation
- [ ] Performance optimization

### **Phase 5: User Experience (Week 7-8)**
- [ ] UI/UX improvements
- [ ] File format support (Excel)
- [ ] Bulk operations
- [ ] User feedback integration
- [ ] Documentation and help

---

## 🔮 **FUTURE ENHANCEMENTS (MODULAR APPROACH)**

### **Phase 2: Advanced Integrations**
```typescript
// Plugin system for future integrations
interface IntegrationPlugin {
  name: string;
  version: string;
  enabled: boolean;
  config: Record<string, any>;
  
  // Required methods
  getContacts(): Promise<ContactData[]>;
  getVariables(): Promise<string[]>;
  validateConfig(): Promise<boolean>;
}

// Example plugins:
class ShopifyIntegration implements IntegrationPlugin {
  async getContacts(): Promise<ContactData[]> {
    // Fetch customers from Shopify
    // Transform to ContactData format
    return transformedContacts;
  }
  
  async getVariables(): Promise<string[]> {
    return ['customer_name', 'order_id', 'tracking_number', 'status'];
  }
}

class EkspedisiAPI implements IntegrationPlugin {
  async getContacts(): Promise<ContactData[]> {
    // Fetch shipping data from ekspedisi system
    // Include tracking numbers, status, etc.
    return shippingData;
  }
}
```

### **Integration Settings Panel**
```
⚙️ INTEGRATION SETTINGS

Available Integrations:
├── 🛒 Shopify
│   ├── Status: Disconnected
│   ├── Connect button
│   └── Config: API Key, Store URL
├── 📦 Ekspedisi System
│   ├── Status: Connected
│   ├── Disconnect button
│   └── Config: API URL, Credentials
├── 📊 ERP System
│   ├── Status: Available
│   ├── Install button
│   └── Config: Database connection
└── 📱 WhatsApp Business
    ├── Status: Active
    ├── Settings button
    └── Config: Business account

Integration Features:
├── Auto-sync contacts
├── Real-time data updates
├── Custom field mapping
└── Webhook configuration
```

---

## 💾 **PLACEHOLDER IMPLEMENTATION**

### **Current State: Manual Mode**
```typescript
// For now, implement manual contact entry
interface ManualContactInput {
  phone_number: string;
  personal_message: string; // Already processed with variables
}

// Bulk campaign creation (manual mode)
const createManualCampaign = async (data: {
  name: string;
  template_message: string;
  contacts: ManualContactInput[];
  rate_per_minute: number;
}) => {
  // Process each contact with template variables
  const processedContacts = data.contacts.map(contact => ({
    ...contact,
    personal_message: templateEngine.substitute(data.template_message, contact)
  }));
  
  // Create campaign and queue messages
  const campaign = await bulkCampaignService.createCampaign({
    ...data,
    contacts: processedContacts
  });
  
  return campaign;
};
```

### **Sample Data Format**
```csv
phone_number,name,company,tracking_number,status
628123456789,John Doe,ACME Corp,TRK001,Out for Delivery
628123456790,Jane Smith,Beta Ltd,TRK002,Delivered
628123456791,Bob Johnson,Gamma Inc,TRK003,Delayed
```

### **Template Examples**
```
Hello {{name}},

Your package {{tracking_number}} from {{company}} is currently {{status}}.

{{#if status == "Out for Delivery"}}
Expected delivery today!
{{/if}}

{{#if status == "Delivered"}}
Thank you for choosing our service!
{{/if}}

{{#if status == "Delayed"}}
We apologize for the delay. New ETA: Tomorrow
{{/if}}

Best regards,
Shipping Team
```

---

## ✅ **SUCCESS METRICS**

### **Technical Metrics**
- [ ] Process 1000+ messages per campaign
- [ ] < 5% delivery failure rate
- [ ] Real-time UI updates (< 1 second delay)
- [ ] Support CSV and Excel file uploads
- [ ] Rate limiting working correctly

### **User Experience Metrics**
- [ ] Create campaign in < 3 minutes
- [ ] Upload and process file in < 30 seconds
- [ ] Real-time progress tracking
- [ ] Easy error handling and retry
- [ ] Download campaign reports

### **Business Metrics**
- [ ] Enable bulk messaging for 500+ contacts
- [ ] Reduce manual messaging time by 80%
- [ ] Improve delivery tracking and analytics
- [ ] Foundation for future integrations
- [ ] Scalable architecture for growth

**IMPLEMENTASI INI MEMBERIKAN FOUNDATION SOLID untuk bulk personalised WhatsApp messaging dengan manual approach, yang bisa dikembangkan menjadi sistem otomatis dengan modular integration di masa depan!**