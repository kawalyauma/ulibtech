import type { NextConfig } from 'next';

const apiUrl = (process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/$/, '');

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "manifest-src 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
];

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  agentRules: false,
  reactStrictMode: true,
  compress: true,
  transpilePackages: ['@edushare/ui', '@edushare/shared', '@edushare/seo'],
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/pdfjs/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/' }] },
    ];
  },
  async redirects() {
    return [
      { source: '/resource/:slug', destination: '/resources/:slug', permanent: true },
      { source: '/class/:slug', destination: '/classes/:slug', permanent: true },
      { source: '/subject/:slug', destination: '/subjects/:slug', permanent: true },
      { source: '/collection/:slug', destination: '/collections/:slug', permanent: true },
    ];
  },
  async rewrites() {
    // In production Nginx routes these directly to the API; these rewrites make the
    // site work stand-alone (development, previews, tests).
    return {
      beforeFiles: [
        { source: '/download/:slug', destination: `${apiUrl}/api/download/:slug` },
        { source: '/media/:path*', destination: `${apiUrl}/media/:path*` },
      ],
      afterFiles: [{ source: '/api/:path((?!revalidate).*)', destination: `${apiUrl}/api/:path` }],
      fallback: [],
    };
  },
};

export default config;
