# 🧭 CRM Multi-User & Multi-Channel (Redis Edition)

**Fokus:** WhatsApp (Evolution API) dengan Bulk Messaging Delay dan Auto Contact Mapping  
**Versi:** 1.2 (Redis + Non-Docker)

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis 6+

### Installation

1. **Clone dan install dependencies:**
```bash
cd crm-app
cd backend && npm install
cd ../frontend && npm install
```

2. **Setup environment:**
```bash
# Backend
cd backend
cp .env.example .env
# Edit .env with your database and Redis credentials

# Frontend  
cd ../frontend
cp .env.example .env
```

3. **Setup database:**
```bash
cd backend
npx prisma generate
npx prisma db push
npx prisma db seed
```

4. **Start development:**
```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend  
cd frontend && npm run dev
```

## 🏗️ Architecture

```
crm-app/
├── backend/           # Fastify + TypeScript API
├── frontend/          # SvelteKit + Tailwind UI
└── README.md
```

## 📚 Documentation

- [API Documentation](./backend/docs/API.md)
- [Database Schema](./backend/docs/SCHEMA.md)
- [Setup Guide](./backend/docs/SETUP.md)

---

**Built with ❤️ for multi-channel CRM automation**