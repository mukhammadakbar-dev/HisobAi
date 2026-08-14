'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { SettingsDto, UpdateSettingsInput } from '@hisobai/contracts';

import { api } from '../../lib/api-client';
import type { ApiError } from '../../lib/api-error';

export const settingsKeys = {
  all: ['settings'] as const,
  detail: () => [...settingsKeys.all, 'detail'] as const,
};

export const settingsApi = {
  get: (): Promise<SettingsDto> => api.get('/settings'),
  update: (input: UpdateSettingsInput): Promise<SettingsDto> => api.patch('/settings', input),
};

export function useSettings(): UseQueryResult<SettingsDto, ApiError> {
  return useQuery<SettingsDto, ApiError>({
    queryKey: settingsKeys.detail(),
    queryFn: settingsApi.get,
  });
}

export function useUpdateSettings(): UseMutationResult<SettingsDto, ApiError, UpdateSettingsInput> {
  const queryClient = useQueryClient();

  return useMutation<SettingsDto, ApiError, UpdateSettingsInput>({
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
     * `GET /settings` chaqirib token olish **atayin qilinmaydi**: u boshqa
     * qurilma hozirgina yozgan holatni qabul qilib olardi.
     */
    mutationFn: (input) => {
      const cached = queryClient.getQueryData<SettingsDto>(settingsKeys.detail());
      return settingsApi.update({
        ...input,
        expectedUpdatedAt: input.expectedUpdatedAt ?? cached?.updatedAt,
      });
    },
    onSuccess: (settings) => {
      // Javobdagi yangi `updatedAt` keshga tushadi — ketma-ket ikkinchi
      // saqlash eski token bilan ketmaydi
      queryClient.setQueryData(settingsKeys.detail(), settings);
      /**
       * Ustama foizi o'zgarsa ertangi do'kon kursi boshqacha hisoblanadi
       * (§16.2) — kurs blokini yangilaymiz. Savdolar EMAS: ular snapshot
       * kursda qotgan (§1.7, `FRONTEND.md` §5.3).
       */
      void queryClient.invalidateQueries({ queryKey: ['exchange-rates'] });
    },
  });
}
