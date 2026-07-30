'use client';

import React from 'react';

/**
 * Sidebar Skeleton Component Placeholder
 * Desktop: Left vertical sidebar
 * Mobile: Bottom navigation bar structure
 */
export function Sidebar() {
  return (
    <>
      {/* Desktop Sidebar Placeholder */}
      <aside className="hidden md:flex flex-col w-64 glass-panel h-screen fixed left-0 top-0 z-40 p-4 border-r">
        {/* Brand Logo Placeholder */}
        <div className="h-12 flex items-center px-2 gap-2 border-b border-slate-200/50 dark:border-slate-800/50 pb-3">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-white font-bold text-lg">
            H
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-slate-900 dark:text-slate-100 leading-none">HisobAI</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">Mobile CRM</span>
          </div>
        </div>

        {/* Navigation Links Placeholder Skeleton */}
        <div className="flex-1 py-4 space-y-2 overflow-y-auto">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-10 w-full rounded-xl bg-slate-100 dark:bg-slate-800/50 animate-pulse"
            />
          ))}
        </div>

        {/* Footer Info Placeholder */}
        <div className="pt-4 border-t border-slate-200/50 dark:border-slate-800/50">
          <div className="h-4 w-28 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
        </div>
      </aside>

      {/* Mobile Bottom Navigation Placeholder */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 glass-header border-t border-slate-200 dark:border-slate-800 z-40 flex items-center justify-around px-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-5 h-5 rounded bg-slate-300 dark:bg-slate-700 animate-pulse" />
            <div className="w-10 h-2 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
          </div>
        ))}
      </nav>
    </>
  );
}
