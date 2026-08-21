'use client';

/**
 * Ro'yxatni davom ettirish (`design.md` §6).
 *
 * Raqamli sahifalash ataylab emas: telefonda kichik raqamlarga tegish
 * qiyin va do'kon egasi "3-sahifa" degan tushunchada ishlamaydi — u
 * "yana ko'rsat" deb o'ylaydi.
 *
 * Nechta ko'rsatilayotgani doim yozib turiladi. Ilgari `hasMore`
 * bo'lganda shunchaki tugma chiqardi va foydalanuvchi ro'yxat
 * kesilganini, umuman nechta yozuv borligini bilmasdi.
 */
export function LoadMore({
  shown,
  total,
  onLoadMore,
  pending = false,
  noun = 'yozuv',
}: {
  shown: number;
  /** Umumiy son noma'lum bo'lsa berilmaydi — u holda faqat ko'rinayotgani yoziladi. */
  total?: number;
  onLoadMore: () => void;
  pending?: boolean;
  /** "12 tadan 5 tasi ko'rsatilyapti" dagi so'z. */
  noun?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 pt-1">
      <button
        type="button"
        onClick={onLoadMore}
        disabled={pending}
        className="min-h-11 w-full rounded-md border border-border-default bg-surface-card px-4 text-sm font-semibold text-text-primary hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-64"
      >
        {pending ? 'Yuklanmoqda…' : 'Yana yuklash'}
      </button>
      <span className="tabular text-xs text-text-tertiary">
        {total === undefined
          ? `${shown} ta ${noun} ko‘rsatilyapti`
          : `${total} tadan ${shown} tasi ko‘rsatilyapti`}
      </span>
    </div>
  );
}
