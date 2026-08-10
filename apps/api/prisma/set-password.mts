import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

/**
 * §2.6 — SMTP ulangunicha zaxira: parolni server komandasi bilan o'rnatish.
 *
 *   pnpm --filter @hisobai/api set-password ega@hisobai.uz 'yangi-parol'
 *
 * Parol tiklash havolasi email orqali keladi (§2.5), lekin provider hali
 * tanlanmagan. Ega o'zini tizimdan qulflab qo'ysa, kirishning yagona yo'li
 * shu bo'lishi kerak — aks holda bazani qo'lda tahrirlashga to'g'ri keladi.
 *
 * Barcha faol sessiyalar bekor qilinadi: parol shu tarzda o'rnatilishining
 * sababi odatda hisob nazoratini yo'qotish.
 */

const MIN_PASSWORD_LENGTH = 8;

const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error('Ishlatilishi: set-password <email> <yangi-parol>');
  process.exit(1);
}

if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`Parol kamida ${String(MIN_PASSWORD_LENGTH)} belgidan iborat bo'lsin`);
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL majburiy — apps/api/.env faylini tekshiring');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

try {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`Bunday foydalanuvchi yo'q: ${email}`);
    process.exit(1);
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const revoked = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    const result = await tx.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'PASSWORD_SET_BY_COMMAND',
        entityType: 'User',
        entityId: user.id,
      },
    });
    return result.count;
  });

  console.log(`Parol o'rnatildi: ${email}`);
  console.log(`Bekor qilingan sessiyalar: ${String(revoked)}`);
} finally {
  await prisma.$disconnect();
}
