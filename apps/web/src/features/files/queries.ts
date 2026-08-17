'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { FileDownloadDto, FileDto, FileKind } from '@hisobai/contracts';

import { api } from '../../lib/api-client';
import type { ApiError } from '../../lib/api-error';

/**
 * Fayl so'rovlari kalitlari (`FRONTEND.md` §5.3).
 */
export const fileKeys = {
  all: ['files'] as const,
  detail: (id: string) => [...fileKeys.all, 'detail', id] as const,
  url: (id: string) => [...fileKeys.all, 'url', id] as const,
};

export interface UploadFileVariables {
  file: File;
  kind: FileKind;
}

/**
 * Fayl yuklash va yuklab olish havolasini olish uchun API (`API.md` §7, §15).
 */
export const filesApi = {
  upload: ({ file, kind }: UploadFileVariables): Promise<FileDto> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('kind', kind);
    return api.upload<FileDto>('/files', formData);
  },

  getUrl: (fileId: string): Promise<FileDownloadDto> =>
    api.get<FileDownloadDto>(`/files/${fileId}`),
};

/**
 * Fayl yuklash mutatsiyasi (`API.md` §7, §15).
 *
 * `FormData` orqali `POST /files` ga yuboradi. Browser multipart chegarasini
 * o'zi qo'yadi.
 */
export function useUploadFile(): UseMutationResult<FileDto, ApiError, UploadFileVariables> {
  return useMutation<FileDto, ApiError, UploadFileVariables>({
    mutationFn: filesApi.upload,
  });
}

/**
 * Faylni ko'rish yoki yuklab olish uchun vaqtinchalik havola olish query'si (`§15.5`).
 *
 * PASSPORT uchun 5 daqiqa, boshqa turlar uchun 15 daqiqa amal qiladi.
 * 4 daqiqa davomida kesh eskirgan deb hisoblanmaydi (`staleTime`).
 */
export function useFileUrl(
  fileId: string | null | undefined,
): UseQueryResult<FileDownloadDto, ApiError> {
  return useQuery<FileDownloadDto, ApiError>({
    queryKey: fileKeys.url(fileId ?? ''),
    queryFn: () => filesApi.getUrl(fileId!),
    enabled: Boolean(fileId),
    staleTime: 4 * 60 * 1000,
  });
}
