import { eq, inArray } from '@edushare/database';
import { resources } from '@edushare/database/schema';
import { getTrendingSearches } from '@edushare/analytics';
import type { HomepageSettings, ResourceCard, SiteSettings } from '@edushare/shared';
import { PUBLIC_CACHE_NS, type ServiceContext } from './context';
import { listPublicCollections, type PublicCollection } from './collections';
import { listCards } from './public-resources';
import { getSetting } from './settings';
import { getPublicTaxonomy, type PublicTaxonomy } from './taxonomy';
import { loadVocabulary } from '@edushare/search';

export interface HomeSection {
  key: string;
  title: string;
  href: string | null;
  items: ResourceCard[];
}

export interface HomeData {
  site: SiteSettings;
  homepage: HomepageSettings;
  taxonomy: PublicTaxonomy;
  sections: HomeSection[];
  collections: PublicCollection[];
  trendingSearches: string[];
  featuredSubjects: { name: string; slug: string; count: number }[];
}

const TYPE_SECTIONS: Record<string, string> = {
  'past-papers': 'Past papers',
  'schemes-of-work': 'Schemes of work',
  'lesson-plans': 'Lesson plans',
  notes: 'Notes',
};

export async function getHome(ctx: ServiceContext): Promise<HomeData> {
  const load = async (): Promise<HomeData> => {
    const [site, homepage, taxonomy, vocab] = await Promise.all([
      getSetting(ctx, 'site'),
      getSetting(ctx, 'homepage'),
      getPublicTaxonomy(ctx),
      loadVocabulary(ctx.db),
    ]);
    const sections: HomeSection[] = [];
    for (const s of homepage.sections) {
      if (!s.enabled) continue;
      if (s.key === 'featured') {
        const items = await listCards(ctx, {
          where: [eq(resources.featured, true)],
          order: 'newest',
          limit: 8,
        });
        if (items.length)
          sections.push({
            key: s.key,
            title: s.title ?? 'Featured resources',
            href: '/search?featured=true',
            items,
          });
      } else if (s.key === 'recent') {
        sections.push({
          key: s.key,
          title: s.title ?? 'Recently added',
          href: '/new',
          items: await listCards(ctx, { order: 'newest', limit: 8 }),
        });
      } else if (s.key === 'popular') {
        sections.push({
          key: s.key,
          title: s.title ?? 'Popular downloads',
          href: '/popular',
          items: await listCards(ctx, { order: 'downloads', limit: 8 }),
        });
      } else if (s.key === 'trending') {
        sections.push({
          key: s.key,
          title: s.title ?? 'Trending this week',
          href: '/trending/week',
          items: await listCards(ctx, { order: 'trending_week', limit: 8 }),
        });
      } else if (s.key in TYPE_SECTIONS) {
        const type = vocab.types.find((t) => t.slug === s.key);
        if (!type) continue;
        const items = await listCards(ctx, {
          where: [eq(resources.resourceTypeId, type.id)],
          order: 'trending_week',
          limit: 8,
        });
        if (items.length)
          sections.push({
            key: s.key,
            title: s.title ?? TYPE_SECTIONS[s.key]!,
            href: `/${type.slug}`,
            items,
          });
      }
    }
    const collections = homepage.sections.some((s) => s.key === 'collections' && s.enabled)
      ? await listPublicCollections(ctx, { limit: 6 }).then((all) =>
          homepage.featuredCollectionIds.length
            ? all.filter((c) => homepage.featuredCollectionIds.includes(c.id))
            : all.filter((c) => c.resourceCount > 0),
        )
      : [];
    const featuredSubjects = (
      homepage.featuredSubjectIds.length
        ? taxonomy.subjects.filter((s) => homepage.featuredSubjectIds.includes(s.id))
        : [...taxonomy.subjects].sort((a, b) => b.count - a.count).slice(0, 12)
    ).map((s) => ({ name: s.name, slug: s.slug, count: s.count }));
    return {
      site,
      homepage,
      taxonomy,
      sections: sections.filter((s) => s.items.length > 0),
      collections,
      trendingSearches: await getTrendingSearches(ctx.db, 8),
      featuredSubjects,
    };
  };
  return ctx.cache ? ctx.cache.wrap(PUBLIC_CACHE_NS, 'home', 120, load) : load();
}

export { inArray };
