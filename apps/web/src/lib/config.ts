export const SITE_NAME = process.env.SITE_NAME ?? 'EduShare Uganda';
export const SITE_URL = (process.env.PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
export const API_URL = (process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/$/, '');
/** Google AdSense publisher id ("ca-pub-…"); enables the ad script, verification tag and ads.txt. */
const rawAdsense = (process.env.ADSENSE_CLIENT_ID ?? '').trim();
export const ADSENSE_CLIENT_ID = /^ca-pub-\d+$/.test(rawAdsense) ? rawAdsense : null;
export const INTERNAL_SECRET = process.env.REVALIDATE_SECRET ?? 'dev-revalidate-secret';

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}
