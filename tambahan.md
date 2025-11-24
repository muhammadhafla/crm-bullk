1. Tujuan singkat

Setiap user (tenant) punya dataset terisolasi (kontak, campaign, bulk items).
Autentikasi aman (login/register) + proteksi rute API.
Evolution API credentials disimpan per user & hanya dipakai untuk job milik user itu.
Worker/queue (BullMQ) memproses job dengan konteks tenant sehingga aman dan bisa di-audit.
Kemampuan pause/resume/retry per tenant dan limit concurrency per tenant.


2. Perubahan skema Prisma (tambahan & penjelasan)
Tambahan fields kecil pada User dan index untuk performa:
model User {
  id               Int       @id @default(autoincrement())
  name             String
  email            String    @unique
  passwordHash     String
  role             String    @default("user") // user | admin
  evolutionUrl     String?   // base URL Evolution API user (nullable)
  instanceName     String?   // instance name
  evolutionApiKey  String?   // stored encrypted (see notes)
  isActive         Boolean   @default(true)
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  contacts         Contact[]
  bulkMessages     BulkMessage[]
}

model Contact {
  id        Int       @id @default(autoincrement())
  tenantId  Int       // references User.id
  name      String
  number    String
  channels  Channel[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([tenantId])
  @@unique([tenantId, number]) // nomor unik per tenant
}

Catatan:

Gunakan @@unique([tenantId, number]) agar nomor telepon hanya unik dalam scope tenant.
Simpan credential Evolution (evolutionApiKey) dalam bentuk terenkripsi (lihat Security).


3. Auth flow & pilihan (rekomendasi)
Rekomendasi: JWT access token + refresh token (httpOnly cookie) atau session cookie. Untuk simplicity dan keamanan di web, aku rekomendasikan:

accessToken (JWT), singkat masa hidup (15–60 menit).
refreshToken (long-lived), disimpan di DB hashed, dikirim sebagai httpOnly cookie.
Endpoint: /auth/register, /auth/login, /auth/refresh, /auth/logout.

Libraries:

fastify-jwt untuk JWT.
bcrypt untuk password hashing.
crypto / libs untuk enkripsi API keys (optional).
prisma untuk DB.

Contoh register/login (Fastify, TypeScript — potongan)
// register handler
app.post('/api/auth/register', async (req, reply) => {
  const { name, email, password } = req.body;
  const hash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { name, email, passwordHash: hash } });
  reply.code(201).send({ id: user.id, email: user.email });
});

// login handler
app.post('/api/auth/login', async (req, reply) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return reply.code(401).send({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return reply.code(401).send({ error: 'Invalid credentials' });

  const accessToken = app.jwt.sign({ userId: user.id, tenantId: user.id, role: user.role }, { expiresIn: '30m' });
  const refreshToken = crypto.randomBytes(64).toString('hex');
  // store hashed refresh token
  await prisma.refreshToken.create({ data: { userId: user.id, tokenHash: hash(refreshToken) }});

  reply.setCookie('refreshToken', refreshToken, { httpOnly: true, path: '/api/auth/refresh' });
  reply.send({ accessToken });
});


4. Middleware: enforce tenant context & ownership
Buat middleware yang memakai req.user hasil decode JWT. Semua query Prisma wajib menyertakan tenantId (biasakan tenantId = req.user.userId). Contoh helper:
// auth middleware (Fastify)
app.decorate("verifyJWT", async (req, reply) => {
  try {
    const decoded = app.jwt.verify(req.headers.authorization?.split(" ")[1] || "");
    req.user = { id: decoded.userId, role: decoded.role };
  } catch (e) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
});

// usage in route
app.get('/api/contacts', { preHandler: app.verifyJWT }, async (req, reply) => {
  const tenantId = req.user.id;
  const contacts = await prisma.contact.findMany({ where: { tenantId } });
  reply.send(contacts);
});

Rules:

tenantId selalu berasal dari token, jangan ambil dari body/query param.
Validasi role (admin vs user) pada rute sensitif.


5. Worker / Queue: context-aware jobs (BullMQ)
Pastikan semua job menyertakan: tenantId, userId (pemicu), itemId. Worker hanya akan memproses job dan menggunakan tenantId untuk mengambil API credentials.
Contoh enqueue (server):
await bulkQueue.add('sendMessage', {
  tenantId: user.id,
  userId: user.id,
  itemId: item.id
}, { delay: computedDelay });

Worker handler (safety):
new Worker('bulkQueue', async job => {
  const { tenantId, itemId } = job.data;
  // ambil user / cred
  const user = await prisma.user.findUnique({ where: { id: tenantId } });
  if (!user?.evolutionApiKey) throw new Error('No Evolution API key');

  // lakukan panggilan send dengan user.evolutionApiKey
  await sendWhatsAppWithUserCred(user, item);
}, { connection: redisConnection, concurrency: 5 });

Rekomendasi:

Set concurrency worker global dan rate-limiting per tenant jika perlu.
Gunakan job attempts & backoff untuk retry otomatis.
Simpan audit log (job id, tenantId, timestamp, result).


6. Penyimpanan & enkripsi API keys
Evolution API key adalah sensitive. Opsi penyimpanan:


Encrypted in DB

Gunakan crypto (AES-GCM) dengan master key dari environment variable (APP_SECRET).
Simpan ciphertext di User.evolutionApiKey.



External secret store (lebih aman)

HashiCorp Vault, AWS KMS/SecretsManager — jika tersedia.



Contoh encrypt/decrypt util (Node):
import crypto from 'crypto';
const ALGO = 'aes-256-gcm';
const MASTER_KEY = process.env.MASTER_KEY; // 32 bytes

export function encrypt(text: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, Buffer.from(MASTER_KEY, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(str: string) {
  const [ivHex, tagHex, encHex] = str.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, Buffer.from(MASTER_KEY,'hex'), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return dec.toString('utf8');
}


7. Per-tenant rate limiting & fair queueing
Untuk menghindari satu tenant menghabiskan resource atau memicu ban:

Terapkan rate limiter di API /bulk/send (per tenant limit, misal max 1 request per 10 detik).
Di BullMQ, gunakan limiter per queue atau buat queue per tenant jika perlu:

Queue global + limiter job options: BullMQ mendukung limiter di job options.
Queue per tenant: kalau jumlah tenant kecil, per-tenant queue memudahkan isolasi.



Contoh limiter di BullMQ:
const bulkQueue = new Queue('bulkQueue', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: true,
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 }
  }
});


8. UI & Settings per Tenant
Frontend: setiap user punya halaman Settings untuk:

Mengisi evolutionUrl, apiKey, instanceName (dengan form yang memvalidasi).
Tombol Test Connection yang memanggil /api/evolution/test.
Opsi autoCreateInstance (jika ingin backend membuat instance Evolution otomatis).

Contoh API test:
app.get('/api/evolution/test', { preHandler: app.verifyJWT }, async (req, reply) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }});
  // decrypt key jika terenkripsi
  const apiKey = decrypt(user.evolutionApiKey);
  const res = await fetch(`${user.evolutionUrl}/status/${user.instanceName}`, { headers: { apikey: apiKey }});
  if (!res.ok) return reply.code(400).send({ ok: false });
  return reply.send({ ok: true });
});


9. Audit, Logging & Error Handling

Simpan log hasil pengiriman di tabel MessageLog (tenantId, itemId, status, response raw, timestamp).
Worker harus menulis lastError ke BulkItem dan menyimpan full response ke MessageLog.
Gunakan centralized logger (pino/winston) dan simpan rotate file.
Aktifkan alerts jika error rate tinggi.

Contoh MessageLog:
model MessageLog {
  id        Int      @id @default(autoincrement())
  tenantId  Int
  itemId    Int?
  number    String
  status    String
  response  Json?
  createdAt DateTime @default(now())
}


10. Backup & Restore per-tenant

Backup DB regular (pg_dump). Untuk restore per-tenant, sediakan script untuk export data berdasarkan tenantId.
Untuk Evolution credentials, backup aman (encrypted backups).

Contoh export per-tenant:
COPY (
  SELECT json_agg(row_to_json(t))
  FROM (SELECT * FROM contact WHERE tenantId = 123) t
) TO STDOUT;


11. Testing & QA

Unit tests: authentication, middleware tenant filtering, services (Prisma mocks).
Integration tests: enqueue job → worker processes → DB status updated.
Load testing: pastikan worker concurrency + rate limiter memadai (kamu bisa gunakan k6 atau hey).


12. Deployment tanpa Docker (checklist)

Install Node.js & npm/pnpm.
Setup PostgreSQL (service) & create DB + user.
Setup Redis (service).
Copy .env (set MASTER_KEY, DATABASE_URL, REDIS_URL, JWT_SECRET).
npm install backend, npx prisma migrate deploy.
Build & run worker: npm run build && node dist/queue/index.js (jalankan terpisah).
Run backend (pm2 recommended): pm2 start dist/main.js --name crm-api.
Frontend: npm run build + serve static (Vite preview or nginx).
Setup firewall / reverse proxy (nginx) untuk TLS.


13. Security checklist (penting)

Enforce HTTPS (TLS).
httpOnly cookies untuk refresh token.
Rate limit endpoints (auth, bulk).
Encrypt Evolution API keys at rest.
Rotate MASTER_KEY at maintenance windows (implement key-versioning if memungkinkan).
Least privilege DB user.
Audit logs for credential changes.


14. Summary tindakan selanjutnya (practical steps)

Tambah fields encrypt/decrypt pada User & implement util encrypt/decrypt.
Implement register/login + refresh token logic (Fastify + Prisma + bcrypt + fastify-jwt).
Buat middleware verifyJWT & helper tenantAwareQuery / services yang selalu menyertakan tenantId.
Modifikasi enqueue logic agar selalu menyertakan tenantId dan userId.
Pastikan worker mengambil credential via decrypt dan menulis MessageLog.
Implement UI Settings untuk Evolution credentials + tombol Test Connection.
Implement rate limiter & job limiter (per tenant).
Tulis tests: auth, tenant middleware, enqueue & worker flow.

