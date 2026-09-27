import { ADSENSE_CLIENT_ID } from '@/lib/config';

// Authorised Digital Sellers file for Google AdSense (https://support.google.com/adsense/answer/12171612).
export const dynamic = 'force-dynamic';

export function GET() {
  const body = ADSENSE_CLIENT_ID
    ? `google.com, ${ADSENSE_CLIENT_ID.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`
    : '# No ad sellers configured.\n';
  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
