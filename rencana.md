# 🧭 CRM MULTI-USER & MULTI-CHANNEL (Redis Edition)
**Fokus:** WhatsApp (Evolution API) dengan Bulk Messaging Delay dan Auto Contact Mapping  
**Versi:** 1.2 (Redis + Non-Docker)   

---

## ⚙️ 1️⃣ Tujuan Sistem
CRM ini dirancang untuk:
- Multi-user (setiap user/cabang memiliki data & instance Evolution API sendiri).
- Bulk messaging WhatsApp (beda penerima, beda pesan).
- Delay dan retry antar pesan untuk mengurangi risiko banned.
- Auto detect & prompt kontak baru.
- Modular untuk integrasi TikTok dan Telegram.
- Menggunakan **Redis + BullMQ** untuk antrean pengiriman pesan yang terkontrol.
- Dijalankan **tanpa Docker**, langsung via Node.js + Redis + PostgreSQL.

---

## 🧩 2️⃣ Stack Teknis

| Komponen | Teknologi | Catatan |
|-----------|------------|----------|
| **Frontend** | SvelteKit + Tailwind + shadcn/ui | UI ringan dan interaktif |
| **Backend** | Fastify (Node.js, TypeScript) | API cepat dan modular |
| **Database** | PostgreSQL (via Prisma ORM) | Multi-tenant data storage |
| **Queue System** | BullMQ + Redis | Delay, retry, dan status job |
| **Realtime** | Socket.IO | Status pengiriman realtime |
| **Auth** | JWT | Autentikasi antar user |
| **WA API** | Evolution API | Per-user instance |
| **Deployment** | Node.js + Redis service | Tidak perlu Docker |

---

## 🧱 3️⃣ Struktur Direktori


crm-app/
├─ backend/
│  ├─ src/
│  │  ├─ main.ts
│  │  ├─ routes/
│  │  │  ├─ auth.ts
│  │  │  ├─ contacts.ts
│  │  │  ├─ bulk.ts
│  │  │  └─ channels/
│  │  │     ├─ whatsapp.ts
│  │  │     ├─ telegram.ts
│  │  │     └─ tiktok.ts
│  │  ├─ services/
│  │  │  ├─ evolutionService.ts
│  │  │  ├─ contactService.ts
│  │  │  ├─ bulkService.ts
│  │  │  ├─ jobQueue.ts
│  │  │  └─ worker.ts
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma
│  │  └─ utils/
│  │     └─ helpers.ts
│  ├─ .env
│  ├─ package.json
│  └─ tsconfig.json
│
├─ frontend/
│  ├─ src/
│  │  ├─ routes/
│  │  │  ├─ login.svelte
│  │  │  ├─ dashboard.svelte
│  │  │  ├─ contacts.svelte
│  │  │  ├─ bulk/
│  │  │  │  ├─ index.svelte
│  │  │  │  └─ [id].svelte
│  │  ├─ lib/
│  │  │  ├─ api.ts
│  │  │  └─ socket.ts
│  │  └─ components/
│  │     ├─ BulkTable.svelte
│  │     ├─ AddContactModal.svelte
│  │     └─ StatusBadge.svelte
│  ├─ package.json
│  └─ vite.config.js
│
└─ README.md
