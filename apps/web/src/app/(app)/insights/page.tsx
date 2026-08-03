'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { apiRequest } from '@/lib/api';
import {
  DailyInsightDto,
  InsightResponseDto,
  SlowMovingItemDto,
} from '@baraka/contracts';
import {
  Sparkles,
  MessageSquare,
  Bot,
  Send,
  RefreshCw,
  AlertTriangle,
  Clock,
  Package,
  TrendingUp,
  DollarSign,
  ShieldAlert,
  Calendar,
  CheckCircle2,
} from 'lucide-react';

const PRESET_QUESTIONS = [
  "Bu oy iPhone sotuvim qancha bo'ldi?",
  "Qaysi brend eng ko'p foyda keltirdi?",
  "Nasiya qarzdorliklar va kassa holati qanday?",
];

export default function InsightsPage() {
  // Daily Summary State
  const [daily, setDaily] = useState<DailyInsightDto | null>(null);
  const [isDailyLoading, setIsDailyLoading] = useState(true);

  // Q&A Query State
  const [question, setQuestion] = useState('');
  const [queryResponse, setQueryResponse] = useState<InsightResponseDto | null>(null);
  const [isQueryLoading, setIsQueryLoading] = useState(false);

  // Slow Moving Inventory State
  const [slowMoving, setSlowMoving] = useState<SlowMovingItemDto[]>([]);
  const [isSlowLoading, setIsSlowLoading] = useState(true);

  const fetchDailyInsight = useCallback(async () => {
    try {
      setIsDailyLoading(true);
      const res = await apiRequest<DailyInsightDto>('/ai-insights/daily');
      setDaily(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsDailyLoading(false);
    }
  }, []);

  const fetchSlowMoving = useCallback(async () => {
    try {
      setIsSlowLoading(true);
      const res = await apiRequest<SlowMovingItemDto[]>('/ai-insights/slow-moving');
      setSlowMoving(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSlowLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDailyInsight();
    fetchSlowMoving();
  }, [fetchDailyInsight, fetchSlowMoving]);

  const handleAskQuestion = async (qText?: string) => {
    const textToAsk = qText || question;
    if (!textToAsk.trim()) return;

    setIsQueryLoading(true);
    try {
      const res = await apiRequest<InsightResponseDto>('/ai-insights/query', {
        method: 'POST',
        body: JSON.stringify({ question: textToAsk.trim() }),
      });
      setQueryResponse(res);
      setQuestion(textToAsk);
    } catch (err: any) {
      alert(err?.message || 'Savolga javob olishda xatolik yuz berdi');
    } finally {
      setIsQueryLoading(false);
    }
  };

  const fmt = (num: number) => `${(num || 0).toLocaleString('uz-UZ')} UZS`;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl glass-panel border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-emerald-400" />
            AI Business Insights (Sun'iy Intellekt Tahlili)
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Biznesingizning kunlik tahlili, tabiiy tildagi savollar va ombordagi uzoq qolgan mahsulotlar tahlili
          </p>
        </div>

        <button
          onClick={fetchDailyInsight}
          className="px-4 py-2.5 rounded-2xl text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 flex items-center gap-2 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${isDailyLoading ? 'animate-spin text-emerald-400' : ''}`} />
          Tahlilni Yangilash
        </button>
      </div>

      {/* Prominent Daily AI Summary Card */}
      <div className="p-6 rounded-3xl glass-panel border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-slate-900 to-slate-950 relative overflow-hidden">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 mb-3">
          <Bot className="w-5 h-5 text-emerald-400" />
          <span>Bugungi AI Biznes Xulosasi ({daily?.date || 'Bugun'})</span>
        </div>

        {isDailyLoading ? (
          <p className="text-xs text-slate-400 animate-pulse">Bugungi ma'lumotlar tahlil qilinmoqda...</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm sm:text-base font-medium text-slate-100 leading-relaxed">
              {daily?.summary}
            </p>

            {daily?.metrics && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-800/80 text-xs">
                <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
                  <span className="text-slate-400 text-[11px]">Bugungi Tushum</span>
                  <p className="text-emerald-400 font-bold text-sm mt-0.5">{fmt(daily.metrics.todayRevenue)}</p>
                </div>

                <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
                  <span className="text-slate-400 text-[11px]">Savdo Soni</span>
                  <p className="text-slate-100 font-bold text-sm mt-0.5">{daily.metrics.todaySalesCount} ta</p>
                </div>

                <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
                  <span className="text-slate-400 text-[11px]">Yalpi Foyda</span>
                  <p className="text-purple-400 font-bold text-sm mt-0.5">{fmt(daily.metrics.todayGrossProfit)}</p>
                </div>

                <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
                  <span className="text-slate-400 text-[11px]">Umumiy Nasiya Qarz</span>
                  <p className="text-amber-400 font-bold text-sm mt-0.5">{fmt(daily.metrics.totalOutstandingDebt)}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Natural Language Q&A Section */}
      <div className="p-6 rounded-3xl glass-panel border border-slate-800 space-y-4">
        <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-emerald-400" />
          Sun'iy Intellektga Savol Berish
        </h3>
        <p className="text-xs text-slate-400">
          Savdo, brendlar, foyda yoki nasiyalar bo'yicha tabiiy tilda savol bering
        </p>

        {/* Preset Sample Questions */}
        <div className="flex flex-wrap gap-2">
          {PRESET_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => handleAskQuestion(q)}
              className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 transition-all text-left"
            >
              "{q}"
            </button>
          ))}
        </div>

        {/* Input Form */}
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAskQuestion()}
            placeholder="Masalan: Shu hafta eng ko'p sotilgan mahsulot qaysi?"
            className="flex-1 px-4 py-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={() => handleAskQuestion()}
            disabled={isQueryLoading || !question.trim()}
            className="px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {isQueryLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span>So'rash</span>
          </button>
        </div>

        {/* AI Answer Card */}
        {queryResponse && (
          <div className="p-5 rounded-2xl bg-slate-900 border border-emerald-500/30 space-y-3 animate-in fade-in duration-300">
            <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                <Bot className="w-4 h-4" /> AI Javobi:
              </span>
              <span className="text-slate-400 text-[11px]">
                Davr: {queryResponse.period.from} — {queryResponse.period.to}
              </span>
            </div>

            <p className="text-sm text-slate-200 leading-relaxed font-medium">
              {queryResponse.answer}
            </p>

            {queryResponse.metricsUsed && queryResponse.metricsUsed.length > 0 && (
              <div className="pt-2 border-t border-slate-800/60 flex items-center gap-2 text-[11px] text-slate-400">
                <span className="font-semibold text-slate-500">Asoslangan ko'rsatkichlar:</span>
                <div className="flex flex-wrap gap-1">
                  {queryResponse.metricsUsed.map((m) => (
                    <span key={m} className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Slow-Moving Inventory Products Section */}
      <div className="rounded-3xl glass-panel border border-slate-800 overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              Omborda Uzoq Qolgan Mahsulotlar (Slow-Moving Stock)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Omborga qabul qilinganidan beri eng uzoq vaqt sotilmay turgan mahsulotlar ro'yxati
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
              <tr>
                <th className="p-4">Mahsulot</th>
                <th className="p-4">Kategoriya</th>
                <th className="p-4">IMEI / Seriya</th>
                <th className="p-4">Qabul Qilingan Sana</th>
                <th className="p-4">Ombordagi Kunlar</th>
                <th className="p-4 text-right">Tannarx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isSlowLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    Yuklanmoqda...
                  </td>
                </tr>
              ) : slowMoving.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    Omborda uzoq qolgan mahsulotlar topilmadi
                  </td>
                </tr>
              ) : (
                slowMoving.map((item) => {
                  const isWarning = item.daysInStock > 30;
                  return (
                    <tr key={item.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="p-4 font-bold text-slate-100">
                        {item.product.brand} {item.product.model}{' '}
                        <span className="text-slate-400 font-normal">
                          {item.product.storage} {item.product.color}
                        </span>
                      </td>

                      <td className="p-4 text-slate-300">{item.product.category}</td>

                      <td className="p-4 font-mono text-slate-400">
                        {item.imei || item.serialNumber || '—'}
                      </td>

                      <td className="p-4 text-slate-300">
                        {new Date(item.receivedAt).toLocaleDateString('uz-UZ')}
                      </td>

                      <td className="p-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                            isWarning
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          <Clock className="w-3 h-3" /> {item.daysInStock} kun omborda
                        </span>
                      </td>

                      <td className="p-4 text-right font-bold text-purple-400">
                        {fmt(item.costPrice)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
