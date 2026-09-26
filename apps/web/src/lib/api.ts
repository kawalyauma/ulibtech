import 'server-only';
import type {
  LandingPage,
  Paginated,
  ResourceCard,
  ResourceDetail,
  SearchResponse,
  SiteSettings,
  HomepageSettings,
} from '@edushare/shared';
import { API_URL, INTERNAL_SECRET } from './config';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

interface FetchOptions {
  revalidate?: number | false;
  tags?: string[];
  /** Return null instead of throwing on 404 */
  allow404?: boolean;
}

const IS_BUILD = process.env.NEXT_PHASE === 'phase-production-build';

/**
 * Server-side API client. Responses are cached by Next.js and tagged so the API/worker
 * can revalidate them on demand when content changes. Every call is also tagged `all`.
 */
export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T | null> {
  // Do not require a running API during `next build`: pages render on first request instead.
  if (IS_BUILD) return null;
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'x-internal-secret': INTERNAL_SECRET, accept: 'application/json' },
    next: { revalidate: opts.revalidate ?? 300, tags: ['all', ...(opts.tags ?? [])] },
  });
  if (res.status === 404 && opts.allow404) return null;
  if (!res.ok) {
    let body: { error?: { code?: string; message?: string; details?: unknown } } = {};
    try {
      body = await res.json();
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, body.error?.code ?? 'HTTP_ERROR', body.error?.message ?? `API request failed (${res.status})`, body.error?.details);
  }
  return (await res.json()) as T;
}

// ------------------------------------------------------------------ typed endpoints

export interface PublicTaxonomy {
  levels: { id: string; name: string; slug: string; classes: { id: string; name: string; shortName: string | null; slug: string; count: number }[] }[];
  subjects: { id: string; name: string; slug: string; shortName: string | null; count: number }[];
  types: { id: string; name: string; pluralName: string; slug: string; showInNav: boolean; count: number; description: string | null }[];
  years: { id: string; year: number; count: number }[];
  terms: { id: string; name: string; slug: string; count: number }[];
  curricula: { id: string; name: string; slug: string; count: number }[];
}

export interface HomeData {
  site: SiteSettings;
  homepage: HomepageSettings;
  taxonomy: PublicTaxonomy;
  sections: { key: string; title: string; href: string | null; items: ResourceCard[] }[];
  collections: PublicCollection[];
  trendingSearches: string[];
  featuredSubjects: { name: string; slug: string; count: number }[];
}

export interface PublicCollection {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  featured: boolean;
  resourceCount: number;
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: string;
}

export interface RelatedGroup {
  title: string;
  href: string | null;
  items: ResourceCard[];
}

export type Facets = SearchResponse['facets'];
export interface LandingResult {
  landing: LandingPage;
  resources: Paginated<ResourceCard> & { facets: Facets };
}

export const getHome = () => apiFetch<HomeData>('/api/home', { revalidate: 120, tags: ['home'] });
export const getTaxonomy = () => apiFetch<PublicTaxonomy>('/api/taxonomy', { revalidate: 600, tags: ['taxonomy'] });
export const getSiteSettings = () => apiFetch<{ site: SiteSettings }>('/api/settings/public', { revalidate: 600, tags: ['settings'] });

export type ResourceLookup = { resource: ResourceDetail } | { redirect: string } | { unavailable: string } | null;

export async function getResource(slug: string): Promise<ResourceLookup> {
  try {
    const data = await apiFetch<{ resource?: ResourceDetail; redirect?: string }>(`/api/resources/${encodeURIComponent(slug)}`, {
      revalidate: 300,
      tags: ['resources', `resource:${slug}`],
      allow404: true,
    });
    if (!data) return null;
    if (data.redirect) return { redirect: data.redirect };
    return data.resource ? { resource: data.resource } : null;
  } catch (err) {
    if (err instanceof ApiError && err.status === 410) {
      return { unavailable: (err.details as { title?: string } | undefined)?.title ?? 'This resource' };
    }
    throw err;
  }
}

export const getRelated = (slug: string) =>
  apiFetch<{ groups: RelatedGroup[] }>(`/api/resources/${encodeURIComponent(slug)}/related`, {
    revalidate: 600,
    tags: ['resources', `resource:${slug}`],
    allow404: true,
  });

export function search(params: URLSearchParams) {
  return apiFetch<SearchResponse>(`/api/search?${params.toString()}`, { revalidate: 60, tags: ['resources'] });
}

export function getLanding(path: string, params: Record<string, string | undefined> = {}) {
  const qs = new URLSearchParams({ path });
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  return apiFetch<LandingResult>(`/api/landing?${qs.toString()}`, { revalidate: 300, tags: ['landing', 'resources'], allow404: true });
}

export const getClass = (slug: string) =>
  apiFetch<{ class: { id: string; name: string; shortName: string | null; slug: string; count: number }; level: { name: string; slug: string }; subjects: { id: string; name: string; slug: string; count: number }[] }>(
    `/api/classes/${encodeURIComponent(slug)}`,
    { revalidate: 300, tags: ['taxonomy', 'resources'], allow404: true },
  );

export const getCollections = () => apiFetch<{ items: PublicCollection[] }>('/api/collections', { revalidate: 300, tags: ['collections'] });
export const getCollection = (slug: string) =>
  apiFetch<PublicCollection & { resources: ResourceCard[] }>(`/api/collections/${encodeURIComponent(slug)}`, {
    revalidate: 300,
    tags: ['collections', 'resources'],
    allow404: true,
  });

export const getSitemapIndex = () => apiFetch<{ items: { name: string; lastmod: string | null }[] }>('/api/seo/sitemap', { revalidate: 3600, tags: ['sitemap'] });
export const getSitemap = (name: string) =>
  apiFetch<{ items: { loc: string; lastmod?: string | null; changefreq?: string; priority?: number; image?: string | null }[] }>(
    `/api/seo/sitemap/${encodeURIComponent(name)}`,
    { revalidate: 3600, tags: ['sitemap'], allow404: true },
  );
