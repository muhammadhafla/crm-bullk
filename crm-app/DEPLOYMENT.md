# CRM Multi-Tenant Deployment Guide

This guide provides step-by-step instructions for deploying the CRM system with multi-tenant support, Evolution API integration, and enhanced security features.

## Prerequisites

- Node.js 18+ and npm/pnpm
- PostgreSQL 13+
- Redis 6+
- Evolution API instance
- SSL certificate (for production)

## Environment Setup

### 1. Database Setup

```bash
# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql
CREATE DATABASE crm_db;
CREATE USER crm_user WITH ENCRYPTED PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE crm_db TO crm_user;
```

### 2. Redis Setup

```bash
# Install Redis
sudo apt install redis-server

# Start Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

### 3. Environment Configuration

Copy and configure environment variables:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Database
DATABASE_URL="postgresql://crm_user:password@localhost:5432/crm_db?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# Security (CRITICAL: Use strong, unique values)
JWT_SECRET="your-super-secret-jwt-key-256-bits-minimum"
MASTER_KEY="your-32-byte-master-key-for-encryption-exactly-32-chars"

# Server
PORT=3001
HOST="0.0.0.0"
NODE_ENV="production"

# CORS (configure for your domain)
CORS_ORIGIN="https://yourdomain.com"
SOCKET_IO_CORS_ORIGIN="https://yourdomain.com"
```

## Backend Deployment

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Database Migration

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed initial data (optional)
npm run db:seed
```

### 3. Build Application

```bash
npm run build
```

### 4. Start Backend Server

#### Option A: Direct Node.js (Development)
```bash
npm run dev
```

#### Option B: PM2 (Production)
```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start dist/main.js --name "crm-api" --instances max
pm2 startup
pm2 save
```

#### Option C: Systemd Service

Create `/etc/systemd/system/crm-api.service`:

```ini
[Unit]
Description=CRM API Server
After=network.target

[Service]
Type=simple
User=crm
WorkingDirectory=/path/to/crm-app/backend
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/path/to/crm-app/backend/.env

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable crm-api
sudo systemctl start crm-api
```

## Worker Deployment

The bulk messaging worker runs separately from the API server.

### 1. Worker Script

Create `/path/to/crm-app/backend/src/worker.ts`:

```typescript
import { BulkMessageWorker } from './workers/bulkWorker';
import { TenantJobLimiter } from './utils/rateLimiter';
import { createClient } from 'redis';
import { PrismaClient } from '@prisma/client';

async function startWorker() {
  const redis = createClient({ url: process.env.REDIS_URL });
  const prisma = new PrismaClient();
  const tenantJobLimiter = new TenantJobLimiter(redis);

  const worker = new BulkMessageWorker({
    redis,
    prisma,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5'),
    maxRetries: parseInt(process.env.WORKER_MAX_RETRIES || '3'),
    tenantJobLimiter,
  });

  console.log('🚀 Bulk message worker started');

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('🛑 Shutting down worker...');
    await worker.close();
    await redis.disconnect();
    await prisma.$disconnect();
    process.exit(0);
  });
}

startWorker().catch(console.error);
```

### 2. Worker PM2 Configuration

```bash
# Start worker with PM2
pm2 start src/worker.ts --name "crm-worker" --interpreter tsx
```

### 3. Worker Systemd Service

Create `/etc/systemd/system/crm-worker.service`:

```ini
[Unit]
Description=CRM Bulk Message Worker
After=network.target crm-api.service

[Service]
Type=simple
User=crm
WorkingDirectory=/path/to/crm-app/backend
ExecStart=/usr/bin/npx tsx src/worker.ts
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/path/to/crm-app/backend/.env

[Install]
WantedBy=multi-user.target
```

## Frontend Deployment

### 1. Build Frontend

```bash
cd frontend
npm install
npm run build
```

### 2. Serve Static Files

#### Option A: Nginx

Install and configure Nginx:

```bash
sudo apt install nginx
```

Create `/etc/nginx/sites-available/crm`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;

    # Frontend
    location / {
        root /path/to/crm-app/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket proxy
    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### Option B: Serve with Node.js

```bash
npm install -g serve
serve -s dist -l 3000
```

## SSL/TLS Configuration

### Let's Encrypt (Recommended)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## Monitoring and Logging

### 1. PM2 Monitoring

```bash
# Monitor all processes
pm2 monit

# View logs
pm2 logs crm-api
pm2 logs crm-worker

# Restart processes
pm2 restart all

# View status
pm2 status
```

### 2. Log Rotation

Create `/etc/logrotate.d/crm`:

```
/var/log/crm/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 crm crm
    postrotate
        pm2 reloadLogs
    endscript
}
```

### 3. Health Checks

Add to your monitoring system:

```bash
# API health
curl -f http://localhost:3001/health

# Worker health (custom endpoint)
curl -f http://localhost:3001/worker/status
```

## Backup Strategy

### 1. Database Backup

```bash
#!/bin/bash
# backup-db.sh
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -h localhost -U crm_user crm_db > /backups/crm_db_$DATE.sql
gzip /backups/crm_db_$DATE.sql

# Keep only last 30 days
find /backups -name "crm_db_*.sql.gz" -mtime +30 -delete
```

### 2. Redis Backup

```bash
# RDB snapshot (automatic)
# Custom backup script
redis-cli BGSAVE
cp /var/lib/redis/dump.rdb /backups/redis_$DATE.rdb
```

### 3. Automated Backups

```bash
# Add to crontab
0 2 * * * /path/to/backup-db.sh
```

## Security Checklist

- [ ] Strong JWT_SECRET (minimum 256 bits)
- [ ] Strong MASTER_KEY (exactly 32 bytes for AES-256)
- [ ] HTTPS enforced in production
- [ ] Database user with minimal privileges
- [ ] Redis password configured
- [ ] Firewall configured (only ports 80, 443, 22 open)
- [ ] Regular security updates
- [ ] Rate limiting enabled
- [ ] Input validation on all endpoints
- [ ] Evolution API credentials encrypted
- [ ] Audit logging enabled

## Troubleshooting

### Common Issues

1. **Worker not processing jobs**
   - Check Redis connection
   - Verify worker is running: `pm2 status`
   - Check logs: `pm2 logs crm-worker`

2. **Database connection errors**
   - Verify PostgreSQL is running
   - Check DATABASE_URL in .env
   - Test connection: `psql $DATABASE_URL`

3. **Evolution API connection fails**
   - Verify Evolution API is running
   - Check credentials in user settings
   - Test connection: `/api/v1/auth/evolution/test`

4. **Rate limiting issues**
   - Check Redis connection
   - Verify rate limiter configuration
   - Monitor rate limit headers

### Logs Location

- PM2 logs: `~/.pm2/logs/`
- System logs: `/var/log/syslog`
- Nginx logs: `/var/log/nginx/`

## Performance Optimization

### 1. Database
- Configure connection pooling
- Add indexes for frequent queries
- Regular VACUUM and ANALYZE

### 2. Redis
- Configure maxmemory policy
- Enable persistence if needed

### 3. Application
- Enable gzip compression
- Configure CDN for static assets
- Monitor memory usage

## Scaling Considerations

### Horizontal Scaling
- Use load balancer (Nginx, HAProxy)
- Shared Redis cluster for rate limiting
- Database read replicas

### Vertical Scaling
- Monitor CPU and memory usage
- Optimize worker concurrency
- Tune database configuration