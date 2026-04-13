import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

const nextConfig: NextConfig = {
  // 本地默认仍跑 ESLint / tsc；PaaS 可设 CI_SKIP_NEXT_*=1 缩短 next build（须在 PR 或本地单独跑 lint + typecheck）
  eslint: {
    ignoreDuringBuilds: process.env.CI_SKIP_NEXT_ESLINT === "1",
  },
  typescript: {
    ignoreBuildErrors: process.env.CI_SKIP_NEXT_TYPECHECK === "1",
  },
  // 避免把 Prisma 及原生引擎打进 server bundle，Webpack/Turbopack 编译更快、体积更小
  serverExternalPackages: ["@prisma/client", "prisma"],
  // Next 15 的 allowedDevOrigins 是顶层配置，不属于 experimental
  allowedDevOrigins: [
    'http://192.168.31.218:3000',
    'http://192.168.31.*:3000',
  ],
};

export default withNextIntl(nextConfig);
