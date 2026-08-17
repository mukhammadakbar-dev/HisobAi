import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace paketi TypeScript manbadan emas, build qilingan `dist`dan keladi.
  transpilePackages: ['@hisobai/contracts'],
  allowedDevOrigins: ['localhost', '127.0.0.1', '10.10.1.217'],
};

export default nextConfig;
