import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

const nextConfig: NextConfig = {
  // 本地默认仍跑 ESLint；PaaS/Nixpacks 可设 CI_SKIP_NEXT_ESLINT=1 缩短 next build（类型检查仍执行）
  eslint: {
    ignoreDuringBuilds: process.env.CI_SKIP_NEXT_ESLINT === "1",
  },
  // Next 15 的 allowedDevOrigins 是顶层配置，不属于 experimental
  allowedDevOrigins: [
    'http://192.168.31.218:3000',
    'http://192.168.31.*:3000',
  ],
};

export default withNextIntl(nextConfig);
