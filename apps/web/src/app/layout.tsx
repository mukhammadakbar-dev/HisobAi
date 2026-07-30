import type { Metadata } from 'next';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { AuthProvider } from '@/context/AuthContext';

export const metadata: Metadata = {
  title: 'HisobAI — Baraka Mobile CRM',
  description: 'Telefon va noutbuk doʻkonlari uchun zamonaviy CRM va hisob-kitob tizimi',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uz" className="dark">
      <body className="antialiased min-h-screen bg-slate-950 text-slate-100">
        <AuthProvider>
          <div className="min-h-screen flex flex-col md:flex-row">
            {/* Sidebar Layout Placeholder */}
            <Sidebar />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col md:pl-64 pb-16 md:pb-0">
              {/* Header Layout Placeholder */}
              <Header />

              {/* Page Content Container */}
              <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl w-full mx-auto">
                {children}
              </main>
            </div>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
