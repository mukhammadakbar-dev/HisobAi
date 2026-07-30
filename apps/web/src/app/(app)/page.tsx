'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import { DashboardSummary } from '@baraka/contracts';
import { SalesChart } from '@/components/dashboard/SalesChart';
import {
  TrendingUp,
  ShoppingBag,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  AlertTriangle,
  Package,
  Clock,
  PlusCircle,
  RefreshCw,
} from 'lucide-react';

export default function DashboardPage() {
  const { admin } = useAuth();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiRequest<DashboardSummary>('/dashboard');
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Dashboard ma\'lumotlarini yuklashda xatolik');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (isLoading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Dashboard ma'lumotlari yuklanmoqda...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl glass-panel border border-red-500/30 text-center space-y-4">
        <AlertTriangle className="w-12 h-12 text-red-400 mx-auto" />
        <h2 className="text-lg font-bold text-slate-100">Xatolik yuz berdi</h2>
        <p className="text-sm text-slate-400 max-w-md mx-auto">{error}</p>
        <button
          onClick={fetchDashboard}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium inline-flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Qayta urinish</span>
        </button>
      </div>
    );
  }

  const fmt = (num: number) => `${(num || 0).toLocaleString('uz-UZ')} UZS`;

  return (
    <div className="space-y-8">
      {/* Top Banner / Welcome Bar */}
      <div className="p-6 rounded-3xl glass-panel border border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 via-slate-900 to-slate-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            Xush kelibsiz, {admin?.displayName || 'Admin'}! 👋
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            HisobAI — bugungi biznesingiz holati va moliyaviy tahlil
          </p>
        </div>
        <button
          onClick={() => alert('Yangi savdo sahifasi keyingi bosqichda qo\'shiladi')}
          className="px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-semibold text-sm shadow-lg shadow-emerald-500/25 flex items-center gap-2 transition-all"
        >
          <PlusCircle className="w-5 h-5" />
          <span>Yangi savdo</span>
        </button>
      </div>

      {/* Main KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Today Sales */}
        <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Bugungi Savdo
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-100">{fmt(data?.todayRevenue || 0)}</div>
            <div className="text-xs text-slate-400 mt-1">
              Jami: <span className="font-semibold text-emerald-400">{data?.todaySalesCount || 0} ta</span> savdo
            </div>
          </div>
        </div>

        {/* Card 2: Cash vs Installment */}
        <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Naqd / Nasiya
            </span>
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-200">
              Naqd: <span className="text-emerald-400">{fmt(data?.todayCashSales || 0)}</span>
            </div>
            <div className="text-sm font-semibold text-slate-200 mt-1">
              Nasiya: <span className="text-blue-400">{fmt(data?.todayInstallmentSales || 0)}</span>
            </div>
          </div>
        </div>

        {/* Card 3: Cash In / Out */}
        <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Kassa (Kirim/Chiqim)
            </span>
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1 text-emerald-400">
                <ArrowUpRight className="w-3.5 h-3.5" /> Kirim:
              </span>
              <span className="font-semibold">{fmt(data?.todayCashIn || 0)}</span>
            </div>
            <div className="text-xs flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1 text-red-400">
                <ArrowDownRight className="w-3.5 h-3.5" /> Chiqim:
              </span>
              <span className="font-semibold">{fmt(data?.todayCashOut || 0)}</span>
            </div>
          </div>
        </div>

        {/* Card 4: Gross Profit */}
        <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Yalpi Foyda
            </span>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-400">
              {fmt(data?.todayGrossProfit || 0)}
            </div>
            <p className="text-xs text-slate-400 mt-1">Bugungi sof marja hisobi</p>
          </div>
        </div>
      </div>

      {/* Receivables & Inventory Secondary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Receivables Summary */}
        <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Jami Olinadigan Qarzlar
            </span>
            <Clock className="w-5 h-5 text-blue-400" />
          </div>
          <div className="text-xl font-bold text-slate-100">
            {fmt(data?.totalOutstandingReceivables || 0)}
          </div>
          <div className="pt-2 border-t border-slate-800/80 space-y-1 text-xs">
            <div className="flex justify-between text-slate-300">
              <span>Bugun/Ertaga to'lov:</span>
              <span className="font-semibold text-amber-400">
                {fmt(data?.todayDueReceivables || 0)}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Muddati o'tgan:</span>
              <span className="font-semibold text-red-400">
                {fmt(data?.overdueReceivables || 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Inventory Value */}
        <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Ombor Qiymati
            </span>
            <Package className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-slate-100">
            {fmt(data?.inventoryTotalValue || 0)}
          </div>
          <p className="text-xs text-slate-400">Mavjud seriyali mahsulotlar tannarxi summasi</p>
        </div>

        {/* Low Stock Alert */}
        <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Kam Qolgan Mahsulotlar
            </span>
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-amber-400">
            {data?.lowStockCount || 0} ta mahsulot
          </div>
          <p className="text-xs text-slate-400">Zaxirasi kamaygan mahsulotlar soni</p>
        </div>
      </div>

      {/* Charts & Activity Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Dynamics Chart */}
        <div className="lg:col-span-2 p-6 rounded-3xl glass-panel border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-100">Savdo Dinamikasi</h2>
              <p className="text-xs text-slate-400">Oxirgi 7 kunlik savdo aylanmasi grafigi</p>
            </div>
            <button
              onClick={fetchDashboard}
              title="Yangilash"
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <SalesChart data={data?.salesDynamics || []} />
        </div>

        {/* Recent Activity List */}
        <div className="p-6 rounded-3xl glass-panel border border-slate-800 space-y-4">
          <h2 className="text-base font-bold text-slate-100">So'nggi Amallar</h2>
          
          {data?.recentActivities && data.recentActivities.length > 0 ? (
            <div className="space-y-3">
              {data.recentActivities.map((act) => (
                <div
                  key={act.id}
                  className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-3"
                >
                  <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5" />
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-slate-200">{act.title}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{act.description}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-center text-slate-500 text-xs">
              Hali so'nggi amallar mavjud emas
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
