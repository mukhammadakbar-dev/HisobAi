'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { apiRequest } from '@/lib/api';
import {
  ProductDto,
  InventoryItemDto,
  LowStockAlertDto,
} from '@baraka/contracts';
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  Layers,
  Barcode,
  RefreshCw,
} from 'lucide-react';

export default function InventoryPage() {
  // State
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [inventory, setInventory] = useState<InventoryItemDto[]>([]);
  const [lowStockAlerts, setLowStockAlerts] = useState<LowStockAlertDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('AVAILABLE');

  // Modals
  const [showProductModal, setShowProductModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // New Product Form State
  const [prodForm, setProdForm] = useState({
    category: 'Telefonlar',
    brand: '',
    model: '',
    storage: '',
    color: '',
    isSerialized: true,
    defaultSalePrice: '',
    minStockAlert: '2',
  });

  // Receive Stock Form State
  const [recForm, setRecForm] = useState({
    productId: '',
    imei: '',
    serialNumber: '',
    costPrice: '',
    quantity: '1',
  });

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [prodRes, invRes, alertRes] = await Promise.all([
        apiRequest<ProductDto[]>('/products'),
        apiRequest<InventoryItemDto[]>(
          `/inventory?status=${statusFilter}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''}`,
        ),
        apiRequest<LowStockAlertDto[]>('/inventory/low-stock'),
      ]);
      setProducts(prodRes);
      setInventory(invRes);
      setLowStockAlerts(alertRes);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Product Template Submit
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      await apiRequest('/products', {
        method: 'POST',
        body: JSON.stringify({
          category: prodForm.category,
          brand: prodForm.brand,
          model: prodForm.model,
          storage: prodForm.storage || undefined,
          color: prodForm.color || undefined,
          isSerialized: prodForm.isSerialized,
          defaultSalePrice: Number(prodForm.defaultSalePrice),
          minStockAlert: Number(prodForm.minStockAlert || 2),
        }),
      });

      setShowProductModal(false);
      setProdForm({
        category: 'Telefonlar',
        brand: '',
        model: '',
        storage: '',
        color: '',
        isSerialized: true,
        defaultSalePrice: '',
        minStockAlert: '2',
      });
      await fetchData();
    } catch (err: any) {
      setFormError(err?.message || 'Mahsulot yaratishda xatolik');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Stock Receive Submit
  const handleReceiveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      await apiRequest('/inventory/receive', {
        method: 'POST',
        body: JSON.stringify({
          productId: recForm.productId,
          imei: recForm.imei || undefined,
          serialNumber: recForm.serialNumber || undefined,
          costPrice: Number(recForm.costPrice),
          quantity: Number(recForm.quantity || 1),
        }),
      });

      setShowReceiveModal(false);
      setRecForm({
        productId: '',
        imei: '',
        serialNumber: '',
        costPrice: '',
        quantity: '1',
      });
      await fetchData();
    } catch (err: any) {
      setFormError(err?.message || 'Omborga qabul qilishda xatolik');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fmt = (num: number) => `${(num || 0).toLocaleString('uz-UZ')} UZS`;

  const selectedProductForReceive = products.find((p) => p.id === recForm.productId);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl glass-panel border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Package className="w-7 h-7 text-emerald-400" />
            Ombor va Katalog Boshqaruvi
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Mahsulot shablonlarini yaratish, omborga qabul va IMEI seriyalarini kuzatish
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setFormError(null);
              setShowProductModal(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 border border-slate-700 transition-all"
          >
            <Layers className="w-4 h-4 text-emerald-400" />
            <span>Yangi Shablon</span>
          </button>
          <button
            onClick={() => {
              setFormError(null);
              setShowReceiveModal(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Omborga Qabul Qilish</span>
          </button>
        </div>
      </div>

      {/* Low Stock Warnings Banner */}
      {lowStockAlerts.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2">
          <div className="flex items-center gap-2 font-bold text-sm">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <span>Zaxirasi kam qolgan mahsulotlar ogohlantirishi ({lowStockAlerts.length})</span>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {lowStockAlerts.map((alert) => (
              <span
                key={alert.product.id}
                className="px-3 py-1 rounded-lg bg-amber-500/20 border border-amber-500/30 font-medium"
              >
                {alert.product.brand} {alert.product.model} ({alert.product.storage || ''}) —{' '}
                <strong className="text-amber-200">{alert.availableQuantity} ta qoldi</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="p-4 rounded-2xl glass-panel border border-slate-800 flex flex-col sm:flex-row gap-3 items-center justify-between">
        {/* Search Bar */}
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="IMEI, Seriya, Brend yoki Model bo'yicha tezkor qidiruv..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          {[
            { id: 'AVAILABLE', label: 'Mavjud' },
            { id: 'SOLD', label: 'Sotilgan' },
            { id: 'RESERVED', label: 'Zaxirada' },
            { id: 'RETURNED', label: 'Qaytarilgan' },
          ].map((st) => (
            <button
              key={st.id}
              onClick={() => setStatusFilter(st.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                statusFilter === st.id
                  ? 'bg-emerald-500 text-white font-semibold shadow-sm'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              {st.label}
            </button>
          ))}
          <button
            onClick={fetchData}
            title="Yangilash"
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="rounded-3xl glass-panel border border-slate-800 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Yuklanmoqda...
          </div>
        ) : inventory.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            Omborda mos keladigan mahsulotlar topilmadi
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Mahsulot / Model</th>
                  <th className="py-3.5 px-4">IMEI / Seriya</th>
                  <th className="py-3.5 px-4">Xotira / Rang</th>
                  <th className="py-3.5 px-4">Tannarx</th>
                  <th className="py-3.5 px-4">Sotuv Narxi</th>
                  <th className="py-3.5 px-4">Holat</th>
                  <th className="py-3.5 px-4">Sana</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {inventory.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-100">
                      <div>
                        {item.product?.brand} {item.product?.model}
                      </div>
                      <div className="text-[10px] text-slate-500 font-normal">
                        {item.product?.category}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300">
                      {item.imei ? (
                        <div className="flex items-center gap-1">
                          <Barcode className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>{item.imei}</span>
                        </div>
                      ) : item.serialNumber ? (
                        <span>SN: {item.serialNumber}</span>
                      ) : (
                        <span className="text-slate-500 italic">Miqdorli birlik</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {item.product?.storage || '—'} / {item.product?.color || '—'}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-300">
                      {fmt(item.costPrice)}
                    </td>
                    <td className="py-3 px-4 font-semibold text-emerald-400">
                      {fmt(item.product?.defaultSalePrice || 0)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${
                          item.status === 'AVAILABLE'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : item.status === 'SOLD'
                            ? 'bg-slate-800 text-slate-400 border border-slate-700'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}
                      >
                        {item.status === 'AVAILABLE'
                          ? 'MAVJUD'
                          : item.status === 'SOLD'
                          ? 'SOTILGAN'
                          : item.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-[11px]">
                      {new Date(item.receivedAt).toLocaleDateString('uz-UZ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal 1: Create Product Template */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md glass-panel rounded-3xl p-6 border border-slate-800 space-y-4">
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-400" />
              Yangi Mahsulot Shablonini Yaratish
            </h2>

            {formError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateProduct} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Kategoriya</label>
                <input
                  type="text"
                  required
                  value={prodForm.category}
                  onChange={(e) => setProdForm({ ...prodForm, category: e.target.value })}
                  placeholder="Telefonlar, Aksessuarlar..."
                  className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 focus:border-emerald-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Brend</label>
                  <input
                    type="text"
                    required
                    value={prodForm.brand}
                    onChange={(e) => setProdForm({ ...prodForm, brand: e.target.value })}
                    placeholder="Apple, Samsung..."
                    className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Model</label>
                  <input
                    type="text"
                    required
                    value={prodForm.model}
                    onChange={(e) => setProdForm({ ...prodForm, model: e.target.value })}
                    placeholder="iPhone 15 Pro, S24..."
                    className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Xotira (ixtiyoriy)</label>
                  <input
                    type="text"
                    value={prodForm.storage}
                    onChange={(e) => setProdForm({ ...prodForm, storage: e.target.value })}
                    placeholder="128GB, 256GB..."
                    className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Rang (ixtiyoriy)</label>
                  <input
                    type="text"
                    value={prodForm.color}
                    onChange={(e) => setProdForm({ ...prodForm, color: e.target.value })}
                    placeholder="Black, Natural..."
                    className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Sotuv Narxi (UZS)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={prodForm.defaultSalePrice}
                    onChange={(e) =>
                      setProdForm({ ...prodForm, defaultSalePrice: e.target.value })
                    }
                    placeholder="12500000"
                    className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Min. Zaxira Limiti</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={prodForm.minStockAlert}
                    onChange={(e) => setProdForm({ ...prodForm, minStockAlert: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isSerialized"
                  checked={prodForm.isSerialized}
                  onChange={(e) => setProdForm({ ...prodForm, isSerialized: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
                <label htmlFor="isSerialized" className="text-slate-300 font-medium cursor-pointer">
                  IMEI / Seriyali mahsulot (telefon, noutbuk va h.k.)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
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

      {/* Modal 2: Receive Stock to Inventory */}
      {showReceiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md glass-panel rounded-3xl p-6 border border-slate-800 space-y-4">
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-400" />
              Omborga Mahsulot Qabul Qilish
            </h2>

            {formError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleReceiveStock} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Mahsulot Shablonini Tanlang</label>
                <select
                  required
                  value={recForm.productId}
                  onChange={(e) => setRecForm({ ...recForm, productId: e.target.value })}
                  className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 focus:border-emerald-500 outline-none"
                >
                  <option value="">-- Mahsulotni tanlang --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.brand} {p.model} ({p.storage || ''} {p.color || ''}) — {p.category}
                    </option>
                  ))}
                </select>
              </div>

              {selectedProductForReceive?.isSerialized ? (
                <>
                  <div>
                    <label className="block text-slate-400 mb-1">IMEI Raqami</label>
                    <input
                      type="text"
                      value={recForm.imei}
                      onChange={(e) => setRecForm({ ...recForm, imei: e.target.value })}
                      placeholder="864201061234567"
                      className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 font-mono focus:border-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Seriya Raqami (SN - ixtiyoriy)</label>
                    <input
                      type="text"
                      value={recForm.serialNumber}
                      onChange={(e) => setRecForm({ ...recForm, serialNumber: e.target.value })}
                      placeholder="C02G1234MD6R"
                      className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 font-mono focus:border-emerald-500 outline-none"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-slate-400 mb-1">Miqdori (dona)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={recForm.quantity}
                    onChange={(e) => setRecForm({ ...recForm, quantity: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 focus:border-emerald-500 outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-400 mb-1">Kelish Tannarxi (UZS)</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={recForm.costPrice}
                  onChange={(e) => setRecForm({ ...recForm, costPrice: e.target.value })}
                  placeholder="10500000"
                  className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 focus:border-emerald-500 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowReceiveModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/20"
                >
                  Qabul Qilish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
