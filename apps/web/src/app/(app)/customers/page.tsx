'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { apiRequest } from '@/lib/api';
import { CustomerDto, CustomerDetailDto } from '@baraka/contracts';
import {
  Users,
  UserPlus,
  Search,
  Phone,
  MapPin,
  FileText,
  RefreshCw,
  AlertCircle,
  X,
  CreditCard,
  ShoppingBag,
} from 'lucide-react';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetailDto | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    address: '',
    note: '',
  });

  const fetchCustomers = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await apiRequest<CustomerDto[]>(
        `/customers${searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : ''}`,
      );
      setCustomers(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      await apiRequest('/customers', {
        method: 'POST',
        body: JSON.stringify({
          fullName: formData.fullName,
          phone: formData.phone,
          address: formData.address || undefined,
          note: formData.note || undefined,
        }),
      });

      setShowAddModal(false);
      setFormData({ fullName: '', phone: '', address: '', note: '' });
      await fetchCustomers();
    } catch (err: any) {
      setFormError(err?.message || 'Mijoz yaratishda xatolik yuz berdi');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewCustomer = async (id: string) => {
    setSelectedCustomerId(id);
    setIsDetailLoading(true);
    try {
      const res = await apiRequest<CustomerDetailDto>(`/customers/${id}`);
      setCustomerDetail(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsDetailLoading(false);
    }
  };

  const fmt = (num: number) => `${(num || 0).toLocaleString('uz-UZ')} UZS`;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl glass-panel border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Users className="w-7 h-7 text-emerald-400" />
            Mijozlar Boshqaruvi
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Mijozlar bazasi, E.164 telefon raqamlari, to'lov va nasiya qarzdorliklar tarixi
          </p>
        </div>
        <button
          onClick={() => {
            setFormError(null);
            setShowAddModal(true);
          }}
          className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
        >
          <UserPlus className="w-4 h-4" />
          <span>Yangi Mijoz Qo'shish</span>
        </button>
      </div>

      {/* Toolbar & Search */}
      <div className="p-4 rounded-2xl glass-panel border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Mijoz ismi yoki telefon raqami bo'yicha qidiruv..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <button
          onClick={fetchCustomers}
          title="Yangilash"
          className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 self-end sm:self-auto"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Customers Table */}
      <div className="rounded-3xl glass-panel border border-slate-800 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Yuklanmoqda...
          </div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            Mijozlar topilmadi
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">F.I.Sh. (Ismi)</th>
                  <th className="py-3.5 px-4">Telefon Raqami</th>
                  <th className="py-3.5 px-4">Manzili</th>
                  <th className="py-3.5 px-4">Qarz Qoldig'i</th>
                  <th className="py-3.5 px-4">Ro'yxatga Olingan</th>
                  <th className="py-3.5 px-4">Amal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {customers.map((cust) => (
                  <tr
                    key={cust.id}
                    onClick={() => handleViewCustomer(cust.id)}
                    className="hover:bg-slate-900/40 transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-4 font-semibold text-slate-100">
                      {cust.fullName}
                      {cust.note && (
                        <div className="text-[10px] text-slate-400 font-normal truncate max-w-xs">
                          {cust.note}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-emerald-400 font-medium">
                      {cust.phoneE164}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
                      {cust.address || '—'}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-100">
                      {fmt(cust.totalDebt)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                      {new Date(cust.createdAt).toLocaleDateString('uz-UZ')}
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewCustomer(cust.id);
                        }}
                        className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium"
                      >
                        Profil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal 1: Add Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md glass-panel rounded-3xl p-6 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-400" />
                Yangi Mijoz Qo'shish
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateCustomer} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Mijoz F.I.Sh. (Ismi)</label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="Alisher Navoiy"
                  className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Telefon Raqami (E.164 format)</label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+998 90 123 45 67"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 font-mono focus:border-emerald-500 outline-none"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Format: +998901234567 (dublikat raqamlarga yo'l qo'yilmaydi)
                </p>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Manzili (ixtiyoriy)</label>
                <div className="relative">
                  <MapPin className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Toshkent sh., Chilonzor t."
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Izoh (ixtiyoriy)</label>
                <textarea
                  rows={2}
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  placeholder="Doimiy mijoz..."
                  className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 focus:border-emerald-500 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/20"
                >
                  Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Customer Profile Drawer / Modal */}
      {selectedCustomerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg glass-panel rounded-3xl p-6 border border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-400" />
                Mijoz Kartasi va Profili
              </h2>
              <button
                onClick={() => setSelectedCustomerId(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isDetailLoading ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Profil ma'lumotlari yuklanmoqda...
              </div>
            ) : customerDetail ? (
              <div className="space-y-4 text-xs">
                {/* Profile Main Box */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="text-base font-bold text-slate-100">
                    {customerDetail.fullName}
                  </div>
                  <div className="flex items-center gap-2 font-mono text-emerald-400 font-medium">
                    <Phone className="w-4 h-4" />
                    <span>{customerDetail.phoneE164}</span>
                  </div>
                  {customerDetail.address && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span>{customerDetail.address}</span>
                    </div>
                  )}
                  {customerDetail.note && (
                    <div className="flex items-start gap-2 text-slate-400 pt-1 border-t border-slate-800/60">
                      <FileText className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{customerDetail.note}</span>
                    </div>
                  )}
                </div>

                {/* Debt & History Summary Cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                    <div className="text-slate-400 font-medium flex items-center gap-1">
                      <CreditCard className="w-4 h-4 text-amber-400" />
                      Joriy Qarzdorlik
                    </div>
                    <div className="text-sm font-bold text-slate-100">
                      {fmt(customerDetail.totalDebt)}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                    <div className="text-slate-400 font-medium flex items-center gap-1">
                      <ShoppingBag className="w-4 h-4 text-emerald-400" />
                      Sotuvlar Soni
                    </div>
                    <div className="text-sm font-bold text-slate-100">
                      {customerDetail.salesCount} ta savdo
                    </div>
                  </div>
                </div>

                {/* Info Note for Future Modules */}
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-500">
                  Nasiya shartnomalari hamda to'lovlar tarixi kelgusi Sales & Installments modullari ulanganidan so'ng avtomatik profil kartasida aks etadi.
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
