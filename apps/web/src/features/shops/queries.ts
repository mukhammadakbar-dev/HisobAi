'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { CreateShopInput, ShopDto, UpdateShopInput } from '@hisobai/contracts';

import { api } from '../../lib/api-client';
import type { ApiError } from '../../lib/api-error';
import { authKeys } from '../auth/queries';

export const shopKeys = {
  all: ['shops'] as const,
  detail: () => [...shopKeys.all, 'detail'] as const,
};

export const shopsApi = {
  get: (): Promise<ShopDto> => api.get('/shops/me'),
  update: (input: UpdateShopInput): Promise<ShopDto> => api.patch('/shops/me', input),
  create: (input: CreateShopInput): Promise<ShopDto> => api.post('/shops', input),
};

/**
 * Shop yaratish — setup oqimi (§25.6, §25.7).
 *
 * `onSuccess` da `auth.me` **butunlay bekor qilinadi**, keshga qo'lda
 * yozilmaydi: `shopId` endi `null` emas va aynan shu qiymatga
 * `(app)`/`(setup)` qobiqlaridagi yo'naltirish tayanadi. Qo'lda yozilsa,
 * server javobidagi boshqa maydonlar (masalan `role`) bilan chalkashish
 * xavfi bo'lardi — bu yerda tezlik muhim emas, to'g'rilik muhim.
 *
 * Bekor qilish natijasi **qaytariladi**, `void` bilan tashlab
 * yuborilmaydi: react-query mutatsiyaning `onSuccess` idan qaytgan
 * promise'ni `mutate(…, { onSuccess })` chaqiruvchisidan OLDIN kutadi.
 * Usiz forma `/dashboard` ga o'sha zahoti o'tardi, `auth.me` keshida esa
 * hali eski `shopId: null` turardi (`staleTime` 5 daqiqa) — `(app)`
 * qobig'i buni "Shop tuzilmagan" deb o'qib, foydalanuvchini endigina
 * to'ldirgan setup formasiga qaytarardi. Refetch muvaffaqiyatsiz bo'lsa
 * (oflayn, 500) u o'sha yerda qolib ketardi va qayta yuborish
 * `SHOP_ALREADY_EXISTS` berardi — ya'ni oqim o'zi to'sishi kerak bo'lgan
 * holatga tushardi.
 *
 * §25.7 — ikkinchi marta chaqirilsa server `SHOP_ALREADY_EXISTS`
 * qaytaradi; formada u oddiy xato sifatida ko'rsatiladi.
 */
export function useCreateShop(): UseMutationResult<ShopDto, ApiError, CreateShopInput> {
  const queryClient = useQueryClient();

  return useMutation<ShopDto, ApiError, CreateShopInput>({
    mutationFn: shopsApi.create,
    onSuccess: (shop) => {
      queryClient.setQueryData(shopKeys.detail(), shop);
      return queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}

export function useShop(): UseQueryResult<ShopDto, ApiError> {
  return useQuery<ShopDto, ApiError>({
    queryKey: shopKeys.detail(),
    queryFn: shopsApi.get,
  });
}

export function useUpdateShop(): UseMutationResult<ShopDto, ApiError, UpdateShopInput> {
  const queryClient = useQueryClient();

  return useMutation<ShopDto, ApiError, UpdateShopInput>({
    /**
     * Optimistik qulf tokeni (`API.md` §8).
     *
     * **Asosiy manba — chaqiruvchi**: forma uni o'zi yuklagan versiyaga
     * bog'lab yuboradi (`shop-settings-form.tsx`). Kesh bu yerda faqat
     * zaxira: formasiz chaqiruvlar (masalan bitta sozlamani almashtirish)
     * tokensiz qolib, `428` ga uchramasin.
     *
     * Kesh zaxirasi qulfni zaiflashtiradi — u fon yangilanishidan keyin
     * begona o'zgarishni "o'zimniki" deb qabul qilishi mumkin. Shuning
     * uchun tahrir formasi hech qachon unga tayanmaydi.
     *
     * Kesh ham bo'sh bo'lsa token yubormaymiz va server `428` qaytaradi.
     * `GET /shops/me` chaqirib token olish **atayin qilinmaydi**: u boshqa
     * qurilma hozirgina yozgan holatni qabul qilib olardi.
     */
    mutationFn: (input) => {
      const cached = queryClient.getQueryData<ShopDto>(shopKeys.detail());
      return shopsApi.update({
        ...input,
        expectedUpdatedAt: input.expectedUpdatedAt ?? cached?.updatedAt,
      });
    },
    onSuccess: (settings) => {
      // Javobdagi yangi `updatedAt` keshga tushadi — ketma-ket ikkinchi
      // saqlash eski token bilan ketmaydi
      queryClient.setQueryData(shopKeys.detail(), settings);
      /**
       * Ustama foizi o'zgarsa ertangi do'kon kursi boshqacha hisoblanadi
       * (§16.2) — kurs blokini yangilaymiz. Savdolar EMAS: ular snapshot
       * kursda qotgan (§1.7, `FRONTEND.md` §5.3).
       */
      void queryClient.invalidateQueries({ queryKey: ['exchange-rates'] });
    },
  });
}
