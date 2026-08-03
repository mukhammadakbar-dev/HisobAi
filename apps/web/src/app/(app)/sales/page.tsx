'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { apiRequest } from '@/lib/api';
import {
  SaleDto,
  InventoryItemDto,
  CustomerDto,
  SaleKind,
  SaleStatus,
} from '@baraka/contracts';
import {
  ShoppingBag,
  Search,
  Plus,
  Trash2,
  CheckCircle2,
  RotateCcw,
  CreditCard,
  User,
  Calendar,
  AlertCircle,
  Barcode,
  RefreshCw,
  Clock,
} from 'lucide-react';

interface CartItem {
  inventoryItemId?: string;
  productId: string;
  title: string;
  subtitle: string;
  imei?: string | null;
  isSerialized: boolean;
  unitPrice: number;
  quantity: number;
}

export default function SalesPage() {
  const [activeTab, setActiveTab] = useState<'pos' | 'history'>('pos');

  // Available inventory items for POS search
  const [availableInventory, setAvailableInventory] = useState<InventoryItemDto[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchLoading, setIsSearchLoading] = useState(false);

  // Customers list for installment sales
  const [customers, setCustomers] = useState<CustomerDto[]>([]);

  // Cart & POS State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saleKind, setSaleKind] = useState<SaleKind>(SaleKind.CASH);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [discount, setDiscount] = useState<number>(0);
  const [downPayment, setDownPayment] = useState<number>(0);
  const [installmentMonths, setInstallmentMonths] = useState<number>(6);

  // Sales History State
  const [salesHistory, setSalesHistory] = useState<SaleDto[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  // Form submit state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Fetch Available Inventory
  const fetchAvailableInventory = useCallback(async () => {
    try {
      setIsSearchLoading(true);
      const res = await apiRequest<InventoryItemDto[]>(
        `/inventory?status=AVAILABLE${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''}`,
      );
      setAvailableInventory(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSearchLoading(false);
    }
  }, [searchQuery]);

  // Fetch Customers
  const fetchCustomers = useCallback(async () => {
    try {
      const res = await apiRequest<CustomerDto[]>('/customers');
      setCustomers(res);
    } catch (err: any) {
      console.error(err);
    }
  }, []);

  // Fetch Sales History
  const fetchSalesHistory = useCallback(async () => {
    try {
      setIsHistoryLoading(true);
      const res = await apiRequest<SaleDto[]>('/sales');
      setSalesHistory(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAvailableInventory();
    fetchCustomers();
    fetchSalesHistory();
  }, [fetchAvailableInventory, fetchCustomers, fetchSalesHistory]);

  // Add Item to Cart
  const handleAddToCart = (inv: InventoryItemDto) => {
    if (inv.imei && cart.some((c) => c.inventoryItemId === inv.id)) {
      alert('Ushbu IMEI raqamli mahsulot allaqachon savatga qo\'shilgan!');
      return;
    }

    const price = inv.product?.defaultSalePrice || 0;
    const title = `${inv.product?.brand || ''} ${inv.product?.model || ''}`.trim();
    const subtitle = `${inv.product?.storage || ''} ${inv.product?.color || ''}`.trim();

    setCart((prev) => [
      ...prev,
      {
        inventoryItemId: inv.id,
        productId: inv.productId,
        title,
        subtitle,
        imei: inv.imei,
        isSerialized: inv.product?.isSerialized ?? true,
        unitPrice: price,
        quantity: 1,
      },
    ]);
  };

  const handleRemoveFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const handleQuantityChange = (index: number, qty: number) => {
    setCart((prev) =>
      prev.map((item, i) => (i === index ? { ...item, quantity: Math.max(1, qty) } : item)),
    );
  };

  const handleUnitPriceChange = (index: number, price: number) => {
    setCart((prev) =>
      prev.map((item, i) => (i === index ? { ...item, unitPrice: Math.max(0, price) } : item)),
    );
  };

  // Subtotal & Running Total calculations
  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const total = Math.max(0, subtotal - (discount || 0));
  const principal = Math.max(0, total - (downPayment || 0));
  const monthlyPaymentEstimate = installmentMonths > 0 ? principal / installmentMonths : 0;

  // Confirm Sale Execution (Draft + Confirm in 1 smooth transaction)
  const handleConfirmSale = async () => {
    if (cart.length === 0) {
      setErrorMsg('Savat bo\'sh! Mahsulot tanlang');
      return;
    }

    if (saleKind === SaleKind.INSTALLMENT && !selectedCustomerId) {
      setErrorMsg('Nasiya savdo uchun mijoz tanlanishi shart!');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    try {
      // 1. Create Draft Sale
      const draft = await apiRequest<SaleDto>('/sales', {
        method: 'POST',
        body: JSON.stringify({
          customerId: selectedCustomerId || undefined,
          kind: saleKind,
          discount: Number(discount || 0),
          items: cart.map((c) => ({
            inventoryItemId: c.inventoryItemId,
            productId: c.productId,
            quantity: c.quantity,
            unitPrice: c.unitPrice,
          })),
        }),
      });

      // 2. Confirm Sale (Atomic DB Transaction)
      await apiRequest(`/sales/${draft.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          downPayment: saleKind === SaleKind.INSTALLMENT ? Number(downPayment || 0) : undefined,
          installmentMonths:
            saleKind === SaleKind.INSTALLMENT ? Number(installmentMonths || 6) : undefined,
        }),
      });

      setSuccessMsg('Savdo muvaffaqiyatli amalga oshirildi va ombordan chiqarildi!');
      setCart([]);
      setDiscount(0);
      setDownPayment(0);
      setSelectedCustomerId('');

      await Promise.all([fetchAvailableInventory(), fetchSalesHistory()]);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Savdoni tasdiqlashda xatolik yuz berdi');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reverse / Cancel Confirmed Sale
  const handleReverseSale = async (saleId: string) => {
    if (!confirm('Haqiqatdan ham ushbu savdoni bekor qilmoqchimisiz? Ombor mahsuloti va kassa holati avtomatik qaytariladi.')) {
      return;
    }

    try {
      await apiRequest(`/sales/${saleId}/reverse`, { method: 'POST' });
      await Promise.all([fetchAvailableInventory(), fetchSalesHistory()]);
    } catch (err: any) {
      alert(err?.message || 'Savdoni bekor qilishda xatolik');
    }
  };

  const fmt = (num: number) => `${(num || 0).toLocaleString('uz-UZ')} UZS`;

  return (
    <div className="space-y-6">
      {/* Header & Tabs Toolbar */}
      <div className="p-6 rounded-3xl glass-panel border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <ShoppingBag className="w-7 h-7 text-emerald-400" />
            Savdo Moduli (POS & Kassa)
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Naqd va Nasiya savdolari, atomik tranzaksiyali kassa va ombor chiqaruvlari
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-900 border border-slate-800">
          <button
            onClick={() => setActiveTab('pos')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'pos'
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Yangi Savdo (POS)</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('history');
              fetchSalesHistory();
            }}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'history'
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Savdolar Tarixi</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: POS / NEW SALE */}
      {activeTab === 'pos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Panel: Inventory Item Picker (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="p-4 rounded-2xl glass-panel border border-slate-800 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="IMEI, Seriya yoki Model nomi bo'yicha qidirish..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="text-[11px] text-slate-400 font-medium">
                Ombordagi mavjud mahsulotlar ({availableInventory.length} ta)
              </div>
            </div>

            {/* Inventory Items List */}
            <div className="rounded-3xl glass-panel border border-slate-800 overflow-hidden max-h-[550px] overflow-y-auto">
              {isSearchLoading ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Ombor yuklanmoqda...
                </div>
              ) : availableInventory.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Mavjud mahsulot topilmadi
                </div>
              ) : (
                <div className="divide-y divide-slate-800/60 text-xs">
                  {availableInventory.map((inv) => (
                    <div
                      key={inv.id}
                      onClick={() => handleAddToCart(inv)}
                      className="p-3.5 hover:bg-slate-900/60 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                    >
                      <div className="space-y-1">
                        <div className="font-semibold text-slate-100 group-hover:text-emerald-400 transition-colors">
                          {inv.product?.brand} {inv.product?.model}
                        </div>
                        <div className="flex items-center gap-2 font-mono text-slate-400 text-[11px]">
                          {inv.imei && (
                            <span className="flex items-center gap-1 text-emerald-400">
                              <Barcode className="w-3.5 h-3.5" />
                              {inv.imei}
                            </span>
                          )}
                          <span>
                            {inv.product?.storage || ''} {inv.product?.color || ''}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-bold text-slate-100 text-sm">
                          {fmt(inv.product?.defaultSalePrice || 0)}
                        </div>
                        <button className="mt-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold flex items-center gap-1 border border-emerald-500/20 ml-auto">
                          <Plus className="w-3 h-3" />
                          <span>Qo'shish</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Cart & Payment Checkout (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-5 rounded-3xl glass-panel border border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-emerald-400" />
                  Savat ({cart.length})
                </h2>
                {cart.length > 0 && (
                  <button
                    onClick={() => setCart([])}
                    className="text-xs text-red-400 hover:text-red-300 font-medium"
                  >
                    Tozalash
                  </button>
                )}
              </div>

              {/* Status Notifications */}
              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}
              {successMsg && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Cart Items List */}
              {cart.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl">
                  Savat bo'sh. Mahsulot tanlang.
                </div>
              ) : (
                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {cart.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-semibold text-slate-100">{item.title}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {item.imei ? `IMEI: ${item.imei}` : item.subtitle}
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveFromCart(idx)}
                          className="text-slate-500 hover:text-red-400 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Quantity & Unit Price Inputs */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
                        <div className="w-24">
                          <label className="text-[10px] text-slate-500 block">Narxi (UZS)</label>
                          <input
                            type="number"
                            min="0"
                            value={item.unitPrice}
                            onChange={(e) => handleUnitPriceChange(idx, Number(e.target.value))}
                            className="w-full p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono text-[11px]"
                          />
                        </div>
                        <div className="text-right">
                          <label className="text-[10px] text-slate-500 block">Jami</label>
                          <span className="font-bold text-emerald-400 text-xs">
                            {fmt(item.unitPrice * item.quantity)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Checkout Form */}
              <div className="space-y-3 pt-3 border-t border-slate-800 text-xs">
                {/* Sale Kind Selector */}
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Savdo Turi</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSaleKind(SaleKind.CASH)}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                        saleKind === SaleKind.CASH
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Naqd Savdo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSaleKind(SaleKind.INSTALLMENT)}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                        saleKind === SaleKind.INSTALLMENT
                          ? 'bg-blue-500/10 border-blue-500 text-blue-400'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Calendar className="w-4 h-4" />
                      <span>Nasiya Savdo</span>
                    </button>
                  </div>
                </div>

                {/* Discount Input */}
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Chegirma (UZS)</label>
                  <input
                    type="number"
                    min="0"
                    value={discount}
                    onChange={(e) => setDiscount(Number(e.target.value))}
                    placeholder="0 UZS"
                    className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 font-mono outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Additional Installment Fields */}
                {saleKind === SaleKind.INSTALLMENT && (
                  <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 space-y-3">
                    <div>
                      <label className="block text-blue-300 mb-1 font-medium">Mijozni Tanlang *</label>
                      <div className="relative">
                        <User className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                        <select
                          value={selectedCustomerId}
                          onChange={(e) => setSelectedCustomerId(e.target.value)}
                          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 focus:border-blue-500 outline-none"
                        >
                          <option value="">-- Mijozni tanlang --</option>
                          {customers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.fullName} ({c.phoneE164})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-blue-300 mb-1 font-medium">
                          Boshlang'ich To'lov
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={downPayment}
                          onChange={(e) => setDownPayment(Number(e.target.value))}
                          placeholder="3000000"
                          className="w-full p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 font-mono outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-blue-300 mb-1 font-medium">Nasiya Muddati</label>
                        <select
                          value={installmentMonths}
                          onChange={(e) => setInstallmentMonths(Number(e.target.value))}
                          className="w-full p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 outline-none"
                        >
                          {[3, 6, 9, 12, 18, 24].map((m) => (
                            <option key={m} value={m}>
                              {m} oy
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="text-[11px] text-blue-300 pt-1 border-t border-blue-500/20 flex justify-between">
                      <span>Taxminiy oylik to'lov:</span>
                      <strong className="font-bold">{fmt(monthlyPaymentEstimate)} / oy</strong>
                    </div>
                  </div>
                )}

                {/* Calculations Summary */}
                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1.5 font-medium">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal:</span>
                    <span>{fmt(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Chegirma:</span>
                    <span className="text-amber-400">-{fmt(discount)}</span>
                  </div>
                  <div className="flex justify-between text-slate-100 text-sm font-bold pt-1.5 border-t border-slate-800">
                    <span>Yakuniy Summa:</span>
                    <span className="text-emerald-400">{fmt(total)}</span>
                  </div>
                </div>

                {/* Confirm Sale Button */}
                <button
                  type="button"
                  disabled={isSubmitting || cart.length === 0}
                  onClick={handleConfirmSale}
                  className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Savdoni Tasdiqlash</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: SALES HISTORY */}
      {activeTab === 'history' && (
        <div className="rounded-3xl glass-panel border border-slate-800 overflow-hidden">
          {isHistoryLoading ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Savdolar tarixi yuklanmoqda...
            </div>
          ) : salesHistory.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              Hali hech qanday savdo amalga oshirilmagan
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4">Savdo ID / Sana</th>
                    <th className="py-3.5 px-4">Mijoz</th>
                    <th className="py-3.5 px-4">Savdo Turi</th>
                    <th className="py-3.5 px-4">Mahsulotlar</th>
                    <th className="py-3.5 px-4">Summa</th>
                    <th className="py-3.5 px-4">Holat</th>
                    <th className="py-3.5 px-4">Amal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {salesHistory.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-200">
                        <div>#{sale.id.substring(0, 8)}</div>
                        <div className="text-[10px] text-slate-500 font-sans">
                          {new Date(sale.soldAt).toLocaleString('uz-UZ')}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">
                        {sale.customer ? (
                          <div>
                            <div className="font-semibold text-slate-100">{sale.customer.fullName}</div>
                            <div className="text-[10px] font-mono text-emerald-400">{sale.customer.phoneE164}</div>
                          </div>
                        ) : (
                          <span className="text-slate-500 font-italic">Oddiy Xaridor</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-1 rounded-md text-[10px] font-bold ${
                            sale.kind === 'CASH'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          }`}
                        >
                          {sale.kind === 'CASH' ? 'NAQD' : 'NASIYA'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">
                        {sale.saleItems.map((item) => (
                          <div key={item.id} className="truncate max-w-xs">
                            • {item.product?.brand} {item.product?.model}{' '}
                            {item.inventoryItem?.imei ? `(IMEI: ${item.inventoryItem.imei})` : ''}
                          </div>
                        ))}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-100">
                        {fmt(sale.total)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${
                            sale.status === 'CONFIRMED'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : sale.status === 'REVERSED'
                              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {sale.status === 'CONFIRMED'
                            ? 'TASDIQLANGAN'
                            : sale.status === 'REVERSED'
                            ? 'QAYTARILGAN'
                            : sale.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {sale.status === 'CONFIRMED' && (
                          <button
                            onClick={() => handleReverseSale(sale.id)}
                            className="px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-[10px] font-semibold flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Qaytarish</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
