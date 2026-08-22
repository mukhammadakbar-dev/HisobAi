'use client';

import type { TaxonomyDto } from '@hisobai/contracts';
import { useState } from 'react';

import { EmptyState, ErrorState, TableSkeleton } from '../../../components/states';
import { Badge, Button, Card, Input, Select } from '../../../components/ui';
import { useToast } from '../../../components/ui/toast';
import { errorMessage } from '../../../lib/messages';
import {
  useCreateTaxonomy,
  useMergeTaxonomy,
  useTaxonomy,
  useUpdateTaxonomy,
  type TaxonomyKind,
} from '../queries';

/**
 * Kategoriya va brendni boshqarish (§4.4 — "sozlamalarda tahrirlash va
 * birlashtirish").
 *
 * Nega alohida ekran kerak: mahsulot formasidagi `TaxonomySelect` faqat
 * **qo'shishni** beradi (§4.4 ning birinchi yarmi). Nomni tuzatish,
 * arxivlash va ayniqsa **birlashtirish** — katalogni tozalash amallari;
 * ular mahsulot formasida turmaydi, chunki bir necha mahsulotga birdan
 * ta'sir qiladi.
 *
 * Birlashtirish nima uchun muhim: "Aplle" va "Apple" ikkita brend bo'lib
 * qolsa, qoldiq ikkiga bo'linadi va foyda hisobotini o'qib bo'lmaydi
 * (§18.5 dagi mulohazaning aynan o'zi). Server buni bitta tranzaksiyada
 * qiladi — mahsulotlar nishonga ko'chadi, manba arxivlanadi.
 */

const KIND_LABEL: Record<TaxonomyKind, { one: string; many: string }> = {
  category: { one: 'Kategoriya', many: 'Kategoriyalar' },
  brand: { one: 'Brend', many: 'Brendlar' },
};

export function TaxonomyManager({ kind, canEdit }: { kind: TaxonomyKind; canEdit: boolean }) {
  const label = KIND_LABEL[kind];

  const [showArchived, setShowArchived] = useState(false);
  const [newName, setNewName] = useState('');
  /** Bir vaqtda faqat bitta qator ochiq — ikkita ochiq forma chalkashtiradi. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mergingId, setMergingId] = useState<string | null>(null);

  const list = useTaxonomy(kind, { isActive: showArchived ? 'all' : 'active' });
  const create = useCreateTaxonomy(kind);
  const update = useUpdateTaxonomy(kind);
  const merge = useMergeTaxonomy(kind);
  const toast = useToast();

  const rows = list.data?.data ?? [];
  const activeRows = rows.filter((row) => row.isActive);

  const submitNew = (): void => {
    const trimmed = newName.trim();
    if (trimmed === '') return;

    create.mutate(trimmed, {
      onSuccess: () => {
        setNewName('');
        toast.success(`${label.one} qo‘shildi`);
      },
    });
  };

  return (
    <Card className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-lg font-semibold">{label.many}</h2>

        <label className="flex min-h-11 items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            className="size-4"
            checked={showArchived}
            onChange={(event) => {
              setShowArchived(event.target.checked);
              setEditingId(null);
              setMergingId(null);
            }}
          />
          Arxivdagilar ham
        </label>
      </header>

      {canEdit && (
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-48 flex-1">
            <label htmlFor={`${kind}-new`} className="sr-only">
              Yangi {label.one.toLowerCase()}
            </label>
            <Input
              id={`${kind}-new`}
              value={newName}
              autoComplete="off"
              placeholder={`Yangi ${label.one.toLowerCase()}`}
              onChange={(event) => {
                setNewName(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                submitNew();
              }}
            />
          </div>
          <Button
            type="button"
            variant="primary"
            onClick={submitNew}
            disabled={create.isPending || newName.trim() === ''}
          >
            {create.isPending ? 'Qo‘shilmoqda…' : 'Qo‘shish'}
          </Button>
        </div>
      )}

      {create.isError && (
        <p className="m-0 text-sm text-danger" role="alert">
          {errorMessage(create.error)}
        </p>
      )}

      {list.isPending && <TableSkeleton rows={4} />}

      {list.isError && (
        <ErrorState
          error={list.error}
          onRetry={() => {
            void list.refetch();
          }}
        />
      )}

      {!list.isPending && !list.isError && rows.length === 0 && (
        <EmptyState title={`Hali ${label.one.toLowerCase()} yo‘q`} />
      )}

      {rows.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((row) => (
            <TaxonomyRow
              key={row.id}
              kind={kind}
              row={row}
              canEdit={canEdit}
              /* Birlashtirish nishoni faqat faol yozuv bo'la oladi — server
                 ham shuni talab qiladi (`CATALOG_MERGE_INVALID_TARGET`) */
              mergeTargets={activeRows.filter((candidate) => candidate.id !== row.id)}
              isEditing={editingId === row.id}
              isMerging={mergingId === row.id}
              onEdit={(value) => {
                setEditingId(value ? row.id : null);
                setMergingId(null);
              }}
              onMerge={(value) => {
                setMergingId(value ? row.id : null);
                setEditingId(null);
              }}
              update={update}
              merge={merge}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

type UpdateMutation = ReturnType<typeof useUpdateTaxonomy>;
type MergeMutation = ReturnType<typeof useMergeTaxonomy>;

function TaxonomyRow({
  kind,
  row,
  canEdit,
  mergeTargets,
  isEditing,
  isMerging,
  onEdit,
  onMerge,
  update,
  merge,
}: {
  kind: TaxonomyKind;
  row: TaxonomyDto;
  canEdit: boolean;
  mergeTargets: TaxonomyDto[];
  isEditing: boolean;
  isMerging: boolean;
  onEdit: (open: boolean) => void;
  onMerge: (open: boolean) => void;
  update: UpdateMutation;
  merge: MergeMutation;
}) {
  const [name, setName] = useState(row.name);
  const [targetId, setTargetId] = useState('');
  const toast = useToast();

  /**
   * Xato faqat **shu** qatorda ko'rsatiladi.
   *
   * Mutatsiya obyekti butun ro'yxatga umumiy, ya'ni `update.error` ni
   * shartsiz chizsak, bitta qatordagi xato hamma qatorda chiqardi.
   */
  const errorOf = (mutation: UpdateMutation | MergeMutation): unknown =>
    mutation.isError && mutation.variables?.id === row.id ? mutation.error : null;

  const isBusy =
    (update.isPending && update.variables?.id === row.id) ||
    (merge.isPending && merge.variables?.id === row.id);

  const submitRename = (): void => {
    const trimmed = name.trim();
    if (trimmed === '' || trimmed === row.name) {
      onEdit(false);
      return;
    }

    update.mutate(
      // Qulf tokeni ro'yxatdagi holatdan olinadi (`API.md` §8)
      { id: row.id, input: { name: trimmed, expectedUpdatedAt: row.updatedAt } },
      {
        onSuccess: () => {
          onEdit(false);
        },
      },
    );
  };

  const toggleArchive = (): void => {
    update.mutate({
      id: row.id,
      input: { isActive: !row.isActive, expectedUpdatedAt: row.updatedAt },
    });
  };

  const submitMerge = (): void => {
    if (targetId === '') return;

    merge.mutate(
      { id: row.id, targetId, expectedUpdatedAt: row.updatedAt },
      {
        onSuccess: () => {
          setTargetId('');
          onMerge(false);
          toast.success(`${row.name} birlashtirildi`);
        },
      },
    );
  };

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border-default p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{row.name}</span>
          {/* Birlashtirishdan oldin nechta mahsulot ko'chishini bilish shart */}
          <span className="text-sm text-text-tertiary">{row.productCount} ta mahsulot</span>
          {!row.isActive && <Badge tone="muted">Arxivda</Badge>}
        </div>

        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setName(row.name);
                onEdit(!isEditing);
              }}
            >
              {isEditing ? 'Yopish' : 'Nomi'}
            </Button>

            {/* Arxivdagi yozuvni birlashtirish mumkin emas: manba baribir
                arxivlanadi, ya'ni amal hech narsani o'zgartirmasdi */}
            {row.isActive && mergeTargets.length > 0 && (
              <Button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  onMerge(!isMerging);
                }}
              >
                {isMerging ? 'Yopish' : 'Birlashtirish'}
              </Button>
            )}

            <Button type="button" disabled={isBusy} onClick={toggleArchive}>
              {row.isActive ? 'Arxivlash' : 'Tiklash'}
            </Button>
          </div>
        )}
      </div>

      {isEditing && (
        <div className="flex flex-wrap items-start gap-2 border-t border-border-soft pt-3">
          <div className="min-w-48 flex-1">
            <label htmlFor={`${kind}-${row.id}-name`} className="sr-only">
              Nomi
            </label>
            <Input
              id={`${kind}-${row.id}-name`}
              value={name}
              autoComplete="off"
              onChange={(event) => {
                setName(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                submitRename();
              }}
            />
          </div>
          <Button type="button" variant="primary" onClick={submitRename} disabled={isBusy}>
            Saqlash
          </Button>
        </div>
      )}

      {isMerging && (
        <div className="flex flex-col gap-2 border-t border-border-soft pt-3">
          <p className="m-0 text-sm text-text-secondary">
            <strong>{row.name}</strong> ichidagi {row.productCount} ta mahsulot tanlangan{' '}
            {KIND_LABEL[kind].one.toLowerCase()}ga ko‘chadi, o‘zi esa arxivlanadi. Amalni orqaga
            qaytarib bo‘lmaydi — mahsulotlarni qo‘lda qaytarish kerak bo‘ladi.
          </p>

          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-48 flex-1">
              <label htmlFor={`${kind}-${row.id}-target`} className="sr-only">
                Qayerga birlashtirilsin
              </label>
              <Select
                id={`${kind}-${row.id}-target`}
                value={targetId}
                onChange={(event) => {
                  setTargetId(event.target.value);
                }}
              >
                <option value="">Tanlang</option>
                {mergeTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              type="button"
              variant="danger"
              onClick={submitMerge}
              disabled={isBusy || targetId === ''}
            >
              {isBusy ? 'Birlashtirilmoqda…' : 'Birlashtirish'}
            </Button>
          </div>
        </div>
      )}

      {[errorOf(update), errorOf(merge)].map(
        (error, index) =>
          error !== null && (
            <p key={index} className="m-0 text-sm text-danger" role="alert">
              {errorMessage(error)}
            </p>
          ),
      )}
    </li>
  );
}
