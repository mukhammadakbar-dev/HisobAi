'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { apiRequest } from '@/lib/api';
import {
  CashCategoryDto,
  CashEntryDto,
  CashDirection,
} from '@baraka/contracts';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Scale,
  Plus,
  Filter,
  Calendar,
  Tag,
  FileText,
  Calculator,
  X,
  Percent,
  Divide,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

export default function CashbookPage() {
  const [entries, setEntries] = useState<CashEntryDto[]>([]);
  const [categories, setCategories] = useState<CashCategoryDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [directionFilter, setDirectionFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('month');

  // Add Entry Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [formDirection, setFormDirection] = useState<CashDirection>(CashDirection.CASH_OUT);
  const [formAmount, setFormAmount] = useState('');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formAttachmentUrl, setFormAttachmentUrl] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().substring(0, 10));

  // Add Custom Category State
  const [showAddCatModal, setShowAddCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDirection, setNewCatDirection] = useState<CashDirection>(CashDirection.CASH_OUT);

  // Calculator Widget State
  const [showCalcWidget, setShowCalcWidget] = useState(false);
  const [calcTab, setCalcTab] = useState<'basic' | 'discount' | 'installment'>('basic');
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [calcPrev, setCalcPrev] = useState<number | null>(null);
  const [calcOp, setCalcOp] = useState<string | null>(null);
  const [calcReset, setCalcReset] = useState(false);
  const [copied, setCopied] = useState(false);

  // Discount Helper State
  const [discBase, setDiscBase] = useState('');
  const [discPercent, setDiscPercent] = useState('');
  const [discType, setDiscType] = useState<'discount' | 'markup'>('discount');

  // Installment Helper State
  const [instTotal, setInstTotal] = useState('');
  const [instDown, setInstDown] = useState('');
  const [instMonths, setInstMonths] = useState('6');

  // Fetch Data
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      let fromStr = '';
      let toStr = '';
      const now = new Date();

      if (dateRange === 'today') {
        fromStr = now.toISOString().substring(0, 10);
        toStr = fromStr;
      } else if (dateRange === 'week') {
        const pastWeek = new Date(now);
        pastWeek.setDate(now.getDate() - 7);
        fromStr = pastWeek.toISOString().substring(0, 10);
        toStr = now.toISOString().substring(0, 10);
      } else if (dateRange === 'month') {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        fromStr = firstDay.toISOString().substring(0, 10);
        toStr = now.toISOString().substring(0, 10);
      }

      const queryParams = new URLSearchParams();
      if (fromStr) queryParams.set('from', fromStr);
      if (toStr) queryParams.set('to', toStr);
      if (directionFilter !== 'ALL') queryParams.set('direction', directionFilter);
      if (categoryFilter !== 'ALL') queryParams.set('categoryId', categoryFilter);

      const [entriesRes, categoriesRes] = await Promise.all([
        apiRequest<CashEntryDto[]>(`/cash-entries?${queryParams.toString()}`),
        apiRequest<CashCategoryDto[]>('/cash-categories'),
      ]);

      setEntries(entriesRes);
      setCategories(categoriesRes);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, directionFilter, categoryFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculated Stats
  const totalCashIn = entries
    .filter((e) => e.direction === CashDirection.CASH_IN)
    .reduce((sum, e) => sum + e.amount, 0);

  const totalCashOut = entries
    .filter((e) => e.direction === CashDirection.CASH_OUT)
    .reduce((sum, e) => sum + e.amount, 0);

  const netBalance = totalCashIn - totalCashOut;

  // Add Cash Entry Submit
  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAmount || Number(formAmount) <= 0) {
      setErrorMsg('Summa noldan katta bo\'lishi shart');
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      await apiRequest('/cash-entries', {
        method: 'POST',
        body: JSON.stringify({
          direction: formDirection,
          amount: Number(formAmount),
          categoryId: formCategoryId || undefined,
          occurredAt: formDate ? new Date(formDate).toISOString() : undefined,
          note: formNote || undefined,
          attachmentUrl: formAttachmentUrl || undefined,
        }),
      });

      setShowAddModal(false);
      setFormAmount('');
      setFormNote('');
      setFormAttachmentUrl('');
      await fetchData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Yozuvni kiritishda xatolik yuz berdi');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add Custom Category Submit
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    try {
      const created = await apiRequest<CashCategoryDto>('/cash-categories', {
        method: 'POST',
        body: JSON.stringify({
          name: newCatName.trim(),
          direction: newCatDirection,
        }),
      });

      setCategories([...categories, created]);
      setFormCategoryId(created.id);
      setShowAddCatModal(false);
      setNewCatName('');
    } catch (err: any) {
      alert(err?.message || 'Kategoriyani yaratishda xatolik');
    }
  };

  // Calculator Handler
  const handleCalcNum = (digit: string) => {
    if (calcReset || calcDisplay === '0') {
      setCalcDisplay(digit);
      setCalcReset(false);
    } else {
      setCalcDisplay(calcDisplay + digit);
    }
  };

  const handleCalcOp = (op: string) => {
    setCalcPrev(Number(calcDisplay));
    setCalcOp(op);
    setCalcReset(true);
  };

  const handleCalcEquals = () => {
    if (calcPrev === null || calcOp === null) return;
    const current = Number(calcDisplay);
    let res = 0;
    if (calcOp === '+') res = calcPrev + current;
    else if (calcOp === '-') res = calcPrev - current;
    else if (calcOp === '*') res = calcPrev * current;
    else if (calcOp === '/') res = current !== 0 ? calcPrev / current : 0;

    setCalcDisplay(String(res));
    setCalcPrev(null);
    setCalcOp(null);
    setCalcReset(true);
  };

  const handleCalcClear = () => {
    setCalcDisplay('0');
    setCalcPrev(null);
    setCalcOp(null);
    setCalcReset(false);
  };

  const handleCopyValue = (val: string) => {
    navigator.clipboard.writeText(val);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fmt = (num: number) => `${(num || 0).toLocaleString('uz-UZ')} UZS`;

  // Calculated Discount
  const discBaseNum = Number(discBase) || 0;
  const discPercNum = Number(discPercent) || 0;
  const discAmount = (discBaseNum * discPercNum) / 100;
  const discFinal = discType === 'discount' ? discBaseNum - discAmount : discBaseNum + discAmount;

  // Calculated Installment
  const instTotalNum = Number(instTotal) || 0;
  const instDownNum = Number(instDown) || 0;
  const instMonthsNum = Number(instMonths) || 1;
  const instPrincipal = Math.max(0, instTotalNum - instDownNum);
  const instMonthly = instMonthsNum > 0 ? instPrincipal / instMonthsNum : 0;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl glass-panel border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Wallet className="w-7 h-7 text-emerald-400" />
            Kassa Daftari (Cashbook)
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real pul tushumlari, operatsion xarajatlar va kassa amallari monitoringi
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle Calculator Button */}
          <button
            onClick={() => setShowCalcWidget(!showCalcWidget)}
            className={`px-4 py-2.5 rounded-2xl text-xs font-semibold flex items-center gap-2 transition-all border ${
              showCalcWidget
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : 'bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-800'
            }`}
          >
            <Calculator className="w-4 h-4 text-emerald-400" />
            Kalkulyator
          </button>

          {/* Add Entry Button */}
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 rounded-2xl text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Kassa Amali Qo'shish
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Real Cash In Card */}
        <div className="p-5 rounded-2xl glass-panel border border-slate-800/80 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all" />
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
            <span className="flex items-center gap-1.5">
              <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
              Real Kirim (Cash In)
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold">
              Kassa Kirim
            </span>
          </div>
          <p className="text-2xl font-bold text-emerald-400">{fmt(totalCashIn)}</p>
          <p className="text-[11px] text-slate-500 mt-2">Savdo, nasiya to'lovlari va kirimlar</p>
        </div>

        {/* Real Cash Out Card */}
        <div className="p-5 rounded-2xl glass-panel border border-slate-800/80 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-full blur-2xl group-hover:bg-rose-500/20 transition-all" />
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
            <span className="flex items-center gap-1.5">
              <ArrowUpRight className="w-4 h-4 text-rose-400" />
              Real Chiqim (Cash Out)
            </span>
            <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 text-[10px] font-semibold">
              Xarajatlar
            </span>
          </div>
          <p className="text-2xl font-bold text-rose-400">{fmt(totalCashOut)}</p>
          <p className="text-[11px] text-slate-500 mt-2">Ijara, maosh, kommunal va boshqa xarajatlar</p>
        </div>

        {/* Net Cash Balance Card */}
        <div className="p-5 rounded-2xl glass-panel border border-slate-800/80 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl group-hover:bg-sky-500/20 transition-all" />
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
            <span className="flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-sky-400" />
              Sof Kassa Qoldig'i (Net)
            </span>
            <span className="px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 text-[10px] font-semibold">
              Sof Balans
            </span>
          </div>
          <p className={`text-2xl font-bold ${netBalance >= 0 ? 'text-sky-400' : 'text-rose-400'}`}>
            {fmt(netBalance)}
          </p>
          <p className="text-[11px] text-slate-500 mt-2">Jami tushum minus barcha chiqimlar</p>
        </div>
      </div>

      {/* Calculator Widget Slide / Popup */}
      {showCalcWidget && (
        <div className="p-6 rounded-3xl glass-panel border border-emerald-500/30 bg-slate-950/90 shadow-2xl relative animate-in fade-in slide-in-from-top-4 duration-300">
          <button
            onClick={() => setShowCalcWidget(false)}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
            <Calculator className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-slate-100 text-sm">Kassa va Moliya Kalkulyatori</h3>

            <div className="ml-auto flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setCalcTab('basic')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  calcTab === 'basic' ? 'bg-emerald-500 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Oddiy
              </button>
              <button
                onClick={() => setCalcTab('discount')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  calcTab === 'discount' ? 'bg-emerald-500 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Chegirma / Ustama
              </button>
              <button
                onClick={() => setCalcTab('installment')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  calcTab === 'installment' ? 'bg-emerald-500 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Nasiya Taqsifi
              </button>
            </div>
          </div>

          {/* Calculator Tab Content */}
          {calcTab === 'basic' && (
            <div className="max-w-md mx-auto space-y-3">
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl text-right">
                <div className="text-xs text-slate-500 min-h-[16px]">
                  {calcPrev !== null ? `${calcPrev} ${calcOp}` : ''}
                </div>
                <div className="text-2xl font-mono font-bold text-emerald-400 break-all">{calcDisplay}</div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <button onClick={handleCalcClear} className="p-3 rounded-xl bg-rose-500/20 text-rose-400 font-bold hover:bg-rose-500/30">C</button>
                <button onClick={() => handleCalcOp('/')} className="p-3 rounded-xl bg-slate-800 text-emerald-400 font-bold hover:bg-slate-700">/</button>
                <button onClick={() => handleCalcOp('*')} className="p-3 rounded-xl bg-slate-800 text-emerald-400 font-bold hover:bg-slate-700">*</button>
                <button onClick={() => handleCalcOp('-')} className="p-3 rounded-xl bg-slate-800 text-emerald-400 font-bold hover:bg-slate-700">-</button>

                <button onClick={() => handleCalcNum('7')} className="p-3 rounded-xl bg-slate-900 text-slate-200 font-semibold hover:bg-slate-800">7</button>
                <button onClick={() => handleCalcNum('8')} className="p-3 rounded-xl bg-slate-900 text-slate-200 font-semibold hover:bg-slate-800">8</button>
                <button onClick={() => handleCalcNum('9')} className="p-3 rounded-xl bg-slate-900 text-slate-200 font-semibold hover:bg-slate-800">9</button>
                <button onClick={() => handleCalcOp('+')} className="p-3 rounded-xl bg-slate-800 text-emerald-400 font-bold hover:bg-slate-700">+</button>

                <button onClick={() => handleCalcNum('4')} className="p-3 rounded-xl bg-slate-900 text-slate-200 font-semibold hover:bg-slate-800">4</button>
                <button onClick={() => handleCalcNum('5')} className="p-3 rounded-xl bg-slate-900 text-slate-200 font-semibold hover:bg-slate-800">5</button>
                <button onClick={() => handleCalcNum('6')} className="p-3 rounded-xl bg-slate-900 text-slate-200 font-semibold hover:bg-slate-800">6</button>
                <button onClick={handleCalcEquals} className="row-span-2 p-3 rounded-xl bg-emerald-500 text-white font-bold hover:bg-emerald-600 shadow-md shadow-emerald-500/20">=</button>

                <button onClick={() => handleCalcNum('1')} className="p-3 rounded-xl bg-slate-900 text-slate-200 font-semibold hover:bg-slate-800">1</button>
                <button onClick={() => handleCalcNum('2')} className="p-3 rounded-xl bg-slate-900 text-slate-200 font-semibold hover:bg-slate-800">2</button>
                <button onClick={() => handleCalcNum('3')} className="p-3 rounded-xl bg-slate-900 text-slate-200 font-semibold hover:bg-slate-800">3</button>

                <button onClick={() => handleCalcNum('0')} className="col-span-2 p-3 rounded-xl bg-slate-900 text-slate-200 font-semibold hover:bg-slate-800">0</button>
                <button onClick={() => handleCalcNum('.')} className="p-3 rounded-xl bg-slate-900 text-slate-200 font-semibold hover:bg-slate-800">.</button>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => handleCopyValue(calcDisplay)}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 flex items-center gap-1.5 hover:bg-slate-800"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  Natijani nusxalash
                </button>
                <button
                  onClick={() => {
                    setFormAmount(calcDisplay);
                    setShowAddModal(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-xs font-semibold text-emerald-400 flex items-center gap-1.5 hover:bg-emerald-500/30"
                >
                  Kassa amallariga qo'shish
                </button>
              </div>
            </div>
          )}

          {calcTab === 'discount' && (
            <div className="max-w-md mx-auto space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Asosiy Summa (UZS)</label>
                  <input
                    type="number"
                    value={discBase}
                    onChange={(e) => setDiscBase(e.target.value)}
                    placeholder="Masalan: 3000000"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Foiz (%)</label>
                  <input
                    type="number"
                    value={discPercent}
                    onChange={(e) => setDiscPercent(e.target.value)}
                    placeholder="Masalan: 5"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setDiscType('discount')}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    discType === 'discount'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                      : 'bg-slate-900 text-slate-400 border-slate-800'
                  }`}
                >
                  Chegirma (Discount -)
                </button>
                <button
                  onClick={() => setDiscType('markup')}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    discType === 'markup'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                      : 'bg-slate-900 text-slate-400 border-slate-800'
                  }`}
                >
                  Ustama (Markup +)
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{discType === 'discount' ? 'Chegirma miqdori:' : 'Ustama miqdori:'}</span>
                  <span className="font-semibold text-slate-200">{fmt(discAmount)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-slate-100 pt-2 border-t border-slate-800">
                  <span>Yakuniy narx:</span>
                  <span className="text-emerald-400">{fmt(discFinal)}</span>
                </div>
              </div>

              <button
                onClick={() => handleCopyValue(String(discFinal))}
                className="w-full py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                Yakuniy narxni nusxalash ({fmt(discFinal)})
              </button>
            </div>
          )}

          {calcTab === 'installment' && (
            <div className="max-w-md mx-auto space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Jami Mahsulot Narxi (UZS)</label>
                  <input
                    type="number"
                    value={instTotal}
                    onChange={(e) => setInstTotal(e.target.value)}
                    placeholder="Masalan: 6000000"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Boshlang'ich to'lov (UZS)</label>
                  <input
                    type="number"
                    value={instDown}
                    onChange={(e) => setInstDown(e.target.value)}
                    placeholder="Masalan: 1000000"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Muddati (Oy)</label>
                <div className="grid grid-cols-4 gap-2">
                  {['3', '6', '9', '12'].map((m) => (
                    <button
                      key={m}
                      onClick={() => setInstMonths(m)}
                      className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                        instMonths === m
                          ? 'bg-emerald-500 text-white border-emerald-500'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {m} Oy
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Nasiya asosiy qarz:</span>
                  <span className="font-semibold text-slate-200">{fmt(instPrincipal)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-slate-100 pt-2 border-t border-slate-800">
                  <span>Oylik to'lov (har oy):</span>
                  <span className="text-emerald-400">{fmt(instMonthly)}</span>
                </div>
              </div>

              <button
                onClick={() => handleCopyValue(String(Math.round(instMonthly)))}
                className="w-full py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                Oylik to'lov summasini nusxalash ({fmt(Math.round(instMonthly))})
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filters Bar */}
      <div className="p-4 rounded-2xl glass-panel border border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-400">Filtrlar:</span>

          {/* Date Range Selector */}
          <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setDateRange('today')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                dateRange === 'today' ? 'bg-emerald-500 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Bugun
            </button>
            <button
              onClick={() => setDateRange('week')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                dateRange === 'week' ? 'bg-emerald-500 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Hafta
            </button>
            <button
              onClick={() => setDateRange('month')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                dateRange === 'month' ? 'bg-emerald-500 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Shu oy
            </button>
            <button
              onClick={() => setDateRange('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                dateRange === 'all' ? 'bg-emerald-500 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Barchasi
            </button>
          </div>

          {/* Direction Selector */}
          <select
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">Barcha amallar (Kirim & Chiqim)</option>
            <option value={CashDirection.CASH_IN}>Faqat Kirim (Cash In)</option>
            <option value={CashDirection.CASH_OUT}>Faqat Chiqim (Cash Out)</option>
          </select>

          {/* Category Selector */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">Barcha kategoriyalar</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name} ({cat.direction === CashDirection.CASH_IN ? 'Kirim' : 'Chiqim'})
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={fetchData}
          className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-all"
          title="Yangilash"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
        </button>
      </div>

      {/* Cash Entries Table */}
      <div className="rounded-3xl glass-panel border border-slate-800 overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <h2 className="font-bold text-slate-100 text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-400" />
            Kassa Yozuvlari Tarixi ({entries.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
              <tr>
                <th className="p-4">Sana</th>
                <th className="p-4">Yo'nalish</th>
                <th className="p-4">Kategoriya</th>
                <th className="p-4">Izoh / Manba</th>
                <th className="p-4">Hujjat / Chek</th>
                <th className="p-4 text-right">Summa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    Yuklanmoqda...
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    Hozircha kassa yozuvlari topilmadi
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const isIn = entry.direction === CashDirection.CASH_IN;
                  return (
                    <tr key={entry.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="p-4 text-slate-300 font-medium">
                        {new Date(entry.occurredAt).toLocaleString('uz-UZ', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      <td className="p-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                            isIn
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {isIn ? (
                            <>
                              <ArrowDownLeft className="w-3 h-3" /> Kirim
                            </>
                          ) : (
                            <>
                              <ArrowUpRight className="w-3 h-3" /> Chiqim
                            </>
                          )}
                        </span>
                      </td>

                      <td className="p-4 text-slate-300">
                        {entry.category ? (
                          <span className="inline-flex items-center gap-1.5 text-slate-200">
                            <Tag className="w-3 h-3 text-slate-500" />
                            {entry.category.name}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">Kategoriyasiz</span>
                        )}
                      </td>

                      <td className="p-4 text-slate-300 max-w-xs truncate">
                        {entry.note || entry.sourceType || 'Qo\'lda kiritilgan'}
                      </td>

                      <td className="p-4 text-slate-400">
                        {entry.attachmentUrl ? (
                          <a
                            href={entry.attachmentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-400 hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> Hujjatni ochish
                          </a>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      <td
                        className={`p-4 text-right font-bold text-sm ${
                          isIn ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isIn ? '+' : '-'}{fmt(entry.amount)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Cash Entry Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md p-6 rounded-3xl glass-panel border border-slate-800 bg-slate-950 shadow-2xl relative">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-4">
              <Plus className="w-5 h-5 text-emerald-400" />
              Yangi Kassa Amali Qo'shish
            </h3>

            {errorMsg && (
              <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleAddEntry} className="space-y-4">
              {/* Direction selector */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Amal yo'nalishi</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormDirection(CashDirection.CASH_OUT)}
                    className={`py-2.5 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 transition-all ${
                      formDirection === CashDirection.CASH_OUT
                        ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 shadow-lg shadow-rose-500/10'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    <ArrowUpRight className="w-4 h-4" /> Chiqim (Expense)
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormDirection(CashDirection.CASH_IN)}
                    className={`py-2.5 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 transition-all ${
                      formDirection === CashDirection.CASH_IN
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    <ArrowDownLeft className="w-4 h-4" /> Kirim (Income)
                  </button>
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Summa (UZS) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="Masalan: 150000"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Category */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-400">Kategoriya</label>
                  <button
                    type="button"
                    onClick={() => setShowAddCatModal(true)}
                    className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Yangi kategoriya
                  </button>
                </div>
                <select
                  value={formCategoryId}
                  onChange={(e) => setFormCategoryId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Kategoriyasiz</option>
                  {categories
                    .filter((c) => c.direction === formDirection)
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Sana</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Izoh</label>
                <input
                  type="text"
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  placeholder="Masalan: Elektrenergiya to'lovi"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Attachment URL */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Chek / Hujjat URL (ixtiyoriy)</label>
                <input
                  type="url"
                  value={formAttachmentUrl}
                  onChange={(e) => setFormAttachmentUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-900 text-slate-400 text-xs font-semibold hover:bg-slate-800 border border-slate-800"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  {isSubmitting ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Custom Category Modal */}
      {showAddCatModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm p-6 rounded-3xl glass-panel border border-slate-800 bg-slate-950 shadow-2xl relative">
            <button
              onClick={() => setShowAddCatModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-100 mb-4">Yangi Kategoriya Qo'shish</h3>

            <form onSubmit={handleAddCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Kategoriya Nomi *</label>
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Masalan: Reklama & Marketing"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Kategoriya Turi</label>
                <select
                  value={newCatDirection}
                  onChange={(e) => setNewCatDirection(e.target.value as CashDirection)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
                >
                  <option value={CashDirection.CASH_OUT}>Chiqim (Expense)</option>
                  <option value={CashDirection.CASH_IN}>Kirim (Income)</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCatModal(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-900 text-slate-400 text-xs font-semibold hover:bg-slate-800 border border-slate-800"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 shadow-lg shadow-emerald-500/20"
                >
                  Yaratish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
