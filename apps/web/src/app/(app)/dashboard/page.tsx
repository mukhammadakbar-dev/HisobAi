'use client';

import { Settings as SettingsIcon, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { Card } from '../../../components/ui';
import { useCurrentUser } from '../../../features/auth/queries';

/**
 * Boshqaruv sahifasi — **2-bosqich holati**.
 *
 * To'liq dashboard (bugungi savdo va foyda, kutilayotgan to'lovlar, kassa
 * qoldig'i — §14.3) `GET /dashboard` bilan birga **5-bosqichda** keladi:
 * ko'rsatiladigan raqamlar savdo va kassa modullaridan chiqadi, ular esa
 * hali yozilmagan. Bu yerda soxta nol ko'rsatilmaydi — bo'lmagan raqamni
 * "0" deb chizish eng yomon variant (`FRONTEND.md` §9).
 *
 * Kurs holati bu sahifada takrorlanmaydi: u `AppShell` dagi kurs
 * chizig'ida, barcha sahifalar tepasida turadi (§14.5).
 */
export default function DashboardPage() {
  const user = useCurrentUser();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-semibold">Boshqaruv</h1>
        <p className="m-0 text-text-secondary">
          Xush kelibsiz{user.data ? `, ${user.data.displayName}` : ''}.
        </p>
      </header>

      <Card className="flex flex-col gap-2">
        <h2 className="m-0 text-lg font-semibold">Keyingi bosqich</h2>
        <p className="m-0 text-text-secondary">
          Bugungi savdo, foyda, kutilayotgan to‘lovlar va kassa qoldig‘i shu yerda ko‘rinadi — savdo
          va kassa modullari qo‘shilgach. Hozircha kirish, do‘kon sozlamalari va valyuta kursi
          ishlaydi.
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <QuickLink
          href="/settings"
          icon={<SettingsIcon size={20} aria-hidden="true" />}
          title="Sozlamalar"
          description="Do‘kon ma’lumotlari, ish vaqti, nasiya shartlari va valyuta kursi."
        />
        <QuickLink
          href="/settings/security"
          icon={<ShieldCheck size={20} aria-hidden="true" />}
          title="Xavfsizlik"
          description="Parolni o‘zgartirish, faol sessiyalar va kirish jurnali."
        />
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-2 rounded-lg border border-border-default bg-surface-card p-4 transition-colors hover:bg-surface-raised"
    >
      <span className="flex items-center gap-2 font-semibold text-text-primary">
        {icon}
        {title}
      </span>
      <span className="text-sm text-text-secondary">{description}</span>
    </Link>
  );
}
