import type { Metadata, Viewport } from 'next';

import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'HisobAI CRM',
  description: "Telefon do'konlari uchun ombor, savdo, nasiya, kassa va AI tahlil",
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fa' },
    { media: '(prefers-color-scheme: dark)', color: '#020d1f' },
  ],
};

/**
 * Mavzuni sahifa chizilishidan OLDIN qo'yadi.
 *
 * Usiz "oq miltillash" bo'ladi: React yuklanguncha sahifa yorug'
 * rejimda chiziladi, keyin qorong'iga sakraydi. Skript `<head>` da,
 * bloklovchi holda ishlaydi — u atigi bir necha satr.
 *
 * `User.theme` serverdan kelganda `localStorage` yangilanadi; bu yerda
 * server javobi kutilmaydi (`FRONTEND.md` §8.1).
 */
const THEME_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem('hisobai-theme');
    if (t === 'dark' || t === 'light') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
