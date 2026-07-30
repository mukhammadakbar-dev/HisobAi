'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { LogOut, User, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export function Header() {
  const { admin, logout, isLoading } = useAuth();

  return (
    <header className="sticky top-0 z-30 h-16 w-full glass-header flex items-center justify-between px-4 sm:px-6">
      {/* Header Left */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span className="font-semibold text-sm text-slate-200">HisobAI Boshqaruv Paneli</span>
        </div>
      </div>

      {/* Header Right */}
      <div className="flex items-center gap-3">
        {isLoading ? (
          <div className="h-8 w-28 bg-slate-800 rounded-lg animate-pulse" />
        ) : admin ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
              <User className="w-4 h-4 text-emerald-400" />
              <span className="font-medium text-slate-200">{admin.displayName || admin.email}</span>
            </div>
            <button
              onClick={logout}
              title="Tizimdan chiqish"
              className="p-2 rounded-lg bg-slate-900 hover:bg-red-500/10 text-slate-400 hover:text-red-400 border border-slate-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-xs shadow-md shadow-emerald-500/20 transition-all"
          >
            Tizimga kirish
          </Link>
        )}
      </div>
    </header>
  );
}
