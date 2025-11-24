## 🗃️ 4️⃣ Environment Setup (Tanpa Docker)

### 🔹 **1. Jalankan Redis**
**Windows (PowerShell / CMD):**
```bash
redis-server

WSL / Ubuntu:
sudo service redis-server start

Cek status:
redis-cli ping
# -> PONG


🔹 2. Setup Backend
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev
npm run dev

Contoh .env
DATABASE_URL="postgresql://user:password@localhost:5432/crm"
JWT_SECRET="supersecretjwt"
REDIS_URL="redis://localhost:6379"
PORT=3001


🔹 3. Setup Frontend
cd frontend
npm install
npm run dev

Akses di browser:
👉 http://localhost:5173
