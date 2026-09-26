export const SITE_NAME = process.env.SITE_NAME ?? 'EduShare Uganda';
export const SITE_URL = (process.env.PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
export const API_URL = (process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/$/, '');
export const INTERNAL_SECRET = process.env.REVALIDATE_SECRET ?? 'dev-revalidate-secret';

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}
