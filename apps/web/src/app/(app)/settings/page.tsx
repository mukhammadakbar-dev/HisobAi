'use client';

import Link from 'next/link';

import { ThemeSystemReset, ThemeToggle } from '../../../components/layout/theme-toggle';
import { Card } from '../../../components/ui';
import { useCurrentUser } from '../../../features/auth/queries';
import { ShopForm } from '../../../features/shops/components/shop-form';
import { can } from '../../../lib/permissions';

/**
 * Sozlamalar (`DECISIONS.md` §3 — Profil · Do'kon · Valyuta · Xavfsizlik).
 *
 * Bildirishnomalar bo'limi bu yerda yo'q: `NotificationLog` va push
 * 11-bosqichda ulanadi, sozlamasi esa o'shanda ma'no kasb etadi.
 * Xavfsizlik alohida sahifada — u yerda uchta mustaqil blok bor.
 *
 * `can(...)` chaqiruvlari MVP'da doim `true` qaytaradi (bitta rol,
 * §16.14), lekin hozirdan qo'yiladi: ikkinchi rol qo'shilganda butun
 * ilovani qidirib chiqish kerak bo'lmaydi (`FRONTEND.md` §9).
 */
export default function SettingsPage() {
  const user = useCurrentUser();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-semibold">Sozlamalar</h1>
        <p className="m-0 text-text-secondary">
          Do‘kon ma’lumotlari va savdo qoidalari.
        </p>
      </header>

      <Card className="flex flex-col gap-4">
        <h2 className="m-0 text-lg font-semibold">Profil</h2>
        <dl className="m-0 grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          <dt className="text-sm text-text-secondary">Foydalanuvchi</dt>
          <dd className="m-0">{user.data?.displayName ?? '—'}</dd>
          <dt className="text-sm text-text-secondary">Email</dt>
          <dd className="m-0">{user.data?.email ?? '—'}</dd>
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-soft pt-4">
          <div>
            <p className="m-0 font-medium">Mavzu</p>
            <p className="m-0 text-sm text-text-tertiary">
              Tanlov shu brauzerda saqlanadi (TZ §2).
            </p>
          </div>
          <div className="flex items-center gap-1">
            {/* Qo'lda tanlangandagina ko'rinadi — TZ §2 dagi "tizim
                mavzusiga moslashish" shu tugma orqali qaytariladi */}
            <ThemeSystemReset />
            <ThemeToggle />
          </div>
        </div>

        <div className="border-t border-border-soft pt-4">
          <Link href="/settings/security" className="text-sm font-medium text-link hover:underline">
            Parol, sessiyalar va kirish jurnali →
          </Link>
        </div>

        {/* §2.2 — audit jurnali faqat SHOP_ADMIN uchun
            (`PERMISSIONS.md`). U kundalik ish emas, tekshiruv vositasi —
            shuning uchun sozlamalar ichida */}
        {can(user.data, 'audit.view') && (
          <div className="border-t border-border-soft pt-4">
            <Link href="/settings/audit" className="text-sm font-medium text-link hover:underline">
              Audit jurnali →
            </Link>
          </div>
        )}

        {/* §4.4 — kategoriya va brendni tahrirlash, arxivlash, birlashtirish */}
        {can(user.data, 'catalog.view') && (
          <div className="border-t border-border-soft pt-4">
            <Link
              href="/settings/catalog"
              className="text-sm font-medium text-link hover:underline"
            >
              Kategoriya va brendlar →
            </Link>
          </div>
        )}
      </Card>

      {can(user.data, 'settings.editShop') && <ShopForm />}
    </div>
  );
}
