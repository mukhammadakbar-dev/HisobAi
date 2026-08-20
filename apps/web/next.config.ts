import { networkInterfaces } from 'node:os';

import type { NextConfig } from 'next';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Shu mashinaning LAN IP'lari (telefondan kirish uchun).
 *
 * IP ataylab hardcode qilinmaydi — u tarmoqdan tarmoqqa o'zgaradi
 * (bir xil mashinada `10.17.252.126` va `10.10.1.217` kuzatilgan).
 */
function localNetworkHosts(): string[] {
  const hosts: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) hosts.push(entry.address);
    }
  }
  return hosts;
}

/** Dev proksining nishoni; alohida hostda `API_PROXY_ORIGIN` bilan almashtiriladi. */
const apiProxyOrigin = process.env.API_PROXY_ORIGIN ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace paketi TypeScript manbadan emas, build qilingan `dist`dan keladi.
  transpilePackages: ['@hisobai/contracts'],

  /**
   * Next dev serveri `_next/static/*` va HMR so'rovlarini boshqa
   * origin'dan kelsa bloklaydi. Telefon `http://<LAN-IP>:3000` ga
   * kirganda JS chunk'lar `403` bo'lardi: React hydrate bo'lmasdi va
   * login formasi native `GET` bilan yuborilib, **parol URL query
   * satrida ochiq qolardi**. `api/main.ts` dagi `0.0.0.0` bind qilish
   * o'zi yetarli emas — web tomoni ham ruxsat berishi kerak.
   */
  allowedDevOrigins: ['localhost', '127.0.0.1', ...localNetworkHosts()],

  /**
   * Brauzer API'ga to'g'ridan-to'g'ri emas, shu proksi orqali uradi
   * (`NEXT_PUBLIC_API_URL=/api/v1`). So'rov same-origin bo'lgani uchun
   * CORS umuman ishtirok etmaydi va sessiya cookie'lari telefonda ham
   * o'rnatiladi.
   *
   * Faqat dev uchun: ishlab chiqarishda web va api oldida reverse proxy
   * turadi, u yerda `localhost:4000` mavjud emas — rewrite qolsa barcha
   * API chaqiruvi jimgina yiqilardi.
   */
  async rewrites() {
    if (isProduction) return [];
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiProxyOrigin}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
