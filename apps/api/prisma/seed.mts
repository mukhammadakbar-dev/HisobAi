import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

/**
 * Idempotent seed: bir necha marta ishlatilsa ham dublikat yaratmaydi.
 * Faqat tizim uchun zarur bo'lgan boshlang'ich yozuvlarni qo'yadi.
 *
 * §21 (6-bosqich, multi-tenant) — endi ikki qatlam bor:
 *   - PLATFORMA: bitta `PlatformAdmin` (SUPERADMIN, §21.3) — `platform_admins`
 *     jadvalida, `shopId` YO'Q.
 *   - TENANT: IKKITA SHOP_ADMIN, HAR BIRI O'Z Shop'i bilan. Ataylab ikkita:
 *     bitta bo'lsa 6-bosqichning izolyatsiya testlari (bir Shop
 *     ma'lumotini boshqasi ko'rmasligi) buzuq bo'lsa ham "yashil" ko'rinishi
 *     mumkin edi — ikkinchi tenant bo'lmasa taqqoslab bo'lmaydi.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL majburiy — apps/api/.env faylini tekshiring');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * §11.10 — tizim kategoriyalari; yangisini admin qo'shishi mumkin.
 *
 * §17.12 — "Shaxsiy foydalanish" bu yerda ATAYLAB YO'Q: mahsulotni shaxsiy
 * ehtiyojga olishda kassadan pul chiqmaydi. U pul bo'lmagan xarajat va
 * hisobotda `stock_movements(PERSONAL_USE)` dan hisoblanadi. Kassa yozuvi
 * yaratilsa, tizimdagi qoldiq jismoniy naqd puldan farq qilib qolardi —
 * §11.3 da aynan shu muammo sabab hisoblar ajratilgan edi.
 */
const CASH_CATEGORIES = [
  { slug: 'ijara', name: 'Ijara', direction: 'OUT' as const },
  { slug: 'kommunal', name: 'Kommunal', direction: 'OUT' as const },
  { slug: 'maosh', name: 'Maosh', direction: 'OUT' as const },
  { slug: 'reklama', name: 'Reklama', direction: 'OUT' as const },
  { slug: 'yetkazib-berish', name: 'Yetkazib berish', direction: 'OUT' as const },
  { slug: 'boshqa-chiqim', name: 'Boshqa chiqim', direction: 'OUT' as const },
  { slug: 'boshqa-kirim', name: 'Boshqa kirim', direction: 'IN' as const },
];

/** §11.1 — naqd va karta puli alohida hisoblarda yuritiladi. */
const CASH_ACCOUNTS = [
  { name: 'Naqd', currency: 'UZS' as const, kind: 'CASH' as const, sortOrder: 1 },
  { name: 'Naqd', currency: 'USD' as const, kind: 'CASH' as const, sortOrder: 2 },
  { name: 'Karta', currency: 'UZS' as const, kind: 'CARD' as const, sortOrder: 3 },
];

/** §21.3 — SUPERADMIN `platform_admins`da, `users`da EMAS. */
async function seedPlatformAdmin(): Promise<void> {
  const email = process.env.PLATFORM_ADMIN_EMAIL;
  const password = process.env.PLATFORM_ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn(
      'PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD berilmagan — SUPERADMIN yaratilmadi.',
    );
    return;
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  await prisma.platformAdmin.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      displayName: 'Platforma egasi',
    },
  });
  console.log(`SUPERADMIN tayyor: ${email}`);
}

interface ShopAdminSeed {
  emailEnv: string;
  passwordEnv: string;
  shopName: string;
  displayName: string;
}

/**
 * §21.10 — SHOP_ADMIN account Shop'siz yaratiladi (`shopId` nullable), lekin
 * seed uchun bu noqulay: har ikkala tenant izolyatsiya testlarida darhol
 * ishlatiladigan Shop kerak. Shu sabab seed ATAYLAB Shop'ni ham darhol
 * yaratadi va accountga bog'laydi — bu ishlab chiqarishdagi setup oqimini
 * (§25.6, `POST /shops`) emas, faqat dev/test qulayligini aks ettiradi.
 */
async function seedShopAdmin(spec: ShopAdminSeed): Promise<void> {
  const email = process.env[spec.emailEnv];
  const password = process.env[spec.passwordEnv];

  if (!email || !password) {
    console.warn(`${spec.emailEnv} / ${spec.passwordEnv} berilmagan — ${spec.shopName} o'tkazib yuborildi.`);
    return;
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        passwordHash,
        displayName: spec.displayName,
        role: 'SHOP_ADMIN',
      },
    });

    let shop = user.shopId ? await tx.shop.findUnique({ where: { id: user.shopId } }) : null;
    shop ??= await tx.shop.create({ data: { name: spec.shopName, updatedById: user.id } });

    if (user.shopId !== shop.id) {
      await tx.user.update({ where: { id: user.id }, data: { shopId: shop.id } });
    }

    // §11.10 — har Shop o'z tizim kategoriyalari va kassa hisoblari bilan.
    for (const category of CASH_CATEGORIES) {
      await tx.cashCategory.upsert({
        where: { shopId_slug: { shopId: shop.id, slug: category.slug } },
        update: {},
        create: { ...category, shopId: shop.id, isSystem: true },
      });
    }
    for (const account of CASH_ACCOUNTS) {
      await tx.cashAccount.upsert({
        where: {
          shopId_name_currency: { shopId: shop.id, name: account.name, currency: account.currency },
        },
        update: {},
        create: { ...account, shopId: shop.id },
      });
    }

    console.log(`SHOP_ADMIN tayyor: ${email} — ${shop.name} (${shop.id})`);
  });
}

async function main(): Promise<void> {
  await seedPlatformAdmin();

  // §21 — ikkita mustaqil Shop, ikkita mustaqil SHOP_ADMIN (6-bosqich
  // izolyatsiya testlari uchun majburiy — bitta shop noto'g'ri izolyatsiyani
  // "yashil" ko'rsatib qo'yishi mumkin edi).
  await seedShopAdmin({
    emailEnv: 'ADMIN_EMAIL',
    passwordEnv: 'ADMIN_PASSWORD',
    shopName: process.env.SHOP1_NAME ?? 'HisobAI — 1-do\'kon',
    displayName: "1-do'kon egasi",
  });
  await seedShopAdmin({
    emailEnv: 'SHOP2_ADMIN_EMAIL',
    passwordEnv: 'SHOP2_ADMIN_PASSWORD',
    shopName: process.env.SHOP2_NAME ?? 'HisobAI — 2-do\'kon',
    displayName: "2-do'kon egasi",
  });

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
