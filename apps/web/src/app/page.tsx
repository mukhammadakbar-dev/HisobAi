import React from 'react';

export default function HomePage() {
  return (
    <div className="space-y-6">
      {/* Structural Page Placeholder Banner */}
      <div className="p-6 rounded-2xl glass-panel border border-brand-500/20 bg-gradient-to-r from-brand-500/10 to-transparent">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          HisobAI — Baraka Mobile CRM
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">
          Monorepo tayanch va layout skeleti muvaffaqiyatli sozlandi.
        </p>
      </div>

      {/* Grid placeholder layout cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-32 rounded-xl glass-panel p-4 flex flex-col justify-between"
          >
            <div className="w-12 h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
            <div className="w-24 h-6 bg-slate-300 dark:bg-slate-700 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
