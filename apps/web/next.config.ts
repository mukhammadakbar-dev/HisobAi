import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace paketi TypeScript manbadan emas, build qilingan `dist`dan keladi.
  transpilePackages: ['@hisobai/contracts'],
};

export default nextConfig;
