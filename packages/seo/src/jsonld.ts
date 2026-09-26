export interface Crumb {
  name: string;
  url: string;
}

export function breadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
  };
}

export function websiteJsonLd(opts: { name: string; url: string; description: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: opts.name,
    url: opts.url,
    description: opts.description,
    inLanguage: 'en-UG',
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${opts.url}/search?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function organizationJsonLd(opts: { name: string; url: string; logo?: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: opts.name,
    url: opts.url,
    ...(opts.logo ? { logo: opts.logo } : {}),
  };
}

export interface LearningResourceInput {
  name: string;
  description: string;
  url: string;
  downloadUrl: string;
  image?: string | null;
  datePublished?: string | null;
  dateModified?: string | null;
  educationalLevel?: string | null;
  about?: string | null;
  learningResourceType?: string | null;
  encodingFormat?: string | null;
  contentSize?: string | null;
  numberOfPages?: number | null;
  keywords?: string[];
  author?: string | null;
  publisher: { name: string; url: string };
  downloads?: number;
}

export function learningResourceJsonLd(r: LearningResourceInput) {
  return {
    '@context': 'https://schema.org',
    '@type': ['LearningResource', 'CreativeWork'],
    name: r.name,
    description: r.description,
    url: r.url,
    ...(r.image ? { image: r.image, thumbnailUrl: r.image } : {}),
    ...(r.datePublished ? { datePublished: r.datePublished } : {}),
    ...(r.dateModified ? { dateModified: r.dateModified } : {}),
    inLanguage: 'en',
    isAccessibleForFree: true,
    ...(r.educationalLevel ? { educationalLevel: r.educationalLevel } : {}),
    ...(r.about ? { about: { '@type': 'Thing', name: r.about } } : {}),
    ...(r.learningResourceType ? { learningResourceType: r.learningResourceType } : {}),
    ...(r.keywords?.length ? { keywords: r.keywords.join(', ') } : {}),
    ...(r.numberOfPages ? { numberOfPages: r.numberOfPages } : {}),
    ...(r.author ? { author: { '@type': 'Person', name: r.author } } : {}),
    audience: { '@type': 'EducationalAudience', educationalRole: ['student', 'teacher', 'parent'] },
    publisher: { '@type': 'Organization', name: r.publisher.name, url: r.publisher.url },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'UGX', availability: 'https://schema.org/InStock' },
    encoding: {
      '@type': 'MediaObject',
      contentUrl: r.downloadUrl,
      ...(r.encodingFormat ? { encodingFormat: r.encodingFormat } : {}),
      ...(r.contentSize ? { contentSize: r.contentSize } : {}),
    },
    ...(r.downloads
      ? {
          interactionStatistic: {
            '@type': 'InteractionCounter',
            interactionType: 'https://schema.org/DownloadAction',
            userInteractionCount: r.downloads,
          },
        }
      : {}),
  };
}

export function collectionPageJsonLd(opts: { name: string; description: string; url: string; items: { name: string; url: string }[] }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: opts.name,
    description: opts.description,
    url: opts.url,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: opts.items.length,
      itemListElement: opts.items.slice(0, 30).map((it, i) => ({ '@type': 'ListItem', position: i + 1, url: it.url, name: it.name })),
    },
  };
}

/** Serialises JSON-LD safely for inline <script> tags (prevents </script> injection). */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}
