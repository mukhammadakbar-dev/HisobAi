'use client';

import { ErrorCode } from '@hisobai/contracts';
import { useCallback, useState } from 'react';

import { ApiError } from '../lib/api-error';
import { randomId } from '../lib/random-id';

/**
 * Moliyaviy `POST` uchun `Idempotency-Key` (`FRONTEND.md` §5.4, TZ §17.6,
 * `API.md` §4).
 *
 * **Nega hook, nega har formada `useState(() => crypto.randomUUID())` emas.**
 * Kalitning umri — bu qoida, o'zgaruvchi emas: u forma ochilganda tug'iladi,
 * qayta bosishda **o'zgarmaydi** (aynan shu dublikatni to'sadi) va faqat
 * aniq holatlarda almashadi. Qoida har formada qo'lda takrorlanganda
 * yarmi esdan chiqdi: `sale-form.tsx` da setter umuman yozilmagan edi,
 * shuning uchun serverdan xato olgan ega savatni tuzatib qayta bosganda
 * **o'sha kalit boshqa mazmun bilan** ketardi va `IDEMPOTENCY_KEY_REUSED`
 * olardi — yagona chiqish sahifani yangilash, ya'ni savatni yo'qotish edi.
 *
 * Kalitni yaratish `randomId()` zimmasida: LAN'dagi `http://` da
 * `crypto.randomUUID` yo'q (`lib/random-id.ts`).
 */
export function useIdempotencyKey(): {
  key: string;
  renew: () => void;
  renewAfterError: (error: unknown) => void;
} {
  const [key, setKey] = useState(randomId);

  /**
   * Kalitni so'zsiz almashtiradi.
   *
   * Muvaffaqiyatdan keyin ochiq qoladigan formalar uchun: ikkinchi amal
   * yangi kalit bilan ketmasa, server uni takror deb bilib **birinchi
   * amalning saqlangan javobini** qaytarardi va ikkinchi qabul/savdo
   * umuman yozilmasdan "bajarildi" bo'lib ko'rinardi.
   */
  const renew = useCallback(() => {
    setKey(randomId());
  }, []);

  /**
   * Xatodan keyin kalitni **faqat xavfsiz bo'lganda** almashtiradi.
   *
   * Qaror serverning haqiqiy xatti-harakatiga tayanadi
   * (`api/src/common/idempotency.interceptor.ts`):
   *
   *  - handler xato tashlasa, interceptor `release()` bilan kalit qatorini
   *    **o'chiradi**. Moliyaviy handler'lar bitta tranzaksiyada ishlagani
   *    uchun bu paytda hech narsa commit qilinmagan — ya'ni server javob
   *    qaytargan `4xx` da amal **aniq bajarilmagan**;
   *  - kalit bo'shagani uchun eski kalitni saqlab qolishning foydasi yo'q,
   *    zarari esa bor: ega qatorni almashtirib qayta bosganda mazmun
   *    o'zgargan bo'ladi va `claim()` `IDEMPOTENCY_KEY_REUSED` beradi.
   *
   * **Nega qayta bosish dublikat yaratmaydi.** Kalit aynan amal
   * bajarilmagani uchun almashadi. Ega hech narsani o'zgartirmasdan qayta
   * bossa, server o'sha tekshiruvni qaytadan bajaradi va o'sha xatoni
   * qaytaradi (masalan §5.5 "birinchi tasdiqlagan oladi" — birlik band
   * bo'lib qolgan). Ikkinchi savdo tug'ilishi uchun so'rov muvaffaqiyatli
   * bo'lishi kerak, muvaffaqiyat esa bu yo'ldan umuman o'tmaydi.
   *
   * **Nega hamma xatoda emas.** Kalitning butun ma'nosi — natijasi
   * NOMA'LUM so'rov. Bu holatlarda kalit ataylab **saqlanadi**:
   *
   *  - `NETWORK_ERROR` (`status === 0`) — so'rov serverga yetgan, javob
   *    yo'lda yo'qolgan bo'lishi mumkin. Yangi kalit bilan qayta yuborish
   *    ikkinchi savdo yozardi; eski kalit bilan esa server saqlangan
   *    javobni qaytaradi. Bu §17.6 dagi asosiy ssenariy;
   *  - `5xx` va `429` (`isRetriable`) — xato ilovadan emas, oldidagi
   *    qatlamdan kelgan bo'lishi mumkin (proxy timeout), ya'ni amal
   *    bajarilib javob yo'qolgan holat istisno emas;
   *  - `REQUEST_IN_PROGRESS` — o'sha kalitli so'rov hozir bajarilmoqda.
   *    Yangi kalit uni chetlab o'tib, ikkinchi amalni yo'lga qo'yardi —
   *    ya'ni to'siq aynan kerak bo'lgan joyda ochilardi.
   */
  const renewAfterError = useCallback((error: unknown) => {
    if (!(error instanceof ApiError)) return;
    if (error.isRetriable || error.status < 400) return;
    if (error.code === ErrorCode.REQUEST_IN_PROGRESS) return;
    setKey(randomId());
  }, []);

  return { key, renew, renewAfterError };
}
