import type { NextConfig } from 'next';

const apiUrl = (process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/$/, '');

// Optional CDN / object-storage origin for thumbnails (MEDIA_BASE_URL) and static assets (ASSET_PREFIX).
const mediaOrigin = /^https?:\/\//.test(process.env.MEDIA_BASE_URL ?? '')
  ? new URL(process.env.MEDIA_BASE_URL!).origin
  : '';
const assetOrigin = /^https?:\/\//.test(process.env.ASSET_PREFIX ?? '')
  ? new URL(process.env.ASSET_PREFIX!).origin
  : '';

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${assetOrigin}`.trim() +
    (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
  `style-src 'self' 'unsafe-inline' ${assetOrigin}`.trim(),
  `img-src 'self' data: blob: ${mediaOrigin}`.trim(),
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  assetPrefix: process.env.ASSET_PREFIX || undefined,
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  agentRules: false,
  reactStrictMode: true,
  transpilePackages: ['@edushare/ui', '@edushare/shared'],
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  experimental: { optimizePackageImports: ['lucide-react'] },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
  async rewrites() {
    // Same-origin API access so the HttpOnly session cookie is sent (Nginx does this in production).
    return {
      beforeFiles: [
        { source: '/api/:path*', destination: `${apiUrl}/api/:path*` },
        { source: '/media/:path*', destination: `${apiUrl}/media/:path*` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default config;
