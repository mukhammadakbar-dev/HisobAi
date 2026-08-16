'use client';

import {
  Currency,
  SaleKind,
  confirmSaleSchema,
  createSaleDraftSchema,
  roundMoney,
  sumMoney,
} from '@hisobai/contracts';
import type {
  ConfirmSaleInput,
  CreateSaleDraftInput,
  SaleDto,
  SaleItemInput,
  UpdateSaleDraftInput,
} from '@hisobai/contracts';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Money } from '../../../components/money/money';
import { ErrorState, TableSkeleton } from '../../../components/states';
import { Button, Card, Field, Input, Select } from '../../../components/ui';
import { useIdempotencyKey } from '../../../hooks/use-idempotency-key';
import { ApiError } from '../../../lib/api-error';
import { SHOP_TIME_ZONE, todayInShopZone } from '../../../lib/format';
import { errorMessage } from '../../../lib/messages';
import { can } from '../../../lib/permissions';
import { useCurrentUser } from '../../auth/queries';
import { useCashAccounts } from '../../cashbook/queries';
import { useProducts } from '../../catalog/queries';
import { useCustomers } from '../../customers/queries';
import { useTodayRate } from '../../exchange-rates/queries';
import {
  useConfirmSale,
  useCreateSaleDraft,
  useDeleteSaleDraft,
  useUpdateSaleDraft,
} from '../queries';
import { CartRowFields, emptyCartRow, lineTotal, safeQuantity } from './cart-row';
import type { CartRow } from './cart-row';
import {
  InstallmentPlanPanel,
  emptyPlan,
  principalFor,
  type PlanState,
} from '../../installments/components/installment-plan-panel';
import { PaymentsPanel, emptyPaymentRow, remainingAmount } from './payments-panel';
import type { PaymentRow } from './payments-panel';

/**
 * Savdo formasi — 5-bosqichning eng murakkab ekrani (`FRONTEND.md` §14).
 *
 * Oqim ikki bosqichli (§7):
 *
 *  - **qoralama** hech narsaga ta'sir qilmaydi: saqlanadi, o'zgartiriladi
 *    va o'chiriladi (§7.7). Ombor birligini ushlab turmaydi (§5.5);
 *  - **tasdiqlash** — bitta tranzaksiya: ombor band qilinadi, raqam
 *    ajratiladi, to'lov va kassa yoziladi (`ARCHITECTURE.md` §6).
 *    Shuning uchun u `Idempotency-Key` bilan yuboriladi (§17.6) va
 *    kalit **forma ochilganda** bir marta yaratiladi. Tasdiqlash
 *    tugagandan keyin — muvaffaqiyatda ham, server rad etgan holatda
 *    ham — kalit yangilanadi (`hooks/use-idempotency-key.ts`).
 *
 * Tasdiqlash uchun savdo serverda mavjud bo'lishi kerak (`POST
 * /sales/:id/confirm`), shuning uchun yangi savdoda tugma avval
 * qoralamani saqlaydi, keyin tasdiqlaydi. Ega uchun bu bitta amal
 * bo'lib ko'rinadi.
 *
 * **Nasiya** (§9) — `kind = INSTALLMENT` tanlanganda shartnoma paneli
 * ochiladi va tasdiqlashda `installment` sharti yuboriladi (§9.1).
 * O'shanda to'lovlar savdo summasiga emas, **boshlang'ich to'lovga**
 * tenglashtiriladi (§17.10): qolgani jadval bo'yicha keyin keladi.
 * Nasiya shartnoma va to'lov jadvalini talab qiladi; usiz "nasiya"
 * savdo qarzni hech qayerda qoldirmasdan yo'qotardi.
 */

interface FormState {
  currency: Currency;
  kind: SaleKind;
  customerId: string;
  soldAt: string;
  note: string;
  rows: CartRow[];
}

function initialState(sale: SaleDto | undefined): FormState {
  if (!sale) {
    return {
      currency: Currency.UZS,
      kind: SaleKind.CASH,
      customerId: '',
      soldAt: todayInShopZone(),
      note: '',
      rows: [emptyCartRow()],
    };
  }

  return {
    currency: sale.currency,
    kind: sale.kind,
    customerId: sale.customerId ?? '',
    soldAt: sale.soldAt.slice(0, 10),
    note: sale.note ?? '',
    rows:
      sale.items.length === 0
        ? [emptyCartRow()]
        : sale.items.map((item) => ({
            key: item.id,
            productId: item.productId,
            inventoryItemId: item.inventoryItemId ?? '',
            batchId: item.batchId ?? '',
            quantity: String(item.quantity),
            unitPrice: item.unitPrice,
          })),
  };
}

export function SaleForm({ sale }: { sale?: SaleDto }) {
  const router = useRouter();
  const user = useCurrentUser();
  const products = useProducts({ isActive: 'active', limit: 200 });
  const customers = useCustomers({ isActive: 'active' });
  const accounts = useCashAccounts();
  const todayRate = useTodayRate();

  const createDraft = useCreateSaleDraft();
  const updateDraft = useUpdateSaleDraft(sale?.id ?? '');
  const deleteDraft = useDeleteSaleDraft();
  const confirmSale = useConfirmSale(sale?.id ?? '');

  const [form, setForm] = useState<FormState>(() => initialState(sale));
  const [payments, setPayments] = useState<PaymentRow[]>([emptyPaymentRow()]);
  const [plan, setPlan] = useState<PlanState>(() => emptyPlan());
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  // `API.md` §4.2 — kalit forma ochilganda yaratiladi, qayta bosishda o'zgarmaydi
  const idempotency = useIdempotencyKey();

  const activeAccounts = (accounts.data ?? []).filter((account) => account.isActive);
  const storeRate = todayRate.data?.rate?.storeRate ?? null;
  const total = sumMoney(
    form.rows.map((row) => lineTotal(row, form.currency)),
    form.currency,
  );
  const isInstallment = form.kind === SaleKind.INSTALLMENT;
  /**
   * §17.10 — naqd savdoda to'lovlar savdo summasiga teng bo'ladi,
   * nasiyada esa BOSHLANG'ICH TO'LOVGA: qolgani jadval bo'yicha keyin
   * keladi. Server ham aynan shu chegarani qo'llaydi.
   */
  const expectedPaid = isInstallment
    ? roundMoney(plan.downPayment.trim() === '' ? '0' : plan.downPayment, form.currency)
    : total;
  const remaining = remainingAmount(
    payments,
    activeAccounts,
    form.currency,
    storeRate,
    expectedPaid,
  );
  const isSettled = remaining === roundMoney('0', form.currency);

  const principal = principalFor(plan, total, form.currency);
  const scheduleTotal = sumMoney(
    plan.rows.map((row) => row.amount),
    form.currency,
  );
  // §9.6 — jadval summasi qarzga teng bo'lmasa savdo tasdiqlanmaydi
  const planReady =
    !isInstallment ||
    (form.customerId !== '' && plan.rows.length > 0 && scheduleTotal === principal);
  const hasIncompleteRow = form.rows.some(
    (row) => row.productId === '' || (row.inventoryItemId === '' && row.batchId === ''),
  );

  /**
   * §6.3 (`FRONTEND.md`) — saqlanmagan moliyaviy forma jimgina
   * yo'qolmasin. Marshrut o'zgarishini Next.js ushlab turmaydi, shuning
   * uchun sahifadan chiqish va yopish uchun brauzerning o'z
   * ogohlantirishi ishlatiladi.
   */
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [dirty]);

  const patch = (changes: Partial<FormState>): void => {
    setForm((current) => ({ ...current, ...changes }));
    setDirty(true);
  };

  const patchRow = (index: number, changes: Partial<CartRow>): void => {
    setForm((current) => ({
      ...current,
      rows: current.rows.map((row, position) =>
        position === index ? { ...row, ...changes } : row,
      ),
    }));
    setDirty(true);
  };

  const buildDraft = (): CreateSaleDraftInput | null => {
    const payload = {
      kind: form.kind,
      currency: form.currency,
      customerId: form.customerId === '' ? null : form.customerId,
      soldAt: toIsoDateTime(form.soldAt),
      note: form.note.trim() === '' ? null : form.note.trim(),
      items: form.rows
        .filter((row) => row.productId !== '')
        .map((row): SaleItemInput => ({
          productId: row.productId,
          inventoryItemId: row.inventoryItemId === '' ? null : row.inventoryItemId,
          batchId: row.batchId === '' ? null : row.batchId,
          quantity: safeQuantity(row.quantity),
          unitPrice: row.unitPrice,
        })),
    };

    // Serverga yuborishdan oldin AYNAN o'sha sxema bilan (`FRONTEND.md` §6.1)
    const parsed = createSaleDraftSchema.safeParse(payload);
    if (!parsed.success) {
      setIssues(zodIssues(parsed.error.issues));
      return null;
    }
    setIssues({});
    return parsed.data;
  };

  /** Qoralamani saqlaydi va serverdagi holatni qaytaradi. */
  const persistDraft = async (): Promise<SaleDto | null> => {
    const draft = buildDraft();
    if (!draft) return null;

    try {
      if (!sale) return await createDraft.mutateAsync(draft);

      const update: UpdateSaleDraftInput = {
        currency: draft.currency,
        customerId: draft.customerId ?? null,
        soldAt: draft.soldAt,
        note: draft.note ?? null,
        items: draft.items,
        expectedUpdatedAt: sale.updatedAt,
      };
      return await updateDraft.mutateAsync(update);
    } catch (error) {
      setIssues(serverIssues(error));
      return null;
    }
  };

  const handleSaveDraft = (event: React.FormEvent): void => {
    event.preventDefault();
    void (async () => {
      const saved = await persistDraft();
      if (!saved) return;
      setDirty(false);
      if (!sale) router.push(`/sales/${saved.id}`);
    })();
  };

  const handleConfirm = (): void => {
    const parsed = confirmSaleSchema.safeParse({
      soldAt: toIsoDateTime(form.soldAt),
      // §9.1 — nasiya sharti savdo bilan bitta so'rovda ketadi:
      // shartnoma o'sha tranzaksiya ichida tug'iladi
      installment: isInstallment
        ? {
            downPayment: plan.downPayment.trim() === '' ? '0' : plan.downPayment,
            ...(plan.markupMode === 'amount'
              ? { markupAmount: plan.markupValue.trim() === '' ? '0' : plan.markupValue }
              : { markupPercent: plan.markupValue.trim() === '' ? '0' : plan.markupValue }),
            schedule: plan.rows,
          }
        : undefined,
      payments: payments.map((row) => ({
        method: row.method,
        amount: row.amount,
        currency:
          activeAccounts.find((account) => account.id === row.cashAccountId)?.currency ??
          form.currency,
        cashAccountId: row.cashAccountId,
        note: null,
      })),
    } satisfies Record<string, unknown>);

    if (!parsed.success) {
      setIssues(zodIssues(parsed.error.issues));
      return;
    }

    void (async () => {
      const saved = await persistDraft();
      if (!saved) return;

      confirmSale.mutate(
        { input: parsed.data satisfies ConfirmSaleInput, idempotencyKey: idempotency.key },
        {
          onSuccess: (confirmed) => {
            setDirty(false);
            // Tasdiqlangan savdo sahifasiga o'tiladi, lekin forma shu
            // zahoti yo'qolishiga tayanib bo'lmaydi (navigatsiya sekin
            // bo'lishi yoki bekor qilinishi mumkin). Ishlatilgan kalit
            // qolib ketsa, keyingi tasdiqlash serverdan **shu savdoning
            // saqlangan javobini** olardi va ega ikkinchi savdo
            // yozilgan deb o'ylardi
            idempotency.renew();
            router.push(`/sales/${confirmed.id}`);
          },
          onError: (error) => {
            setIssues(serverIssues(error));
            /**
             * T-07 — xatodan keyin ham kalit yangilanishi kerak.
             *
             * §5.5 bo'yicha "birinchi tasdiqlagan oladi": ega tasdiqlaganda
             * savatdagi IMEI allaqachon boshqa savdoda ketgan bo'lishi
             * mumkin (`SALE_ITEM_NOT_AVAILABLE`). Ega o'sha qatorni
             * almashtirib qayta bosadi — mazmun o'zgargan, kalit esa eski.
             * Server bunday juftlikni `IDEMPOTENCY_KEY_REUSED` bilan rad
             * etadi va yagona chiqish sahifani yangilash, ya'ni butun
             * savatni yo'qotish bo'lardi.
             *
             * Yangilash **shartli** — qaysi xatoda xavfsiz ekani va nega
             * bu ikkinchi savdo yaratmasligi `use-idempotency-key.ts` da
             * batafsil yozilgan. Qisqasi: kalit faqat server amalni
             * bajarmagani ANIQ bo'lgan holatda almashadi.
             */
            idempotency.renewAfterError(error);
          },
        },
      );
    })();
  };

  if (products.isPending || accounts.isPending) {
    return (
      <Card>
        <TableSkeleton rows={5} />
      </Card>
    );
  }

  if (products.isError) {
    return <ErrorState error={products.error} onRetry={() => void products.refetch()} />;
  }
  if (accounts.isError) {
    return <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />;
  }

  const pending = createDraft.isPending || updateDraft.isPending || confirmSale.isPending;
  const failure = confirmSale.error ?? updateDraft.error ?? createDraft.error;

  return (
    <form onSubmit={handleSaveDraft} noValidate className="flex flex-col gap-4">
      {failure && (
        <p
          className="m-0 rounded-md bg-danger-bg px-3 py-2 text-sm font-medium text-danger"
          role="alert"
        >
          {errorMessage(failure)}
        </p>
      )}

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <div className="min-w-36 flex-1">
            <Field label="Savdo turi" htmlFor="kind" error={issues.kind}>
              {/* §9 — nasiya tanlansa shartnoma paneli ochiladi */}
              <Select
                id="kind"
                value={form.kind}
                onChange={(event) => {
                  patch({ kind: event.target.value as SaleKind });
                }}
              >
                <option value={SaleKind.CASH}>Naqd</option>
                <option value={SaleKind.INSTALLMENT}>Nasiya</option>
              </Select>
            </Field>
          </div>

          <div className="min-w-36 flex-1">
            <Field label="Valyuta" htmlFor="currency" error={issues.currency}>
              {/* §1.9 — bitta savdo, bitta valyuta; ega aniq tanlaydi */}
              <Select
                id="currency"
                value={form.currency}
                onChange={(event) => {
                  patch({ currency: event.target.value as Currency });
                }}
              >
                <option value={Currency.UZS}>so‘m (UZS)</option>
                <option value={Currency.USD}>dollar (USD)</option>
              </Select>
            </Field>
          </div>

          <div className="min-w-48 flex-2">
            <Field
              label={isInstallment ? 'Mijoz (majburiy)' : 'Mijoz (ixtiyoriy)'}
              htmlFor="customerId"
              error={
                issues.customerId ??
                (isInstallment && form.customerId === ''
                  ? 'Nasiyada mijoz majburiy — qarz kimning zimmasida ekani yozilishi kerak'
                  : undefined)
              }
            >
              {/* §6.1 — naqd savdoda mijoz ixtiyoriy; nasiyada esa
                  qarzdorsiz qarz bo'lmaydi */}
              <Select
                id="customerId"
                value={form.customerId}
                onChange={(event) => {
                  patch({ customerId: event.target.value });
                }}
              >
                <option value="">Tanlanmagan</option>
                {(customers.data?.data ?? []).map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.fullName}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="min-w-40 flex-1">
            <Field label="Savdo sanasi" htmlFor="soldAt" error={issues.soldAt}>
              {/* §7.5 — 7 kungacha orqaga; chegarani server ham tekshiradi */}
              <Input
                id="soldAt"
                type="date"
                value={form.soldAt}
                max={todayInShopZone()}
                min={daysAgoInShopZone(7)}
                onChange={(event) => {
                  patch({ soldAt: event.target.value });
                }}
              />
            </Field>
          </div>
        </div>

        <Field label="Izoh (ixtiyoriy)" htmlFor="note" error={issues.note}>
          <Input
            id="note"
            value={form.note}
            onChange={(event) => {
              patch({ note: event.target.value });
            }}
          />
        </Field>
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-lg font-semibold">Savat</h2>
          <span className="text-sm text-text-tertiary">{form.rows.length} / 100</span>
        </div>

        {issues.items && (
          <p className="m-0 text-sm text-danger" role="alert">
            {issues.items}
          </p>
        )}

        {form.rows.map((row, index) => (
          <CartRowFields
            key={row.key}
            row={row}
            index={index}
            products={products.data?.data ?? []}
            currency={form.currency}
            storeRate={storeRate}
            canSeeCost={can(user.data, 'cost.view')}
            issues={issues}
            removable={form.rows.length > 1}
            onChange={(changes) => {
              patchRow(index, changes);
            }}
            onRemove={() => {
              patch({ rows: form.rows.filter((_, position) => position !== index) });
            }}
          />
        ))}

        <div>
          <Button
            type="button"
            disabled={form.rows.length >= 100}
            onClick={() => {
              patch({ rows: [...form.rows, emptyCartRow()] });
            }}
          >
            <Plus size={16} aria-hidden="true" className="mr-2" />
            Yana mahsulot
          </Button>
        </div>
      </Card>

      {isInstallment && (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-lg font-semibold">Nasiya sharti (§9)</h2>
            <p className="m-0 text-sm text-text-secondary">
              Shartnoma savdo tasdiqlanganda yaratiladi — jadval summasi qarzga teng bo‘lishi shart
              (§9.6).
            </p>
          </div>

          <InstallmentPlanPanel
            plan={plan}
            cashPrice={total}
            currency={form.currency}
            error={issues['installment.schedule'] ?? issues.installment}
            onChange={(next) => {
              setPlan(next);
              setDirty(true);
            }}
          />
        </Card>
      )}

      <Card className="flex flex-col gap-4">
        <h2 className="m-0 text-lg font-semibold">
          {isInstallment ? 'Boshlang‘ich to‘lov' : 'To‘lov'}
        </h2>

        {activeAccounts.length === 0 ? (
          <p className="m-0 text-sm text-warning" role="status">
            Kassa hisobi hali ochilmagan — savdoni tasdiqlash uchun kamida bitta hisob kerak.{' '}
            <Link href="/cashbook" className="text-link">
              Kassaga o‘tish
            </Link>
          </p>
        ) : (
          <PaymentsPanel
            rows={payments}
            accounts={activeAccounts}
            currency={form.currency}
            storeRate={storeRate}
            total={expectedPaid}
            issues={issues}
            onChange={(rows) => {
              setPayments(rows);
              setDirty(true);
            }}
          />
        )}
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm text-text-secondary">Savdo summasi</div>
          <div className="text-2xl font-semibold">
            <Money amount={total} currency={form.currency} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {sale && (
            <Button
              type="button"
              variant="danger"
              disabled={pending || deleteDraft.isPending}
              onClick={() => {
                // §7.7 — qoralamani o'chirish hech narsaga ta'sir qilmaydi
                deleteDraft.mutate(sale.id, {
                  onSuccess: () => {
                    setDirty(false);
                    router.push('/sales');
                  },
                });
              }}
            >
              Qoralamani o‘chirish
            </Button>
          )}

          <Button type="submit" disabled={pending}>
            {createDraft.isPending || updateDraft.isPending ? 'Saqlanmoqda…' : 'Qoralamani saqlash'}
          </Button>

          <Button
            type="button"
            variant="primary"
            // §17.10 — to'lovlar summasi savdo summasiga teng bo'lmasa
            // tasdiqlanmaydi; §7 — birliksiz qator tasdiqlanmaydi
            disabled={
              pending ||
              !isSettled ||
              !planReady ||
              hasIncompleteRow ||
              total === roundMoney('0', form.currency) ||
              activeAccounts.length === 0
            }
            onClick={handleConfirm}
          >
            {confirmSale.isPending ? 'Tasdiqlanmoqda…' : 'Tasdiqlash'}
          </Button>
        </div>
      </Card>
    </form>
  );
}

/**
 * `YYYY-MM-DD` → do'kon zonasidagi ISO vaqt (`API.md` §2.2).
 *
 * Bugungi sana uchun **hozirgi vaqt** yuboriladi: kun boshidagi 00:00
 * savdoni bir necha soat orqaga surib qo'yardi va kunlik hisobotda
 * tartib buzilardi. Orqaga qo'yilgan sanada esa tush payti olinadi —
 * zona chegarasida kun almashib ketmasin.
 *
 * Toshkentda yozgi vaqt yo'q, shuning uchun ofset doimiy `+05:00`.
 */
function toIsoDateTime(date: string): string {
  if (date === todayInShopZone()) return new Date().toISOString();
  return `${date}T12:00:00+05:00`;
}

/** Sana maydonining quyi chegarasi — §7.5 dagi 7 kun. */
function daysAgoInShopZone(days: number): string {
  const date = new Date(Date.now() - days * 86_400_000);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: SHOP_TIME_ZONE }).format(date);
}

function zodIssues(
  issues: readonly { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const found: Record<string, string> = {};
  for (const issue of issues) {
    found[issue.path.map(String).join('.')] = issue.message;
  }
  return found;
}

function serverIssues(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};

  const found: Record<string, string> = {};
  for (const issue of error.issues) found[issue.field] = issue.message;
  if (error.field) found[error.field] = errorMessage(error);
  return found;
}
