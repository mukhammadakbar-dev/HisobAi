import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

/**
 * Idempotent seed: bir necha marta ishlatilsa ham dublikat yaratmaydi.
 * Faqat tizim uchun zarur bo'lgan boshlang'ich yozuvlarni qo'yadi.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL majburiy — apps/api/.env faylini tekshiring');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** §11.10 — tizim kategoriyalari; yangisini admin qo'shishi mumkin. */
const CASH_CATEGORIES = [
  { slug: 'ijara', name: 'Ijara', direction: 'OUT' as const },
  { slug: 'kommunal', name: 'Kommunal', direction: 'OUT' as const },
  { slug: 'maosh', name: 'Maosh', direction: 'OUT' as const },
  { slug: 'reklama', name: 'Reklama', direction: 'OUT' as const },
  { slug: 'yetkazib-berish', name: 'Yetkazib berish', direction: 'OUT' as const },
  { slug: 'shaxsiy-foydalanish', name: 'Shaxsiy foydalanish', direction: 'OUT' as const },
  { slug: 'boshqa-chiqim', name: 'Boshqa chiqim', direction: 'OUT' as const },
  { slug: 'boshqa-kirim', name: 'Boshqa kirim', direction: 'IN' as const },
];

/** §11.1 — naqd va karta puli alohida hisoblarda yuritiladi. */
const CASH_ACCOUNTS = [
  { name: 'Naqd', currency: 'UZS' as const, kind: 'CASH' as const, sortOrder: 1 },
  { name: 'Naqd', currency: 'USD' as const, kind: 'CASH' as const, sortOrder: 2 },
  { name: 'Karta', currency: 'UZS' as const, kind: 'CARD' as const, sortOrder: 3 },
];

async function seedOwner(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn(
      'ADMIN_EMAIL / ADMIN_PASSWORD berilmagan — ega yaratilmadi. ' +
        ".env ga qo'yib qayta ishga tushiring.",
    );
    return;
  }

  // §2.4 — Argon2id
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      displayName: "Do'kon egasi",
      role: 'OWNER',
    },
  });
  console.log(`Ega tayyor: ${email}`);
}

async function seedSettings(): Promise<void> {
  // §3 — sozlamalar bitta qator (id = 1)
  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  console.log("Do'kon sozlamalari tayyor");
}

async function seedCashCategories(): Promise<void> {
  for (const category of CASH_CATEGORIES) {
    await prisma.cashCategory.upsert({
      where: { slug: category.slug },
      update: {},
      create: { ...category, isSystem: true },
    });
  }
  console.log(`Kassa kategoriyalari: ${CASH_CATEGORIES.length} ta`);
}

async function seedCashAccounts(): Promise<void> {
  for (const account of CASH_ACCOUNTS) {
    await prisma.cashAccount.upsert({
      where: { name_currency: { name: account.name, currency: account.currency } },
      update: {},
      create: account,
    });
  }
  console.log(`Kassa hisoblari: ${CASH_ACCOUNTS.length} ta`);
}

async function main(): Promise<void> {
  await seedSettings();
  await seedOwner();
  await seedCashCategories();
  await seedCashAccounts();
  console.log('Seed yakunlandi.');
}

main()
  .catch((error: unknown) => {
    console.error('Seed xatosi:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
