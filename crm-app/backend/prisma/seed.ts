import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create branches
  const branch1 = await prisma.branch.upsert({
    where: { code: 'HQ' },
    update: {},
    create: {
      name: 'Headquarters',
      code: 'HQ',
      address: 'Jakarta, Indonesia',
      phone: '+628123456789',
    },
  });

  const branch2 = await prisma.branch.upsert({
    where: { code: 'SBY' },
    update: {},
    create: {
      name: 'Surabaya Branch',
      code: 'SBY',
      address: 'Surabaya, Indonesia',
      phone: '+628123456790',
    },
  });

  // Hash password
  const hashedPassword = await bcrypt.hash('admin123', 12);

  // Create super admin user
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@crm.com' },
    update: {},
    create: {
      email: 'admin@crm.com',
      password: hashedPassword,
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      branchId: branch1.id,
      evolutionInstance: 'admin-instance',
    },
  });

  // Create regular users
  const user1 = await prisma.user.upsert({
    where: { email: 'user1@crm.com' },
    update: {},
    create: {
      email: 'user1@crm.com',
      password: hashedPassword,
      name: 'User One',
      role: 'USER',
      branchId: branch1.id,
      evolutionInstance: 'user1-instance',
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: 'user2@crm.com' },
    update: {},
    create: {
      email: 'user2@crm.com',
      password: hashedPassword,
      name: 'User Two',
      role: 'USER',
      branchId: branch2.id,
      evolutionInstance: 'user2-instance',
    },
  });

  // Create sample contacts
  const contacts = [
    { name: 'John Doe', phone: '+628123456791', userId: user1.id, branchId: branch1.id },
    { name: 'Jane Smith', phone: '+628123456792', userId: user1.id, branchId: branch1.id },
    { name: 'Bob Wilson', phone: '+628123456793', userId: user1.id, branchId: branch1.id },
    { name: 'Alice Brown', phone: '+628123456794', userId: user2.id, branchId: branch2.id },
    { name: 'Charlie Davis', phone: '+628123456795', userId: user2.id, branchId: branch2.id },
  ];

  for (const contactData of contacts) {
    await prisma.contact.upsert({
      where: { 
        userId_phone: {
          userId: contactData.userId,
          phone: contactData.phone,
        }
      },
      update: {},
      create: contactData,
    });
  }

  // Create message templates
  const templates = [
    {
      name: 'Welcome Message',
      content: 'Halo {{name}}! Selamat datang di layanan kami.',
      userId: user1.id,
    },
    {
      name: 'Promotional Offer',
      content: 'Hai {{name}}! Jangan lewatkan promo spesial kami. Hubungi kami sekarang!',
      userId: user1.id,
    },
    {
      name: 'Reminder',
      content: 'Halo {{name}}, ini adalah pengingat untuk acara besok pukul 14:00.',
      userId: user2.id,
    },
  ];

  for (const templateData of templates) {
    await prisma.messageTemplate.create({
      data: templateData,
    });
  }

  // Create sample segments
  const segment1 = await prisma.segment.create({
    data: {
      name: 'Active Contacts',
      description: 'Contacts yang sering aktif',
      filterCriteria: {
        isVerified: true,
        isBlocked: false,
      },
    },
  });

  // Create default system settings
  const settings = [
    {
      key: 'app.name',
      value: 'CRM Multi-User & Multi-Channel',
      description: 'Application name',
      isPublic: true,
    },
    {
      key: 'whatsapp.defaultDelay',
      value: 5000,
      description: 'Default delay between WhatsApp messages (milliseconds)',
      isPublic: false,
    },
    {
      key: 'whatsapp.maxRetries',
      value: 3,
      description: 'Maximum retry attempts for failed messages',
      isPublic: false,
    },
    {
      key: 'features.autoContactDetection',
      value: true,
      description: 'Enable automatic contact detection',
      isPublic: false,
    },
  ];

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }

  console.log('✅ Database seeded successfully!');
  console.log('');
  console.log('👤 Users created:');
  console.log(`   - Super Admin: admin@crm.com (password: admin123)`);
  console.log(`   - User 1: user1@crm.com (password: admin123)`);
  console.log(`   - User 2: user2@crm.com (password: admin123)`);
  console.log('');
  console.log('🏢 Branches:');
  console.log(`   - ${branch1.name} (${branch1.code})`);
  console.log(`   - ${branch2.name} (${branch2.code})`);
  console.log('');
  console.log('📱 ${contacts.length} sample contacts created');
  console.log('📝 ${templates.length} message templates created');
  console.log('🎯 1 sample segment created');
  console.log('⚙️ System settings configured');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });