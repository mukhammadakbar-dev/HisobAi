'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { TaxonomyDto } from '@hisobai/contracts';

import { Button, Field, Input, Select } from '../../../components/ui';
import { errorMessage } from '../../../lib/messages';

/**
 * Kategoriya yoki brend tanlash — **yangisini shu yerdan qo'shish
 * bilan** (§4.4).
 *
 * Nega inline: mahsulot qo'shayotgan ega yangi brendni ko'rib qolsa,
 * uni qo'shish uchun boshqa ekranga o'tishi va formani boshidan
 * to'ldirishi kerak bo'lardi. §4.4 aynan shuni talab qiladi.
 *
 * Arxivdagi yozuvlar ro'yxatda ko'rinmaydi (server `isActive=active`
 * qaytaradi): ularga yangi mahsulot bog'lash server tomonidan ham
 * to'siladi (`CATALOG_TAXONOMY_ARCHIVED`).
 */
export function TaxonomySelect({
  id,
  label,
  value,
  options,
  isLoading,
  error,
  onChange,
  onCreate,
  createError,
  isCreating,
}: {
  id: string;
  label: string;
  value: string;
  options: TaxonomyDto[];
  isLoading: boolean;
  error?: string;
  onChange: (value: string) => void;
  onCreate: (name: string) => Promise<TaxonomyDto>;
  createError: unknown;
  isCreating: boolean;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');

  const submitNew = (): void => {
    const trimmed = name.trim();
    if (trimmed === '') return;

    void onCreate(trimmed).then(
      (created) => {
        onChange(created.id);
        setName('');
        setIsAdding(false);
      },
      // Xato `createError` orqali ko'rsatiladi — forma ochiq qoladi
      () => undefined,
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <Field label={label} htmlFor={id} error={error}>
        <div className="flex items-center gap-2">
          <Select
            id={id}
            value={value}
            disabled={isLoading}
            onChange={(event) => {
              onChange(event.target.value);
            }}
          >
            <option value="">{isLoading ? 'Yuklanmoqda…' : 'Tanlang'}</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </Select>

          <button
            type="button"
            onClick={() => {
              setIsAdding((current) => !current);
            }}
            aria-expanded={isAdding}
            title={`Yangi ${label.toLowerCase()} qo‘shish`}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border-default text-text-secondary hover:bg-surface-raised"
          >
            <Plus size={18} aria-hidden="true" />
            <span className="sr-only">Yangi {label.toLowerCase()} qo‘shish</span>
          </button>
        </div>
      </Field>

      {isAdding && (
        <div className="flex flex-col gap-2 rounded-md border border-border-default bg-surface-raised p-3">
          <Field label={`Yangi ${label.toLowerCase()}`} htmlFor={`${id}-new`}>
            <Input
              id={`${id}-new`}
              value={name}
              autoComplete="off"
              onChange={(event) => {
                setName(event.target.value);
              }}
              onKeyDown={(event) => {
                // Forma ichida `Enter` butun formani yuborib yubormasin
                if (event.key !== 'Enter') return;
                event.preventDefault();
                submitNew();
              }}
            />
          </Field>

          {createError !== null && createError !== undefined && (
            <p className="m-0 text-sm text-danger" role="alert">
              {errorMessage(createError)}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="button" onClick={submitNew} disabled={isCreating || name.trim() === ''}>
              {isCreating ? 'Qo‘shilmoqda…' : 'Qo‘shish'}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setName('');
              }}
            >
              Bekor qilish
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
