'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  Users,
  ShoppingBag,
  CalendarClock,
  CreditCard,
  Wallet,
  BarChart3,
  Settings,
  Sparkles,
} from 'lucide-react';
import { LogoMark } from './Logo';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Ombor', href: '/inventory', icon: Package },
  { label: 'Mijozlar', href: '/customers', icon: Users },
  { label: 'Savdo', href: '/sales', icon: ShoppingBag },
  { label: 'Nasiya', href: '/installments', icon: CalendarClock },
  { label: 'To\'lovlar', href: '/payments', icon: CreditCard },
  { label: 'Kassa', href: '/cashbook', icon: Wallet },
  { label: 'Hisobotlar', href: '/reports', icon: BarChart3 },
  { label: 'AI Tahlil', href: '/insights', icon: Sparkles },
  { label: 'Sozlamalar', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop Left Sidebar */}
      <aside className="hidden md:flex flex-col w-64 glass-panel h-screen fixed left-0 top-0 z-40 p-4 border-r border-slate-800">
        {/* Brand Logo Header */}
        <Link href="/" aria-label="HisobAI bosh sahifasi" className="min-h-14 flex items-center px-2 gap-3 border-b border-slate-800/80 py-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center text-white font-black text-xl shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
            H
          </div>
          <div className="flex flex-col">
            <LogoMark />
            <span className="text-[11px] text-slate-400 -mt-1">Mobile CRM</span>
          </div>
        </Link>

        {/* Navigation Menu List */}
        <nav className="flex-1 py-4 space-y-1.5 overflow-y-auto custom-scrollbar">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname?.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer App Info */}
        <div className="pt-3 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between px-2">
          <span>HisobAI v0.1</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Tizim faol" />
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 glass-header border-t border-slate-800 z-40 flex items-center justify-around px-1 overflow-x-auto">
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname?.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                isActive ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
