'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { apiRequest } from '@/lib/api';
import { ReportSummaryDto } from '@baraka/contracts';
import {
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  PieChart as PieIcon,
  ShoppingBag,
  CreditCard,
  Package,
  CalendarClock,
  ArrowUpRight,
  ArrowDownLeft,
  Scale,
  Award,
  RefreshCw,
  Printer,
  Calendar,
  Layers,
} from 'lucide-react';

const COLORS = ['#10b981', '#38bdf8', '#a855f7', '#f59e0b', '#ef4444'];

export default function ReportsPage() {
  const [report, setReport] = useState<ReportSummaryDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Date Filters
  const [rangeType, setRangeType] = useState<'today' | 'week' | 'month' | 'year' | 'custom'>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const fetchReport = useCallback(async () => {
    try {
      setIsLoading(true);
      let fromStr = '';
      let toStr = '';
      const now = new Date();

      if (rangeType === 'today') {
        fromStr = now.toISOString().substring(0, 10);
        toStr = fromStr;
      } else if (rangeType === 'week') {
        const pastWeek = new Date(now);
        pastWeek.setDate(now.getDate() - 7);
        fromStr = pastWeek.toISOString().substring(0, 10);
        toStr = now.toISOString().substring(0, 10);
      } else if (rangeType === 'month') {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        fromStr = firstDay.toISOString().substring(0, 10);
        toStr = now.toISOString().substring(0, 10);
      } else if (rangeType === 'year') {
        const firstDay = new Date(now.getFullYear(), 0, 1);
        fromStr = firstDay.toISOString().substring(0, 10);
        toStr = now.toISOString().substring(0, 10);
      } else if (rangeType === 'custom') {
        fromStr = customFrom;
        toStr = customTo;
      }

      const params = new URLSearchParams();
      if (fromStr) params.set('from', fromStr);
      if (toStr) params.set('to', toStr);

      const res = await apiRequest<ReportSummaryDto>(`/reports/summary?${params.toString()}`);
      setReport(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [rangeType, customFrom, customTo]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const fmt = (num: number) => `${(num || 0).toLocaleString('uz-UZ')} UZS`;

  // Prepare chart data
  const salesTypePieData = report
    ? [
        { name: 'Naqd Savdo', value: report.sales.cashSales.amount },
        { name: 'Nasiya Savdo', value: report.sales.installmentSales.amount },
        { name: 'Aralash Savdo', value: report.sales.mixedSales.amount },
      ].filter((d) => d.value > 0)
    : [];

  const topBrandsChartData = report
    ? report.topBrands.map((b) => ({
        name: b.name,
        revenue: b.revenue,
        count: b.count,
      }))
    : [];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl glass-panel border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-emerald-400" />
            Moliya va Savdo Hisobotlari
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Savdo tushumi, kassa oqimi, yalpi foyda, nasiya qarzdorligi va sotuv dinamikasi tahlili
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="px-4 py-2.5 rounded-2xl text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 flex items-center gap-2 transition-all"
          >
            <Printer className="w-4 h-4 text-emerald-400" />
            Chop Etish
          </button>
        </div>
      </div>

      {/* Date Filter Bar */}
      <div className="p-4 rounded-2xl glass-panel border border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-400">Vaqt Oralig'i:</span>

          <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setRangeType('today')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                rangeType === 'today' ? 'bg-emerald-500 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Bugun
            </button>
            <button
              onClick={() => setRangeType('week')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                rangeType === 'week' ? 'bg-emerald-500 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Shu hafta
            </button>
            <button
              onClick={() => setRangeType('month')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                rangeType === 'month' ? 'bg-emerald-500 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Shu oy
            </button>
            <button
              onClick={() => setRangeType('year')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                rangeType === 'year' ? 'bg-emerald-500 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Shu yil
            </button>
            <button
              onClick={() => setRangeType('custom')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                rangeType === 'custom' ? 'bg-emerald-500 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Boshqa
            </button>
          </div>

          {rangeType === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              />
              <span className="text-slate-500 text-xs">—</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
          )}
        </div>

        <button
          onClick={fetchReport}
          className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-all"
          title="Yangilash"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-slate-400">Hisobot yuklanmoqda...</div>
      ) : !report ? (
        <div className="p-12 text-center text-slate-500">Hisobot ma'lumotlari topilmadi</div>
      ) : (
        <>
          {/* Main Financial Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Sales Turnover */}
            <div className="p-5 rounded-2xl glass-panel border border-slate-800/80 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all" />
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
                <span className="flex items-center gap-1.5">
                  <ShoppingBag className="w-4 h-4 text-emerald-400" />
                  Jami Savdo Tushumi
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold">
                  {report.sales.totalCount} ta savdo
                </span>
              </div>
              <p className="text-2xl font-bold text-slate-100">{fmt(report.sales.totalTurnover)}</p>
              <div className="mt-3 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Naqd savdo:</span>
                  <span className="text-emerald-400 font-semibold">{fmt(report.sales.cashSales.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Nasiya savdo:</span>
                  <span className="text-sky-400 font-semibold">{fmt(report.sales.installmentSales.amount)}</span>
                </div>
              </div>
            </div>

            {/* Net Cash Flow */}
            <div className="p-5 rounded-2xl glass-panel border border-slate-800/80 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl group-hover:bg-sky-500/20 transition-all" />
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
                <span className="flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-sky-400" />
                  Sof Kassa Oqimi (Net)
                </span>
                <span className="px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 text-[10px] font-semibold">
                  Real Kassa
                </span>
              </div>
              <p className={`text-2xl font-bold ${report.cashFlow.netCashFlow >= 0 ? 'text-sky-400' : 'text-rose-400'}`}>
                {fmt(report.cashFlow.netCashFlow)}
              </p>
              <div className="mt-3 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Real Kirim (In):</span>
                  <span className="text-emerald-400 font-semibold">{fmt(report.cashFlow.cashIn)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Real Chiqim (Out):</span>
                  <span className="text-rose-400 font-semibold">{fmt(report.cashFlow.cashOut)}</span>
                </div>
              </div>
            </div>

            {/* Gross Profit */}
            <div className="p-5 rounded-2xl glass-panel border border-slate-800/80 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-all" />
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-purple-400" />
                  Yalpi Foyda (Gross Profit)
                </span>
                <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 text-[10px] font-semibold">
                  {report.profitability.grossMarginPercent}% Rentabellik
                </span>
              </div>
              <p className="text-2xl font-bold text-purple-400">{fmt(report.profitability.grossProfit)}</p>
              <div className="mt-3 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Sotilgan mahsulot tannarxi:</span>
                  <span className="text-slate-300 font-semibold">{fmt(report.profitability.costOfGoodsSold)}</span>
                </div>
              </div>
            </div>

            {/* Installment Debt */}
            <div className="p-5 rounded-2xl glass-panel border border-slate-800/80 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all" />
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
                <span className="flex items-center gap-1.5">
                  <CalendarClock className="w-4 h-4 text-amber-400" />
                  Nasiya Qarzdorligi
                </span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-semibold">
                  {report.installmentDebt.activeContractsCount} ta shartnoma
                </span>
              </div>
              <p className="text-2xl font-bold text-amber-400">{fmt(report.installmentDebt.totalOutstanding)}</p>
              <div className="mt-3 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Muddati o'tgan:</span>
                  <span className="text-rose-400 font-semibold">{fmt(report.installmentDebt.overdueAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Yig'ilgan to'lovlar:</span>
                  <span className="text-emerald-400 font-semibold">{fmt(report.installmentDebt.collectedAmount)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Recharts Visual Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sales Types Pie Chart */}
            <div className="p-6 rounded-3xl glass-panel border border-slate-800">
              <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2 mb-4">
                <PieIcon className="w-4 h-4 text-emerald-400" />
                Savdo Turlari Bo'yicha Taqsimot (Tushum)
              </h3>
              {salesTypePieData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-slate-500 text-xs italic">
                  Ushbu davrda savdo tushumlari mavjud emas
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie
                        data={salesTypePieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {salesTypePieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: number) => fmt(val)}
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                        itemStyle={{ color: '#f8fafc' }}
                      />
                    </RePieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Top Brands Bar Chart */}
            <div className="p-6 rounded-3xl glass-panel border border-slate-800">
              <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-sky-400" />
                Top Sotilgan Brendlar Tushumi (UZS)
              </h3>
              {topBrandsChartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-slate-500 text-xs italic">
                  Ushbu davrda brendlar savdosi mavjud emas
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topBrandsChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip
                        formatter={(val: number) => fmt(val)}
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                        itemStyle={{ color: '#38bdf8' }}
                      />
                      <Bar dataKey="revenue" fill="#38bdf8" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Detailed Breakdown Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top Brands List */}
            <div className="p-6 rounded-3xl glass-panel border border-slate-800">
              <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2 mb-4">
                <Award className="w-4 h-4 text-emerald-400" />
                Top Brendlar Ro'yxati
              </h3>
              <div className="space-y-4">
                {report.topBrands.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Ma'lumotlar yo'q</p>
                ) : (
                  report.topBrands.map((b, idx) => {
                    const maxRev = report.topBrands[0]?.revenue || 1;
                    const percent = Math.round((b.revenue / maxRev) * 100);
                    return (
                      <div key={b.name} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-semibold text-slate-200">
                          <span>{idx + 1}. {b.name}</span>
                          <span>{fmt(b.revenue)} ({b.count} ta)</span>
                        </div>
                        <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Top Models List */}
            <div className="p-6 rounded-3xl glass-panel border border-slate-800">
              <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2 mb-4">
                <Layers className="w-4 h-4 text-sky-400" />
                Top Modellar Ro'yxati
              </h3>
              <div className="space-y-4">
                {report.topModels.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Ma'lumotlar yo'q</p>
                ) : (
                  report.topModels.map((m, idx) => {
                    const maxRev = report.topModels[0]?.revenue || 1;
                    const percent = Math.round((m.revenue / maxRev) * 100);
                    return (
                      <div key={m.name} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-semibold text-slate-200">
                          <span>{idx + 1}. {m.name}</span>
                          <span>{fmt(m.revenue)} ({m.count} ta)</span>
                        </div>
                        <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className="bg-gradient-to-r from-sky-500 to-indigo-400 h-full rounded-full transition-all duration-500"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Inventory Valuation Card */}
            <div className="p-6 rounded-3xl glass-panel border border-slate-800 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2 mb-4">
                  <Package className="w-4 h-4 text-purple-400" />
                  Ombor Sanoq va Qiymati
                </h3>

                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex justify-between items-center">
                    <div>
                      <p className="text-xs text-slate-400">Mavjud Mahsulotlar</p>
                      <p className="text-xl font-bold text-slate-100 mt-0.5">{report.inventory.totalCount} ta</p>
                    </div>
                    <Package className="w-8 h-8 text-purple-400/40" />
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex justify-between items-center">
                    <div>
                      <p className="text-xs text-slate-400">Ombordagi Umumiy Qiymat</p>
                      <p className="text-xl font-bold text-purple-400 mt-0.5">{fmt(report.inventory.totalValue)}</p>
                    </div>
                    <DollarSign className="w-8 h-8 text-purple-400/40" />
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex justify-between items-center">
                    <div>
                      <p className="text-xs text-slate-400">Oz Qolgan Modellari Soni</p>
                      <p className="text-xl font-bold text-rose-400 mt-0.5">{report.inventory.lowStockCount} ta model</p>
                    </div>
                    <span className="px-2 py-1 rounded-full bg-rose-500/10 text-rose-400 text-xs font-semibold">
                      Ogohlantirish
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
