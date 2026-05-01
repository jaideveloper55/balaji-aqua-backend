import { PrismaClient, Role, CompanyType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // ─── 1. CREATE THE TWO COMPANIES ──────────────────────────────────────
  const waterPlant = await prisma.company.upsert({
    where: { email: 'orders@balaji.com' },
    update: {},
    create: {
      name: 'Sri Balaji Aqua Water',
      type: CompanyType.WATER_PLANT,
      email: 'orders@balaji.com',
      phone: '+91 98765 43210',
      address: '12 Gandhi Street, RS Puram',
      city: 'Coimbatore',
      state: 'Tamil Nadu',
      gstNumber: '33AABCU9603R1ZX',
      isActive: true,
    },
  });
  console.log(`✅ Company: ${waterPlant.name}`);
  console.log(`   id: ${waterPlant.id}\n`);

  const beverages = await prisma.company.upsert({
    where: { email: 'orders@royalbeverage.com' },
    update: {},
    create: {
      name: 'Royal Beverages',
      type: CompanyType.BEVERAGE,
      email: 'orders@royalbeverage.com',
      phone: '+91 98765 43211',
      address: '12 Gandhi Street, RS Puram',
      city: 'Coimbatore',
      state: 'Tamil Nadu',
      gstNumber: '33AABCU9603R2ZY',
      isActive: true,
    },
  });
  console.log(`✅ Company: ${beverages.name}`);
  console.log(`   id: ${beverages.id}\n`);

  // ─── 2. CREATE SUPER ADMIN ────────────────────────────────────────────
  // Use env vars if set, otherwise fall back to safe defaults
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'jai@balaji.com';
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'ChangeMe@123';

  // Safety check — should never trigger because of fallbacks above,
  // but TypeScript doesn't know that. This narrows the type AND protects
  // against someone passing empty strings via env.
  if (!superAdminEmail || !superAdminPassword) {
    throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set');
  }

  const hashedPassword = await bcrypt.hash(superAdminPassword, 12);

  const superAdmin = await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {},
    create: {
      email: superAdminEmail,
      password: hashedPassword,
      firstName: 'Deva',
      lastName: 'Balaji',
      phone: '+91 98765 43210',
      role: Role.SUPER_ADMIN,
      isActive: true,
    },
  });
  console.log(`✅ Super Admin: ${superAdmin.email}`);
  console.log(`   id: ${superAdmin.id}\n`);

  // ─── 3. LINK SUPER ADMIN TO BOTH COMPANIES ────────────────────────────
  await prisma.userCompany.upsert({
    where: {
      userId_companyId: { userId: superAdmin.id, companyId: waterPlant.id },
    },
    update: {},
    create: { userId: superAdmin.id, companyId: waterPlant.id },
  });

  await prisma.userCompany.upsert({
    where: {
      userId_companyId: { userId: superAdmin.id, companyId: beverages.id },
    },
    update: {},
    create: { userId: superAdmin.id, companyId: beverages.id },
  });

  console.log(`✅ Linked super admin to both companies\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 Seed complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Login email:    ${superAdminEmail}`);
  console.log(`  Login password: ${superAdminPassword}`);
  console.log('  ⚠️  Change this password after first login!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
