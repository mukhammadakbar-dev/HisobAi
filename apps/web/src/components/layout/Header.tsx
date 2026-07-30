'use client';

import React from 'react';

/**
 * Header Skeleton Component Placeholder
 */
export function Header() {
  return (
    <header className="sticky top-0 z-30 h-16 w-full glass-header flex items-center justify-between px-4 sm:px-6">
      {/* Header Left (Placeholder) */}
      <div className="flex items-center gap-3">
        <div className="md:hidden flex items-center justify-center p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
          <span className="sr-only">Toggle Sidebar</span>
          <div className="w-5 h-5 bg-slate-400 dark:bg-slate-600 rounded" />
        </div>
        <div className="h-5 w-32 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
      </div>

      {/* Header Right (Placeholder for Admin profile / Dark Mode toggle) */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="h-8 w-24 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
      </div>
    </header>
  );
}
