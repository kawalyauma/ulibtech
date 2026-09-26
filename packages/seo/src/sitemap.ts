export interface SitemapUrl {
  loc: string;
  lastmod?: string | Date | null;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
  image?: string | null;
}

/** Max URLs per sitemap file (protocol limit is 50,000). */
export const SITEMAP_PAGE_SIZE = 5000;

function xmlEscape(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] ?? c,
  );
}

function iso(d: string | Date): string {
  return (typeof d === 'string' ? new Date(d) : d).toISOString();
}

export function buildUrlset(urls: SitemapUrl[]): string {
  const body = urls
    .map((u) => {
      const parts = [`<loc>${xmlEscape(u.loc)}</loc>`];
      if (u.lastmod) parts.push(`<lastmod>${iso(u.lastmod)}</lastmod>`);
      if (u.changefreq) parts.push(`<changefreq>${u.changefreq}</changefreq>`);
      if (u.priority !== undefined) parts.push(`<priority>${u.priority.toFixed(1)}</priority>`);
      if (u.image)
        parts.push(`<image:image><image:loc>${xmlEscape(u.image)}</image:loc></image:image>`);
      return `<url>${parts.join('')}</url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${body}\n</urlset>\n`;
}

export function buildSitemapIndex(
  entries: { loc: string; lastmod?: string | Date | null }[],
): string {
  const body = entries
    .map(
      (e) =>
        `<sitemap><loc>${xmlEscape(e.loc)}</loc>${e.lastmod ? `<lastmod>${iso(e.lastmod)}</lastmod>` : ''}</sitemap>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}
