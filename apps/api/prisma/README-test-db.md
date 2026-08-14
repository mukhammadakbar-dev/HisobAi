# Izolyatsiya testlari uchun baza

`src/**/*.integration.spec.ts` fayllari **haqiqiy PostgreSQL** talab qiladi va
`hisobai_app` roli ostida ishlaydi. `DATABASE_URL_TEST` berilmagan bo'lsa ular
o'zlarini o'tkazib yuboradi (`describe.skipIf`) — ya'ni `pnpm test` bazasiz
mashinada ham yashil bo'ladi.

## Nega alohida baza

Bu testlar Shop va ularga tegishli qatorlar yaratadi va ularni o'chirmaydi
(izolyatsiya buzilganda nima yozilganini ko'rish uchun). Development bazasiga
tegmasligi kerak.

## Nega `hisobai_app`

Superuser (`postgres`) `FORCE ROW LEVEL SECURITY` ni ham chetlab o'tadi.
Superuser ostida bu testlar RLS ni umuman sinamaydi.

Buni testning o'zi tekshiradi: to'plamda `rolbypassrls = false` ni talab
qiladigan alohida tekshiruv bor, ya'ni `DATABASE_URL_TEST` xato rolga
yo'naltirilsa, qolgan testlar yolg'on yashil bo'lib qolmaydi.

## Tayyorlash

```bash
# 1. Rollarga parol (migratsiya ularni PAROLSIZ yaratadi)
psql -U postgres -c "ALTER ROLE hisobai_app     WITH PASSWORD 'app-paroli'"
psql -U postgres -c "ALTER ROLE hisobai_migrate WITH PASSWORD 'migrate-paroli'"

# 2. Test bazasi
createdb -U postgres hisob_ai_test

# 3. Migratsiyalar (superuser bilan — `migrate deploy` shadow-baza talab qilmaydi)
DATABASE_URL="postgresql://postgres:PAROL@localhost:5432/hisob_ai_test?schema=public" \
  pnpm --filter @hisobai/api exec prisma migrate deploy

# 4. `.env` ga qo'shish
DATABASE_URL_TEST="postgresql://hisobai_app:app-paroli@localhost:5432/hisob_ai_test?schema=public"
```

Rollar klaster darajasida (baza emas) yaratilgani uchun 1-qadam bir marta
bajariladi; RLS migratsiyasi test bazasida qayta ishlaganda mavjud rollarni
qayta yaratmaydi.

## Ishga tushirish

```bash
pnpm --filter @hisobai/api test                                  # hammasi
pnpm --filter @hisobai/api exec vitest run src/database/tenant-isolation.integration.spec.ts
```

## Ma'lum cheklov: `prisma migrate dev` ishlamaydi

`migrate dev` shadow-baza yaratib, barcha migratsiyalarni unga qayta
qo'llaydi. `20260813150000_rls_tenant_isolation_and_roles` esa
`ALTER TABLE _prisma_migrations OWNER TO hisobai_migrate` bajaradi, shadow
bazada bu jadval o'sha paytda hali mavjud bo'lmaydi:

```
ERROR: relation "_prisma_migrations" does not exist
```

Yangi migratsiya qo'shish uchun vaqtincha yechim — SQL faylni qo'lda yozib,
`prisma migrate deploy` bilan qo'llash (shadow-baza ishlatilmaydi).
`20260814000000_fk_indexes_category` aynan shunday qo'shilgan.

To'g'ri tuzatish o'sha `ALTER TABLE` ni `IF EXISTS` bilan himoyalash bo'lardi,
lekin migratsiya allaqachon qo'llangan — uni tahrirlash checksum'ni
o'zgartiradi va Prisma "modified migration" deb ogohlantiradi. Shuning uchun
bu alohida qaror sifatida qoldirilgan.
