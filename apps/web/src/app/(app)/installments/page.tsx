'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { apiRequest } from '@/lib/api';
import {
  InstallmentContractDto,
  PaymentDto,
  PaymentMethod,
  PaymentStatus,
  InstallmentStatus,
} from '@baraka/contracts';
import {
  Calendar,
  CreditCard,
  User,
  Clock,
  Plus,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Edit,
  Trash2,
  AlertCircle,
  FileText,
  DollarSign,
  X,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

export default function InstallmentsPage() {
  const [activeTab, setActiveTab] = useState<'contracts' | 'pending'>('contracts');

  // Installment Contracts List
  const [contracts, setContracts] = useState<InstallmentContractDto[]>([]);
  const [isContractsLoading, setIsContractsLoading] = useState(true);

  // Pending Transfer Payments List
  const [pendingPayments, setPendingPayments] = useState<PaymentDto[]>([]);
  const [isPendingLoading, setIsPendingLoading] = useState(false);

  // Selected Contract Modal
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [contractDetail, setContractDetail] = useState<InstallmentContractDto | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<'history' | 'schedule'>('schedule');

  // Record Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    method: PaymentMethod.CASH,
    receiptUrl: '',
  });

  // Edit Schedule State
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [editSchedules, setEditSchedules] = useState<{ dueDate: string; amountDue: number }[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch Contracts
  const fetchContracts = useCallback(async () => {
    try {
      setIsContractsLoading(true);
      const res = await apiRequest<InstallmentContractDto[]>('/installments');
      setContracts(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsContractsLoading(false);
    }
  }, []);

  // Fetch Pending Payments
  const fetchPendingPayments = useCallback(async () => {
    try {
      setIsPendingLoading(true);
      const res = await apiRequest<PaymentDto[]>('/payments/pending');
      setPendingPayments(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsPendingLoading(false);
    }
  }, []);

  // Fetch Single Contract Detail
  const fetchContractDetail = useCallback(async (id: string) => {
    try {
      setIsDetailLoading(true);
      const res = await apiRequest<InstallmentContractDto>(`/installments/${id}`);
      setContractDetail(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContracts();
    fetchPendingPayments();
  }, [fetchContracts, fetchPendingPayments]);

  const handleOpenDetail = (id: string) => {
    setSelectedContractId(id);
    setIsEditingSchedule(false);
    fetchContractDetail(id);
  };

  // Submit New Payment
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContractId) return;

    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      await apiRequest('/payments', {
        method: 'POST',
        body: JSON.stringify({
          contractId: selectedContractId,
          amount: Number(paymentForm.amount),
          method: paymentForm.method,
          receiptUrl: paymentForm.receiptUrl || undefined,
        }),
      });

      setShowPaymentModal(false);
      setPaymentForm({ amount: '', method: PaymentMethod.CASH, receiptUrl: '' });

      await Promise.all([
        fetchContractDetail(selectedContractId),
        fetchContracts(),
        fetchPendingPayments(),
      ]);
    } catch (err: any) {
      setErrorMsg(err?.message || 'To\'lovni kiritishda xatolik');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirm Transfer Payment (Admin)
  const handleConfirmTransfer = async (paymentId: string) => {
    try {
      await apiRequest(`/payments/${paymentId}/confirm`, { method: 'POST' });
      await Promise.all([fetchPendingPayments(), fetchContracts()]);
      if (selectedContractId) fetchContractDetail(selectedContractId);
    } catch (err: any) {
      alert(err?.message || 'To\'lovni tasdiqlashda xatolik');
    }
  };

  // Reject Transfer Payment (Admin)
  const handleRejectTransfer = async (paymentId: string) => {
    try {
      await apiRequest(`/payments/${paymentId}/reject`, { method: 'POST' });
      await fetchPendingPayments();
    } catch (err: any) {
      alert(err?.message || 'To\'lovni rad etishda xatolik');
    }
  };

  // Reverse Confirmed Payment
  const handleReversePayment = async (paymentId: string) => {
    if (!confirm('Haqiqatdan ham ushbu to\'lovni bekor qilmoqchimisiz? Qarz balansi qayta tiklanadi va kassa chiqimi yoziladi.')) {
      return;
    }

    try {
      await apiRequest(`/payments/${paymentId}/reverse`, { method: 'POST' });
      if (selectedContractId) await fetchContractDetail(selectedContractId);
      await fetchContracts();
    } catch (err: any) {
      alert(err?.message || 'To\'lovni bekor qilishda xatolik');
    }
  };

  // Schedule Editor Handlers
  const handleStartEditSchedule = () => {
    if (!contractDetail) return;
    setEditSchedules(
      contractDetail.paymentSchedules.map((s) => ({
        dueDate: s.dueDate.substring(0, 10),
        amountDue: s.amountDue,
      })),
    );
    setIsEditingSchedule(true);
  };

  const handleAddScheduleRow = () => {
    const nextDate = new Date();
    nextDate.setMonth(nextDate.getMonth() + editSchedules.length + 1);
    setEditSchedules([
      ...editSchedules,
      { dueDate: nextDate.toISOString().substring(0, 10), amountDue: 500000 },
    ]);
  };

  const handleRemoveScheduleRow = (idx: number) => {
    setEditSchedules(editSchedules.filter((_, i) => i !== idx));
  };

  const handleSaveSchedule = async () => {
    if (!selectedContractId) return;
    setIsSubmitting(true);
    try {
      await apiRequest(`/installments/${selectedContractId}/schedule`, {
        method: 'PATCH',
        body: JSON.stringify({ schedules: editSchedules }),
      });

      setIsEditingSchedule(false);
      await fetchContractDetail(selectedContractId);
    } catch (err: any) {
      alert(err?.message || 'To\'lov jadvalini saqlashda xatolik');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fmt = (num: number) => `${(num || 0).toLocaleString('uz-UZ')} UZS`;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl glass-panel border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Calendar className="w-7 h-7 text-emerald-400" />
            Nasiya Shartnomalari va To'lovlar
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Nasiya to'lov jadvallari, oylik to'lovlar monitoringi va karta o'tkazmalarini tasdiqlash
          </p>
        </div>

        {/* View Switcher */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-900 border border-slate-800">
          <button
            onClick={() => setActiveTab('contracts')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'contracts'
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Nasiya Shartnomalari</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('pending');
              fetchPendingPayments();
            }}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'pending'
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Kutilayotgan Karta To'lovlari ({pendingPayments.length})</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: CONTRACTS LIST */}
      {activeTab === 'contracts' && (
        <div className="rounded-3xl glass-panel border border-slate-800 overflow-hidden">
          {isContractsLoading ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Nasiya shartnomalari yuklanmoqda...
            </div>
          ) : contracts.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              Mavjud nasiya shartnomalari topilmadi
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4">Mijoz / Telefon</th>
                    <th className="py-3.5 px-4">Jami Summa (Principal)</th>
                    <th className="py-3.5 px-4">Boshlang'ich To'lov</th>
                    <th className="py-3.5 px-4">Qolgan Qarz Balansi</th>
                    <th className="py-3.5 px-4">Keyingi To'lov Sanasi</th>
                    <th className="py-3.5 px-4">Holat</th>
                    <th className="py-3.5 px-4">Amal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {contracts.map((c) => {
                    const nextSchedule = c.paymentSchedules.find(
                      (s) => s.status === 'PENDING' || s.status === 'PARTIAL',
                    );

                    return (
                      <tr
                        key={c.id}
                        onClick={() => handleOpenDetail(c.id)}
                        className="hover:bg-slate-900/40 transition-colors cursor-pointer"
                      >
                        <td className="py-3.5 px-4 font-semibold text-slate-100">
                          <div>{c.customer?.fullName}</div>
                          <div className="text-[10px] font-mono text-emerald-400">
                            {c.customer?.phoneE164}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-300">
                          {fmt(c.principal)}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400">
                          {fmt(c.downPayment)}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-emerald-400 text-sm">
                          {fmt(c.outstandingAmount)}
                        </td>
                        <td className="py-3.5 px-4 text-slate-300 font-mono text-[11px]">
                          {nextSchedule
                            ? new Date(nextSchedule.dueDate).toLocaleDateString('uz-UZ')
                            : '—'}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${
                              c.status === 'ACTIVE'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : c.status === 'CLOSED'
                                ? 'bg-slate-800 text-slate-400 border border-slate-700'
                                : 'bg-red-500/10 text-red-400 border border-red-500/20'
                            }`}
                          >
                            {c.status === 'ACTIVE'
                              ? 'FAOL'
                              : c.status === 'CLOSED'
                              ? 'YOPILGAN'
                              : c.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenDetail(c.id);
                            }}
                            className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium"
                          >
                            Tafsilotlar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: PENDING TRANSFER PAYMENTS */}
      {activeTab === 'pending' && (
        <div className="rounded-3xl glass-panel border border-slate-800 overflow-hidden">
          {isPendingLoading ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              Tekshiruvdagi to'lovlar yuklanmoqda...
            </div>
          ) : pendingPayments.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              Tekshiruv kutilayotgan karta to'lovlari mavjud emas
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4">Sana</th>
                    <th className="py-3.5 px-4">To'lov Summasi</th>
                    <th className="py-3.5 px-4">Usuli</th>
                    <th className="py-3.5 px-4">Chek / Fayl Hovolasi</th>
                    <th className="py-3.5 px-4">Holat</th>
                    <th className="py-3.5 px-4">Amallar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {pendingPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                        {new Date(p.createdAt).toLocaleString('uz-UZ')}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-100 text-sm">
                        {fmt(p.amount)}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-blue-400">
                        Karta o'tkazmasi
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {p.receiptUrl ? (
                          <a
                            href={p.receiptUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-400 underline hover:text-emerald-300 flex items-center gap-1"
                          >
                            <span>Chekni ko'rish</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-slate-500 italic">Chek yuklanmagan</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          TEKSHIRUVDA
                        </span>
                      </td>
                      <td className="py-3.5 px-4 flex items-center gap-2">
                        <button
                          onClick={() => handleConfirmTransfer(p.id)}
                          className="px-3 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Tasdiqlash</span>
                        </button>
                        <button
                          onClick={() => handleRejectTransfer(p.id)}
                          className="px-3 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-[11px] font-semibold flex items-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Rad etish</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: CONTRACT DETAIL & PAYMENT HISTORY & SCHEDULE */}
      {selectedContractId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-3xl glass-panel rounded-3xl p-6 border border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-400" />
                Nasiya Shartnomasi va To'lovlar Grafigi
              </h2>
              <button
                onClick={() => setSelectedContractId(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isDetailLoading ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Shartnoma ma'lumotlari yuklanmoqda...
              </div>
            ) : contractDetail ? (
              <div className="space-y-5 text-xs">
                {/* Contract Summary Box */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
                    <div className="text-slate-400 font-medium">Mijoz</div>
                    <div className="font-bold text-slate-100">
                      {contractDetail.customer?.fullName}
                    </div>
                    <div className="text-[10px] font-mono text-emerald-400">
                      {contractDetail.customer?.phoneE164}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
                    <div className="text-slate-400 font-medium">Jami Summa</div>
                    <div className="font-bold text-slate-100">
                      {fmt(contractDetail.principal)}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
                    <div className="text-slate-400 font-medium">Boshlang'ich To'lov</div>
                    <div className="font-bold text-slate-100">
                      {fmt(contractDetail.downPayment)}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                    <div className="text-emerald-400 font-medium">Qolgan Qarz</div>
                    <div className="font-bold text-emerald-300 text-base">
                      {fmt(contractDetail.outstandingAmount)}
                    </div>
                  </div>
                </div>

                {/* Actions & Tab Switcher */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setDetailTab('schedule')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                        detailTab === 'schedule'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}
                    >
                      To'lov Jadvali ({contractDetail.paymentSchedules.length})
                    </button>
                    <button
                      onClick={() => setDetailTab('history')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                        detailTab === 'history'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}
                    >
                      To'lovlar Tarixi ({contractDetail.payments.length})
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      setErrorMsg(null);
                      setPaymentForm({
                        amount: String(
                          contractDetail.paymentSchedules.find(
                            (s) => s.status === 'PENDING' || s.status === 'PARTIAL',
                          )?.amountDue || '',
                        ),
                        method: PaymentMethod.CASH,
                        receiptUrl: '',
                      });
                      setShowPaymentModal(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                  >
                    <Plus className="w-4 h-4" />
                    <span>To'lov Qabul Qilish</span>
                  </button>
                </div>

                {/* SUB-TAB 1: SCHEDULE TABLE */}
                {detailTab === 'schedule' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-200">To'lovlar Grafiki</h3>

                      {/* Manual Schedule Editor button (Only if no confirmed payments made yet) */}
                      {contractDetail.payments.filter((p) => p.status === 'CONFIRMED').length === 0 && (
                        <div>
                          {!isEditingSchedule ? (
                            <button
                              onClick={handleStartEditSchedule}
                              className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1 border border-slate-700"
                            >
                              <Edit className="w-3.5 h-3.5" />
                              <span>Jadvalni Tahrirlash</span>
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={handleSaveSchedule}
                                disabled={isSubmitting}
                                className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold"
                              >
                                Saqlash
                              </button>
                              <button
                                onClick={() => setIsEditingSchedule(false)}
                                className="px-3 py-1 rounded-lg bg-slate-800 text-slate-400 text-xs font-semibold"
                              >
                                Bekor qilish
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {!isEditingSchedule ? (
                      <div className="rounded-2xl border border-slate-800 overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-900 text-slate-400 uppercase tracking-wider font-semibold">
                            <tr>
                              <th className="py-2.5 px-3">#</th>
                              <th className="py-2.5 px-3">Muddati (Sana)</th>
                              <th className="py-2.5 px-3">To'lanishi Kerak</th>
                              <th className="py-2.5 px-3">To'langan</th>
                              <th className="py-2.5 px-3">Holat</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {contractDetail.paymentSchedules.map((s, i) => (
                              <tr key={s.id}>
                                <td className="py-2.5 px-3 font-mono text-slate-500">{i + 1}</td>
                                <td className="py-2.5 px-3 font-mono text-slate-200">
                                  {new Date(s.dueDate).toLocaleDateString('uz-UZ')}
                                </td>
                                <td className="py-2.5 px-3 font-semibold text-slate-100">
                                  {fmt(s.amountDue)}
                                </td>
                                <td className="py-2.5 px-3 text-slate-400">{fmt(s.amountPaid)}</td>
                                <td className="py-2.5 px-3">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      s.status === 'PAID'
                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                        : s.status === 'PARTIAL'
                                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                        : 'bg-slate-800 text-slate-400'
                                    }`}
                                  >
                                    {s.status === 'PAID'
                                      ? 'TO\'LANGAN'
                                      : s.status === 'PARTIAL'
                                      ? 'QISMAN'
                                      : 'KUTILMOQDA'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      /* Manual Schedule Editor Mode */
                      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                        <div className="space-y-2">
                          {editSchedules.map((row, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <span className="font-mono text-slate-500 w-6">{idx + 1}.</span>
                              <input
                                type="date"
                                value={row.dueDate}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setEditSchedules((prev) =>
                                    prev.map((r, i) => (i === idx ? { ...r, dueDate: val } : r)),
                                  );
                                }}
                                className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs"
                              />
                              <input
                                type="number"
                                min="0"
                                value={row.amountDue}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  setEditSchedules((prev) =>
                                    prev.map((r, i) => (i === idx ? { ...r, amountDue: val } : r)),
                                  );
                                }}
                                placeholder="Summa (UZS)"
                                className="flex-1 p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs font-mono"
                              />
                              <button
                                onClick={() => handleRemoveScheduleRow(idx)}
                                className="p-2 text-slate-500 hover:text-red-400"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>

                        <button
                          onClick={handleAddScheduleRow}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Yangi Oylik Qator Qo'shish</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* SUB-TAB 2: PAYMENTS HISTORY TABLE */}
                {detailTab === 'history' && (
                  <div className="rounded-2xl border border-slate-800 overflow-hidden">
                    {contractDetail.payments.length === 0 ? (
                      <div className="p-6 text-center text-slate-500">
                        To'lovlar tarixi yo'q
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900 text-slate-400 uppercase tracking-wider font-semibold">
                          <tr>
                            <th className="py-2.5 px-3">Sana</th>
                            <th className="py-2.5 px-3">Summa</th>
                            <th className="py-2.5 px-3">Usuli</th>
                            <th className="py-2.5 px-3">Holat</th>
                            <th className="py-2.5 px-3">Amal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {contractDetail.payments.map((p) => (
                            <tr key={p.id}>
                              <td className="py-2.5 px-3 font-mono text-slate-400">
                                {new Date(p.createdAt).toLocaleString('uz-UZ')}
                              </td>
                              <td className="py-2.5 px-3 font-bold text-slate-100">
                                {fmt(p.amount)}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-slate-300">
                                {p.method === 'CASH' ? 'Naqd' : 'Karta o\'tkazmasi'}
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    p.status === 'CONFIRMED'
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                      : p.status === 'PENDING_VERIFICATION'
                                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                  }`}
                                >
                                  {p.status === 'CONFIRMED'
                                    ? 'TASDIQLANGAN'
                                    : p.status === 'PENDING_VERIFICATION'
                                    ? 'TEKSHIRUVDA'
                                    : p.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                {p.status === 'CONFIRMED' && (
                                  <button
                                    onClick={() => handleReversePayment(p.id)}
                                    className="px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-semibold flex items-center gap-1"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>Bekor qilish</span>
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* MODAL 2: RECORD PAYMENT FORM */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md glass-panel rounded-3xl p-6 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                To'lov Qabul Qilish
              </h2>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleRecordPayment} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">To'lov Summasi (UZS)</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  placeholder="500000"
                  className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 font-mono focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">To'lov Usuli</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentForm({ ...paymentForm, method: PaymentMethod.CASH })}
                    className={`p-2.5 rounded-xl border font-semibold flex items-center justify-center gap-2 ${
                      paymentForm.method === PaymentMethod.CASH
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <DollarSign className="w-4 h-4" />
                    <span>Naqd</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPaymentForm({ ...paymentForm, method: PaymentMethod.CARD_TRANSFER })
                    }
                    className={`p-2.5 rounded-xl border font-semibold flex items-center justify-center gap-2 ${
                      paymentForm.method === PaymentMethod.CARD_TRANSFER
                        ? 'bg-blue-500/10 border-blue-500 text-blue-400'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Karta o'tkazmasi</span>
                  </button>
                </div>
              </div>

              {paymentForm.method === PaymentMethod.CARD_TRANSFER && (
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">
                    Chek Hovolasi / Fayl ID (ixtiyoriy)
                  </label>
                  <input
                    type="text"
                    value={paymentForm.receiptUrl}
                    onChange={(e) => setPaymentForm({ ...paymentForm, receiptUrl: e.target.value })}
                    placeholder="/uploads/receipt-123.jpg"
                    className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 font-mono outline-none"
                  />
                  <p className="text-[10px] text-amber-400 mt-1">
                    Karta o'tkazmasi tekshiruv kutilayotgan holatda saqlanadi va admin tasdiqlagach hisobga olinadi.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/20"
                >
                  To'lovni Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
