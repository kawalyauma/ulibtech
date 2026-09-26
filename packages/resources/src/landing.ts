import { eq } from '@edushare/database';
import { seoMetadata } from '@edushare/database/schema';
import { loadVocabulary, type VocabEntry } from '@edushare/search';
import { landingDescription, landingHeading, landingIntro, landingTitle } from '@edushare/seo';
import type {
  ClassRef,
  LandingPage,
  ResourceSort,
  TaxonomyRef,
  ResourceTypeRef,
} from '@edushare/shared';
import type { ServiceContext } from './context';
import { listPublicResources } from './public-resources';
import { getClassSubjects } from './taxonomy';

interface Resolved {
  class?: VocabEntry;
  subject?: VocabEntry;
  type?: VocabEntry;
  topic?: VocabEntry;
  year?: number;
  kind: 'class' | 'subject' | 'type' | 'combo' | 'topic';
}

/** Parses a landing-page path such as /p6/science/past-papers/2026. */
export async function parseLandingPath(
  ctx: ServiceContext,
  path: string,
): Promise<Resolved | null> {
  const v = await loadVocabulary(ctx.db);
  const seg = path
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase()
    .split('/')
    .filter(Boolean);
  if (seg.length === 0 || seg.length > 4) return null;
  const cls = (s?: string) => v.classes.find((c) => c.slug === s);
  const sub = (s?: string) => v.subjects.find((c) => c.slug === s);
  const typ = (s?: string) => v.types.find((c) => c.slug === s);
  const year = (s?: string) =>
    s && /^\d{4}$/.test(s) && v.years.some((y) => String(y.year) === s) ? Number(s) : undefined;

  if (seg[0] === 'classes') {
    const c = cls(seg[1]);
    return seg.length === 2 && c ? { kind: 'class', class: c } : null;
  }
  if (seg[0] === 'subjects') {
    const s = sub(seg[1]);
    if (!s) return null;
    if (seg.length === 2) return { kind: 'subject', subject: s };
    const t = typ(seg[2]);
    if (seg.length === 3 && t) return { kind: 'combo', subject: s, type: t };
    return null;
  }
  if (seg[0] === 'topics') {
    const t = v.topics.find((x) => x.slug === seg[1]);
    return seg.length === 2 && t ? { kind: 'topic', topic: t } : null;
  }

  const t0 = typ(seg[0]);
  if (t0) {
    if (seg.length === 1) return { kind: 'type', type: t0 };
    const y = year(seg[1]);
    return seg.length === 2 && y ? { kind: 'combo', type: t0, year: y } : null;
  }
  const c = cls(seg[0]);
  if (!c || seg.length < 2) return null;
  const s = sub(seg[1]);
  if (s) {
    if (seg.length === 2) return { kind: 'combo', class: c, subject: s };
    const t = typ(seg[2]);
    if (!t) return null;
    if (seg.length === 3) return { kind: 'combo', class: c, subject: s, type: t };
    const y = year(seg[3]);
    return y ? { kind: 'combo', class: c, subject: s, type: t, year: y } : null;
  }
  const t = typ(seg[1]);
  if (!t) return null;
  if (seg.length === 2) return { kind: 'combo', class: c, type: t };
  const y = year(seg[2]);
  return seg.length === 3 && y ? { kind: 'combo', class: c, type: t, year: y } : null;
}

export function landingPath(r: {
  class?: string;
  subject?: string;
  type?: string;
  year?: number;
}): string {
  if (r.class && r.subject)
    return `/${r.class}/${r.subject}${r.type ? `/${r.type}${r.year ? `/${r.year}` : ''}` : ''}`;
  if (r.class && r.type) return `/${r.class}/${r.type}${r.year ? `/${r.year}` : ''}`;
  if (r.class) return `/classes/${r.class}`;
  if (r.subject && r.type) return `/subjects/${r.subject}/${r.type}`;
  if (r.subject) return `/subjects/${r.subject}`;
  if (r.type) return `/${r.type}${r.year ? `/${r.year}` : ''}`;
  return '/search';
}

export interface LandingResult {
  landing: LandingPage;
  resources: Awaited<ReturnType<typeof listPublicResources>>;
}

export async function getLanding(
  ctx: ServiceContext,
  path: string,
  opts: {
    page?: number;
    pageSize?: number;
    sort?: ResourceSort;
    term?: string;
    year?: number;
    fileType?: string;
  } = {},
): Promise<LandingResult | null> {
  const r = await parseLandingPath(ctx, path);
  if (!r) return null;
  const v = await loadVocabulary(ctx.db);
  const canonicalPath =
    r.kind === 'topic'
      ? `/topics/${r.topic!.slug}`
      : landingPath({
          class: r.class?.slug,
          subject: r.subject?.slug,
          type: r.type?.slug,
          year: r.year,
        });

  const filters = {
    class: r.class?.slug,
    subject: r.subject?.slug,
    type: r.type?.slug,
    topic: r.topic?.slug,
    year: r.year ?? opts.year,
    term: opts.term,
    fileType: opts.fileType,
  };
  const list = await listPublicResources(ctx, {
    ...filters,
    page: opts.page ?? 1,
    pageSize: opts.pageSize ?? 24,
    sort: opts.sort ?? 'newest',
  } as Parameters<typeof listPublicResources>[1]);

  const clsRow = r.class;
  const levelSlugOfClass = clsRow ? v.levels.find((l) => l.id === clsRow.parentId) : undefined;
  const ctxText = {
    className: r.class?.label,
    classLongName: r.class?.name,
    subjectName: r.subject?.name,
    typePlural: r.type?.label,
    year: r.year,
    topicName: r.topic?.name,
    count: list.total,
  };
  const override = await ctx.db.query.seoMetadata.findFirst({
    where: eq(seoMetadata.path, canonicalPath),
  });

  const crumbs: { name: string; path: string }[] = [{ name: 'Home', path: '/' }];
  if (r.class) {
    crumbs.push({ name: 'Classes', path: '/classes' });
    crumbs.push({ name: r.class.label, path: `/classes/${r.class.slug}` });
  }
  if (r.subject)
    crumbs.push({
      name: r.subject.name,
      path: r.class ? `/${r.class.slug}/${r.subject.slug}` : `/subjects/${r.subject.slug}`,
    });
  else if (!r.class && r.kind === 'subject') crumbs.push({ name: 'Subjects', path: '/subjects' });
  if (r.type)
    crumbs.push({
      name: r.type.label,
      path: landingPath({ class: r.class?.slug, subject: r.subject?.slug, type: r.type.slug }),
    });
  if (r.year) crumbs.push({ name: String(r.year), path: canonicalPath });
  if (r.topic)
    crumbs.push({ name: 'Topics', path: '/search' }, { name: r.topic.name, path: canonicalPath });
  if (r.kind === 'subject' && crumbs.length === 2)
    crumbs.push({ name: r.subject!.name, path: canonicalPath });

  // Related internal links derived from facets and taxonomy.
  const related: { name: string; path: string }[] = [];
  const f = list.facets;
  if (r.class && r.subject && !r.type) {
    for (const t of f.type)
      related.push({
        name: `${r.class.label} ${r.subject.name} ${t.name}`,
        path: `/${r.class.slug}/${r.subject.slug}/${t.slug}`,
      });
  }
  if (r.class && r.subject && r.type && !r.year) {
    for (const y of f.year)
      related.push({
        name: `${r.class.label} ${r.subject.name} ${r.type.label} ${y.name}`,
        path: `/${r.class.slug}/${r.subject.slug}/${r.type.slug}/${y.slug}`,
      });
  }
  if (r.class) {
    const subs = await getClassSubjects(ctx, r.class.id);
    for (const s of subs) {
      if (s.slug === r.subject?.slug || s.count === 0) continue;
      related.push({
        name: `${r.class.label} ${s.name}${r.type ? ` ${r.type.label}` : ''}`,
        path: r.type ? `/${r.class.slug}/${s.slug}/${r.type.slug}` : `/${r.class.slug}/${s.slug}`,
      });
    }
  }
  if (!r.class && (r.type || r.subject)) {
    for (const c of f.class) {
      related.push({
        name: `${c.name} ${r.subject?.name ?? ''} ${r.type?.label ?? 'Resources'}`
          .replace(/\s+/g, ' ')
          .trim(),
        path: r.subject
          ? r.type
            ? `/${c.slug}/${r.subject.slug}/${r.type.slug}`
            : `/${c.slug}/${r.subject.slug}`
          : `/${c.slug}/${r.type!.slug}`,
      });
    }
  }
  if (r.class && !r.subject && !r.type) {
    for (const t of f.type)
      related.push({ name: `${r.class.label} ${t.name}`, path: `/${r.class.slug}/${t.slug}` });
  }

  const toClassRef = (e: VocabEntry): ClassRef => ({
    id: e.id,
    name: e.name,
    slug: e.slug,
    shortName: e.label,
    level: levelSlugOfClass
      ? { id: levelSlugOfClass.id, name: levelSlugOfClass.name, slug: levelSlugOfClass.slug }
      : null,
  });
  const toRef = (e: VocabEntry): TaxonomyRef => ({ id: e.id, name: e.name, slug: e.slug });
  const toTypeRef = (e: VocabEntry): ResourceTypeRef => ({
    id: e.id,
    name: e.name,
    slug: e.slug,
    pluralName: e.label,
  });

  const heading = landingHeading(ctxText);
  return {
    landing: {
      path: canonicalPath,
      title: override?.title ?? landingTitle(ctxText),
      heading,
      description: override?.description ?? landingDescription(ctxText),
      intro: override?.intro ?? landingIntro(ctxText),
      noindex: override?.noindex ?? list.total === 0,
      filters: {
        class: filters.class,
        subject: filters.subject,
        type: filters.type,
        year: r.year,
        topic: filters.topic,
      },
      breadcrumbs: crumbs,
      context: {
        class: r.class ? toClassRef(r.class) : null,
        subject: r.subject ? toRef(r.subject) : null,
        resourceType: r.type ? toTypeRef(r.type) : null,
        year: r.year ?? null,
        topic: r.topic ? toRef(r.topic) : null,
      },
      related: related.slice(0, 24),
    },
    resources: list,
  };
}
