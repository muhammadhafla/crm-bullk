# CRM Multi-Tenant Testing Guide

This guide covers testing strategies for the enhanced CRM system with multi-tenant support, Evolution API integration, and security features.

## Testing Categories

### 1. Unit Tests

#### Authentication & Authorization
```typescript
// tests/auth.test.ts
describe('Authentication', () => {
  test('should register user with valid data', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      });
    
    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe('test@example.com');
    expect(response.body.accessToken).toBeDefined();
  });

  test('should reject registration with duplicate email', async () => {
    await createTestUser();
    
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User 2'
      });
    
    expect(response.status).toBe(400);
  });

  test('should login with valid credentials', async () => {
    const user = await createTestUser();
    
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: user.email,
        password: 'password123'
      });
    
    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeDefined();
    expect(response.body.user.evolutionUrl).toBeDefined();
  });
});
```

#### Encryption Utilities
```typescript
// tests/encryption.test.ts
describe('Encryption Utilities', () => {
  beforeEach(() => {
    process.env.MASTER_KEY = 'test-32-byte-master-key-for-testing-purposes';
  });

  test('should encrypt and decrypt Evolution API key', () => {
    const originalKey = 'test-evolution-api-key';
    const encrypted = encrypt(originalKey);
    const decrypted = decryptEvolutionApiKey(encrypted);
    
    expect(encrypted).not.toBe(originalKey);
    expect(decrypted).toBe(originalKey);
  });

  test('should generate and hash refresh tokens', () => {
    const token = generateRefreshToken();
    const hashed = hashRefreshToken(token);
    
    expect(token).toHaveLength(128); // 64 bytes * 2 (hex)
    expect(hashed).toHaveLength(64); // 32 bytes * 2 (SHA-256 hex)
    expect(hashed).not.toBe(token);
  });

  test('should encrypt Evolution credentials', () => {
    const credentials = {
      url: 'https://evolution.example.com',
      apiKey: 'test-api-key',
      instanceName: 'test-instance'
    };
    
    const encrypted = encryptEvolutionCredentials(
      credentials.url,
      credentials.apiKey,
      credentials.instanceName
    );
    
    expect(encrypted.evolutionUrl).toBe(credentials.url);
    expect(encrypted.evolutionApiKey).not.toBe(credentials.apiKey);
    expect(encrypted.instanceName).toBe(credentials.instanceName);
  });
});
```

#### Rate Limiter
```typescript
// tests/rateLimiter.test.ts
describe('Rate Limiter', () => {
  let redis: Redis;
  
  beforeEach(async () => {
    redis = new Redis(process.env.REDIS_URL);
    await redis.flushall();
  });

  test('should allow requests within limit', async () => {
    const limiter = new TenantJobLimiter(redis);
    
    // First request should be allowed
    const canEnqueue1 = await limiter.canEnqueue('tenant1');
    expect(canEnqueue1).toBe(true);
    
    // Mark as active
    await limiter.markJobActive('tenant1', 'job1');
    
    // Second request should be blocked due to concurrency
    const canEnqueue2 = await limiter.canEnqueue('tenant1');
    expect(canEnqueue2).toBe(false);
  });

  test('should track active jobs per tenant', async () => {
    const limiter = new TenantJobLimiter(redis);
    await limiter.markJobActive('tenant1', 'job1');
    await limiter.markJobActive('tenant1', 'job2');
    
    const stats = await limiter.getTenantStats('tenant1');
    expect(stats.activeJobs).toBe(2);
    expect(stats.canEnqueue).toBe(false);
  });
});
```

### 2. Integration Tests

#### Tenant Isolation
```typescript
// tests/tenantIsolation.test.ts
describe('Tenant Isolation', () => {
  test('users should only see their own data', async () => {
    const tenant1Token = await loginAsTenant('tenant1@example.com');
    const tenant2Token = await loginAsTenant('tenant2@example.com');
    
    // Tenant 1 creates campaign
    const campaign1 = await request(app)
      .post('/api/v1/bulk/campaign')
      .set('Authorization', `Bearer ${tenant1Token}`)
      .send({ name: 'Tenant 1 Campaign' });
    
    // Tenant 2 tries to access tenant 1's campaign
    const response = await request(app)
      .get(`/api/v1/bulk/campaign/${campaign1.body.id}/status`)
      .set('Authorization', `Bearer ${tenant2Token}`);
    
    expect(response.status).toBe(404);
  });

  test('Evolution API credentials should be isolated per tenant', async () => {
    const tenant1Token = await loginAsTenant('tenant1@example.com');
    
    // Set Evolution API credentials for tenant 1
    await request(app)
      .put('/api/v1/auth/evolution/credentials')
      .set('Authorization', `Bearer ${tenant1Token}`)
      .send({
        evolutionUrl: 'https://evolution1.example.com',
        evolutionApiKey: 'tenant1-key',
        instanceName: 'tenant1-instance'
      });
    
    // Tenant 1 should see their credentials (encrypted)
    const profile1 = await request(app)
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${tenant1Token}`);
    
    expect(profile1.body.evolutionUrl).toBe('https://evolution1.example.com');
    expect(profile1.body.evolutionApiKey).toBeDefined();
    
    // Another tenant should not see tenant 1's credentials
    const tenant2Token = await loginAsTenant('tenant2@example.com');
    const profile2 = await request(app)
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${tenant2Token}`);
    
    expect(profile2.body.evolutionUrl).toBeNull();
  });
});
```

#### Bulk Messaging with Worker
```typescript
// tests/bulkMessaging.test.ts
describe('Bulk Messaging Integration', () => {
  test('should process bulk messages with tenant context', async () => {
    const tenantToken = await loginAsTenant('tenant@example.com');
    
    // Create contacts
    const contacts = await createTestContacts(tenantToken);
    
    // Create campaign
    const campaign = await request(app)
      .post('/api/v1/bulk/campaign')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        name: 'Test Campaign',
        messageTemplate: {
          content: 'Hello {{name}}!'
        }
      });
    
    // Send bulk messages
    const response = await request(app)
      .post('/api/v1/bulk/send')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        campaignId: campaign.body.id,
        contacts: contacts.map(c => ({ id: c.id, phone: c.phone, name: c.name })),
        messageTemplate: {
          content: 'Hello {{name}}!'
        }
      });
    
    expect(response.status).toBe(200);
    expect(response.body.totalMessages).toBe(contacts.length);
    
    // Wait for worker to process
    await waitFor(async () => {
      const status = await request(app)
        .get(`/api/v1/bulk/campaign/${campaign.body.id}/status`)
        .set('Authorization', `Bearer ${tenantToken}`);
      
      return status.body.statistics.sent > 0;
    }, 10000);
  });

  test('should enforce rate limiting per tenant', async () => {
    const tenantToken = await loginAsTenant('tenant@example.com');
    
    // First bulk send should succeed
    const response1 = await request(app)
      .post('/api/v1/bulk/send')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send(testBulkSendData);
    
    expect(response1.status).toBe(200);
    
    // Second bulk send immediately should be rate limited
    const response2 = await request(app)
      .post('/api/v1/bulk/send')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send(testBulkSendData);
    
    expect(response2.status).toBe(429);
    expect(response2.body.error).toBe('Too Many Requests');
  });
});
```

### 3. API Tests

#### Evolution API Integration
```typescript
// tests/evolutionAPI.test.ts
describe('Evolution API Integration', () => {
  test('should test Evolution API connection', async () => {
    const tenantToken = await loginAsTenant('tenant@example.com');
    
    // Set valid Evolution API credentials
    await request(app)
      .put('/api/v1/auth/evolution/credentials')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        evolutionUrl: 'https://evolution.example.com',
        evolutionApiKey: 'valid-api-key',
        instanceName: 'test-instance'
      });
    
    // Test connection
    const response = await request(app)
      .get('/api/v1/auth/evolution/test')
      .set('Authorization', `Bearer ${tenantToken}`);
    
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  test('should reject invalid Evolution API credentials', async () => {
    const tenantToken = await loginAsTenant('tenant@example.com');
    
    // Set invalid Evolution API credentials
    await request(app)
      .put('/api/v1/auth/evolution/credentials')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        evolutionUrl: 'https://evolution.example.com',
        evolutionApiKey: 'invalid-key',
        instanceName: 'test-instance'
      });
    
    // Test connection should fail
    const response = await request(app)
      .get('/api/v1/auth/evolution/test')
      .set('Authorization', `Bearer ${tenantToken}`);
    
    expect(response.status).toBe(400);
    expect(response.body.ok).toBe(false);
  });
});
```

### 4. Load Testing

#### Campaign Load Test
```javascript
// load-tests/campaign-load.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp up
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 200 }, // Ramp to 200 users
    { duration: '5m', target: 200 }, // Stay at 200 users
    { duration: '2m', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests must complete below 2s
    http_req_failed: ['rate<0.1'],     // Error rate must be below 10%
  },
};

const BASE_URL = 'http://localhost:3001';

export default function() {
  // Login
  const loginResponse = http.post(`${BASE_URL}/api/v1/auth/login`, {
    email: 'test@example.com',
    password: 'password123'
  });
  
  check(loginResponse, {
    'login successful': (r) => r.status === 200,
  });
  
  const token = loginResponse.json('accessToken');
  
  // Create campaign
  const campaignResponse = http.post(`${BASE_URL}/api/v1/bulk/campaign`, {
    name: `Load Test Campaign ${Date.now()}`,
    messageTemplate: {
      content: 'Hello {{name}} from load test!'
    }
  }, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  check(campaignResponse, {
    'campaign created': (r) => r.status === 201,
  });
  
  const campaignId = campaignResponse.json('id');
  
  // Send bulk messages
  const bulkResponse = http.post(`${BASE_URL}/api/v1/bulk/send`, {
    campaignId: campaignId,
    contacts: generateTestContacts(100),
    messageTemplate: {
      content: 'Hello {{name}}!'
    }
  }, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  check(bulkResponse, {
    'bulk send initiated': (r) => r.status === 200,
  });
  
  sleep(1);
}

function generateTestContacts(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `test-contact-${i}`,
    phone: `+1234567890${i.toString().padStart(3, '0')}`,
    name: `Test Contact ${i}`
  }));
}
```

#### Rate Limiting Load Test
```javascript
// load-tests/rate-limit.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 50 },
  ],
};

const BASE_URL = 'http://localhost:3001';

export default function() {
  const tenantTokens = generateTenantTokens(10);
  const token = tenantTokens[Math.floor(Math.random() * tenantTokens.length)];
  
  // Test rate limiting on bulk endpoint
  const response = http.post(`${BASE_URL}/api/v1/bulk/send`, 
    testBulkData, 
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  check(response, {
    'status is 200 or 429': (r) => [200, 429].includes(r.status),
    'rate limited responses include headers': (r) => {
      if (r.status === 429) {
        return r.headers['X-RateLimit-Limit'] && r.headers['Retry-After'];
      }
      return true;
    },
  });
  
  sleep(0.1); // High frequency to test rate limiting
}

function generateTenantTokens(count) {
  return Array.from({ length: count }, (_, i) => `tenant-token-${i}`);
}

const testBulkData = {
  campaignId: 'test-campaign',
  contacts: [{ id: 'contact1', phone: '+1234567890' }],
  messageTemplate: { content: 'Test message' }
};
```

## Test Data Management

### Database Seeding
```typescript
// tests/helpers/db.ts
export async function seedTestData(prisma: PrismaClient) {
  // Create test tenants
  const tenants = await Promise.all([
    prisma.user.create({
      data: {
        email: 'tenant1@example.com',
        password: await bcrypt.hash('password123', 12),
        name: 'Tenant 1',
        evolutionUrl: 'https://evolution1.example.com',
        evolutionApiKey: encrypt('tenant1-key'),
        instanceName: 'tenant1-instance',
      },
    }),
    prisma.user.create({
      data: {
        email: 'tenant2@example.com',
        password: await bcrypt.hash('password123', 12),
        name: 'Tenant 2',
      },
    }),
  ]);

  // Create test contacts
  const contacts = [];
  for (let i = 0; i < 10; i++) {
    const contact = await prisma.contact.create({
      data: {
        name: `Test Contact ${i}`,
        phone: `+1234567890${i.toString().padStart(3, '0')}`,
        userId: tenants[0].id, // Assign to tenant 1
      },
    });
    contacts.push(contact);
  }

  return { tenants, contacts };
}
```

### Mock Services
```typescript
// tests/mocks/evolutionAPI.ts
export function mockEvolutionAPI() {
  const originalFetch = global.fetch;
  
  global.fetch = jest.fn().mockImplementation((url: string, options: any) => {
    if (url.includes('/status/')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          instance: {
            instanceName: 'test-instance',
            status: 'connected'
          }
        })
      });
    }
    
    if (url.includes('/message/sendText/')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          key: {
            fromMe: false,
            remoteJid: 'test@s.whatsapp.net'
          },
          message: {
            conversation: 'Test message'
          }
        })
      });
    }
    
    return originalFetch(url, options);
  });
}
```

## Continuous Integration

### GitHub Actions Workflow
```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:13
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: crm_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      redis:
        image: redis:6
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json

      - name: Install dependencies
        run: |
          cd backend
          npm ci

      - name: Run database migrations
        run: |
          cd backend
          npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/crm_test

      - name: Run unit tests
        run: |
          cd backend
          npm run test:unit

      - name: Run integration tests
        run: |
          cd backend
          npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/crm_test
          REDIS_URL: redis://localhost:6379
          JWT_SECRET: test-jwt-secret
          MASTER_KEY: test-32-byte-master-key-for-testing

      - name: Run load tests
        run: |
          cd load-tests
          npm install
          k6 run campaign-load.js
        env:
          BASE_URL: http://localhost:3001
```

## Performance Benchmarks

### Response Time Targets
- Authentication endpoints: < 200ms
- CRUD operations: < 300ms
- Bulk send initiation: < 500ms
- Campaign status: < 100ms
- Evolution API test: < 1000ms

### Throughput Targets
- Concurrent users: 1000+
- Messages per second: 100+
- Rate limit effectiveness: 95%+

## Security Testing

### Penetration Testing
```bash
# Test SQL injection
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@test.com\' OR 1=1 --", "password": "anything"}'

# Test XSS in message content
curl -X POST http://localhost:3001/api/v1/bulk/send \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messageContent": "<script>alert(\"xss\")</script>"}'

# Test rate limiting bypass
for i in {1..20}; do
  curl -X POST http://localhost:3001/api/v1/bulk/send \
    -H "Authorization: Bearer $TOKEN" \
    -d '{}' &
done
```

### Security Headers Testing
```bash
# Test security headers
curl -I http://localhost:3001/health

# Expected headers:
# X-Frame-Options: DENY
# X-Content-Type-Options: nosniff
# X-XSS-Protection: 1; mode=block
# Strict-Transport-Security: max-age=31536000
```

## Test Environment Setup

### Docker Compose for Testing
```yaml
# docker-compose.test.yml
version: '3.8'
services:
  postgres-test:
    image: postgres:13
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: crm_test
    ports:
      - "5433:5432"

  redis-test:
    image: redis:6
    ports:
      - "6380:6379"

  api-test:
    build: ./backend
    command: npm run test:watch
    ports:
      - "3002:3001"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres-test:5432/crm_test
      REDIS_URL: redis://redis-test:6379
      JWT_SECRET: test-secret
      MASTER_KEY: test-32-byte-master-key-for-testing
    depends_on:
      - postgres-test
      - redis-test
```

## Monitoring Test Results

### Test Metrics Dashboard
```typescript
// tests/metrics/reporter.ts
export class TestMetricsReporter {
  constructor(private prisma: PrismaClient) {}

  async reportTestResults(results: TestResult[]) {
    for (const result of results) {
      await this.prisma.testMetric.create({
        data: {
          testName: result.name,
          duration: result.duration,
          status: result.status,
          tenantId: result.tenantId,
          timestamp: new Date(),
        },
      });
    }
  }

  async getPerformanceTrends(days: number = 7) {
    return this.prisma.testMetric.groupBy({
      by: ['testName'],
      where: {
        timestamp: {
          gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
        },
      },
      _avg: {
        duration: true,
      },
      _count: {
        status: true,
      },
    });
  }
}
```

This testing guide ensures comprehensive coverage of all the enhanced features while maintaining security and performance standards.