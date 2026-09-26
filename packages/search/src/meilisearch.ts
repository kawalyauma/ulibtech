import { Meilisearch, type Index } from 'meilisearch';
import { sql, type Database } from '@edushare/database';
import type { Cache } from '@edushare/cache';
import type { FacetBucket, Suggestion } from '@edushare/shared';
import { PostgresSearchProvider } from './postgres';
import { expandNumberWords, SYNONYMS } from './text';
import type { ProviderSearchResult, SearchProvider, SearchRequest } from './types';
import {
  buildCorrectionLexicon,
  buildPhraseIndex,
  correctQuery,
  parseQuery,
  type Vocabulary,
} from './vocabulary';
import { loadVocabulary } from './vocabulary-loader';

export interface MeiliDocument {
  id: string;
  title: string;
  shortDescription: string | null;
  description: string | null;
  className: string | null;
  classAliases: string[];
  subjectName: string | null;
  subjectAliases: string[];
  typeName: string | null;
  typeAliases: string[];
  topic: string | null;
  tags: string[];
  keywords: string[];
  author: string | null;
  publisher: string | null;
  fileName: string | null;
  content: string | null;
  classSlug: string | null;
  levelSlug: string | null;
  subjectSlug: string | null;
  typeSlug: string | null;
  termSlug: string | null;
  topicSlug: string | null;
  curriculumSlug: string | null;
  collectionSlugs: string[];
  year: number | null;
  fileKind: string | null;
  featured: boolean;
  publishedAt: number;
  downloadCount: number;
  popularity: number;
  trendingDay: number;
  trendingWeek: number;
  titleSort: string;
}

/** Characters of extracted text sent to Meilisearch per document. */
const CONTENT_CHARS = 60_000;

const SORTS: Record<SearchRequest['sort'], string[] | undefined> = {
  relevance: undefined,
  newest: ['publishedAt:desc'],
  oldest: ['publishedAt:asc'],
  downloads: ['downloadCount:desc'],
  popular: ['popularity:desc'],
  trending_today: ['trendingDay:desc', 'trendingWeek:desc'],
  trending_week: ['trendingWeek:desc', 'downloadCount:desc'],
  title: ['titleSort:asc'],
};

const HL = { pre: '««', post: '»»' };

function quote(v: string | number | boolean): string {
  return typeof v === 'string' ? `"${v.replace(/["\\]/g, '')}"` : String(v);
}

export interface MeilisearchOptions {
  host: string;
  apiKey?: string;
  indexName?: string;
  cache?: Cache;
}

/**
 * Meilisearch-backed search. Postgres search vectors are still maintained so suggestions keep
 * working and switching SEARCH_PROVIDER back to `postgres` needs no reindex.
 */
export class MeilisearchProvider implements SearchProvider {
  readonly name = 'meilisearch';
  private readonly client: Meilisearch;
  private readonly index: Index<MeiliDocument>;
  private readonly pg: PostgresSearchProvider;
  private configured: Promise<void> | undefined;

  constructor(
    private readonly db: Database,
    private readonly options: MeilisearchOptions,
  ) {
    this.client = new Meilisearch({ host: options.host, apiKey: options.apiKey });
    this.index = this.client.index<MeiliDocument>(options.indexName ?? 'resources');
    this.pg = new PostgresSearchProvider(db, { cache: options.cache });
  }

  /** Creates the index and applies ranking, filter, sort and synonym settings (idempotent). */
  configure(): Promise<void> {
    this.configured ??= (async () => {
      await this.client
        .createIndex(this.index.uid, { primaryKey: 'id' })
        .waitTask()
        .catch(() => undefined);
      const v = await loadVocabulary(this.db);
      const synonyms: Record<string, string[]> = { ...SYNONYMS };
      for (const e of [...v.subjects, ...v.types, ...v.classes]) {
        for (const p of e.phrases) {
          const k = p.toLowerCase();
          if (k !== e.name.toLowerCase())
            synonyms[k] = [...new Set([...(synonyms[k] ?? []), e.name.toLowerCase()])];
        }
      }
      await this.index
        .updateSettings({
          // Order = importance: title first, extracted document text last.
          searchableAttributes: [
            'title',
            'className',
            'classAliases',
            'subjectName',
            'subjectAliases',
            'typeName',
            'typeAliases',
            'topic',
            'tags',
            'keywords',
            'shortDescription',
            'description',
            'author',
            'publisher',
            'fileName',
            'content',
          ],
          filterableAttributes: [
            'classSlug',
            'levelSlug',
            'subjectSlug',
            'typeSlug',
            'termSlug',
            'topicSlug',
            'curriculumSlug',
            'collectionSlugs',
            'year',
            'fileKind',
            'featured',
          ],
          sortableAttributes: [
            'publishedAt',
            'downloadCount',
            'popularity',
            'trendingDay',
            'trendingWeek',
            'titleSort',
          ],
          rankingRules: [
            'words',
            'typo',
            'proximity',
            'attribute',
            'sort',
            'exactness',
            'popularity:desc',
          ],
          synonyms,
          pagination: { maxTotalHits: 10_000 },
          faceting: { maxValuesPerFacet: 200 },
        })
        .waitTask();
    })();
    this.configured.catch(() => {
      this.configured = undefined;
    });
    return this.configured;
  }

  private async documents(where: ReturnType<typeof sql>): Promise<MeiliDocument[]> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT r.id, r.title, r.short_description, r.description, r.featured, r.author, r.publisher, r.keywords,
        r.download_count, r.popularity, r.trending_day, r.trending_week, extract(epoch FROM r.published_at)::bigint AS published_at,
        coalesce(c.short_name, c.name) AS class_name, c.slug AS class_slug, c.aliases AS class_aliases, sl.slug AS level_slug,
        s.name AS subject_name, s.slug AS subject_slug, s.aliases AS subject_aliases,
        rt.name AS type_name, rt.slug AS type_slug, rt.aliases AS type_aliases,
        t.slug AS term_slug, ay.year, tp.slug AS topic_slug, coalesce(tp.name, r.topic_text) AS topic, cu.slug AS curriculum_slug,
        f.kind AS file_kind, f.original_name AS file_name, left(f.extracted_text, ${CONTENT_CHARS}) AS content,
        coalesce((SELECT array_agg(tg.name) FROM resource_tags x JOIN tags tg ON tg.id = x.tag_id WHERE x.resource_id = r.id), '{}') AS tags,
        coalesce((SELECT array_agg(co.slug) FROM collection_resources cr JOIN collections co ON co.id = cr.collection_id AND co.is_published WHERE cr.resource_id = r.id), '{}') AS collections
      FROM resources r
      LEFT JOIN classes c ON c.id = r.class_id
      LEFT JOIN school_levels sl ON sl.id = c.level_id
      LEFT JOIN subjects s ON s.id = r.subject_id
      LEFT JOIN resource_types rt ON rt.id = r.resource_type_id
      LEFT JOIN terms t ON t.id = r.term_id
      LEFT JOIN academic_years ay ON ay.id = r.academic_year_id
      LEFT JOIN topics tp ON tp.id = r.topic_id
      LEFT JOIN curricula cu ON cu.id = r.curriculum_id
      LEFT JOIN resource_files f ON f.id = r.file_id
      WHERE r.status = 'published' AND ${where}`);
    const str = (v: unknown) => (typeof v === 'string' ? v : null);
    const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
    return rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      shortDescription: str(r.short_description),
      description: str(r.description),
      className: str(r.class_name),
      classAliases: arr(r.class_aliases),
      subjectName: str(r.subject_name),
      subjectAliases: arr(r.subject_aliases),
      typeName: str(r.type_name),
      typeAliases: arr(r.type_aliases),
      topic: str(r.topic),
      tags: arr(r.tags),
      keywords: arr(r.keywords),
      author: str(r.author),
      publisher: str(r.publisher),
      fileName: str(r.file_name)?.replace(/[_.-]+/g, ' ') ?? null,
      content: str(r.content),
      classSlug: str(r.class_slug),
      levelSlug: str(r.level_slug),
      subjectSlug: str(r.subject_slug),
      typeSlug: str(r.type_slug),
      termSlug: str(r.term_slug),
      topicSlug: str(r.topic_slug),
      curriculumSlug: str(r.curriculum_slug),
      collectionSlugs: arr(r.collections),
      year: r.year === null || r.year === undefined ? null : Number(r.year),
      fileKind: str(r.file_kind),
      featured: Boolean(r.featured),
      publishedAt: Number(r.published_at ?? 0),
      downloadCount: Number(r.download_count ?? 0),
      popularity: Number(r.popularity ?? 0),
      trendingDay: Number(r.trending_day ?? 0),
      trendingWeek: Number(r.trending_week ?? 0),
      titleSort: String(r.title).toLowerCase(),
    }));
  }

  async indexResource(resourceId: string): Promise<void> {
    await this.pg.indexResource(resourceId);
    await this.configure();
    const [doc] = await this.documents(sql`r.id = ${resourceId}`);
    if (doc) await this.index.addDocuments([doc]).waitTask();
    else await this.index.deleteDocument(resourceId).waitTask();
  }

  async removeResource(resourceId: string): Promise<void> {
    await this.pg.removeResource(resourceId);
    await this.index.deleteDocument(resourceId).waitTask();
  }

  async rebuildIndex(): Promise<{ indexed: number }> {
    await this.pg.rebuildIndex();
    this.configured = undefined;
    await this.configure();
    await this.index.deleteAllDocuments().waitTask();
    const docs = await this.documents(sql`true`);
    for (let i = 0; i < docs.length; i += 500)
      await this.index.addDocuments(docs.slice(i, i + 500)).waitTask();
    return { indexed: docs.length };
  }

  private filterExpr(req: SearchRequest, extra: string[] = []): string[] {
    const f = req.filters;
    const out = [...extra];
    const eq = (field: string, v: string | number | boolean | undefined) => {
      if (v !== undefined && v !== '') out.push(`${field} = ${quote(v)}`);
    };
    eq('classSlug', f.class);
    eq('subjectSlug', f.subject);
    eq('typeSlug', f.type);
    eq('termSlug', f.term);
    eq('topicSlug', f.topic);
    eq('curriculumSlug', f.curriculum);
    eq('levelSlug', f.level);
    eq('year', f.year);
    eq('fileKind', f.fileType?.toLowerCase());
    eq('featured', f.featured);
    if (f.collection) out.push(`collectionSlugs = ${quote(f.collection)}`);
    return out;
  }

  private facets(
    dist: Record<string, Record<string, number>> | undefined,
    v: Vocabulary,
  ): ProviderSearchResult['facets'] {
    const map = (
      field: string,
      name: (slug: string) => string | undefined,
      order?: (a: FacetBucket, b: FacetBucket) => number,
    ) =>
      Object.entries(dist?.[field] ?? {})
        .map(([slug, count]) => ({ slug, name: name(slug) ?? slug, count }))
        .sort(order ?? ((a, b) => b.count - a.count));
    const classOrder = new Map(v.classes.map((c, i) => [c.slug, i]));
    return {
      class: map(
        'classSlug',
        (s) => v.classes.find((c) => c.slug === s)?.label,
        (a, b) => (classOrder.get(a.slug) ?? 0) - (classOrder.get(b.slug) ?? 0),
      ),
      subject: map('subjectSlug', (s) => v.subjects.find((c) => c.slug === s)?.label),
      type: map('typeSlug', (s) => v.types.find((c) => c.slug === s)?.label),
      year: map(
        'year',
        (s) => s,
        (a, b) => Number(b.slug) - Number(a.slug),
      ),
      term: map(
        'termSlug',
        (s) => v.terms.find((c) => c.slug === s)?.label,
        (a, b) => a.slug.localeCompare(b.slug),
      ),
      fileType: map('fileKind', (s) => s.toUpperCase()),
    };
  }

  async search(req: SearchRequest): Promise<ProviderSearchResult> {
    const started = performance.now();
    await this.configure();
    const v = await loadVocabulary(this.db);
    const parsed = parseQuery(req.q, buildPhraseIndex(v), expandNumberWords);
    const e = parsed.entities;
    // Recognised class/subject/type/term/year become filters; the rest is the text query.
    const entityFilters: string[] = [];
    if (e.class && !req.filters.class) entityFilters.push(`classSlug = ${quote(e.class.slug)}`);
    if (e.subject && !req.filters.subject)
      entityFilters.push(`subjectSlug = ${quote(e.subject.slug)}`);
    if (e.type && !req.filters.type) entityFilters.push(`typeSlug = ${quote(e.type.slug)}`);
    if (e.term && !req.filters.term) entityFilters.push(`termSlug = ${quote(e.term.slug)}`);
    if (e.year && !req.filters.year) entityFilters.push(`year = ${e.year}`);

    const run = (q: string, filter: string[]) =>
      this.index.search(q, {
        filter,
        sort: SORTS[req.sort] ?? (q ? undefined : ['publishedAt:desc']),
        page: req.page,
        hitsPerPage: req.pageSize,
        facets: ['classSlug', 'subjectSlug', 'typeSlug', 'year', 'termSlug', 'fileKind'],
        attributesToRetrieve: ['id'],
        attributesToHighlight: ['title', 'shortDescription', 'description'],
        attributesToCrop: ['description', 'content'],
        cropLength: 28,
        highlightPreTag: HL.pre,
        highlightPostTag: HL.post,
        showRankingScore: true,
        matchingStrategy: 'last',
      });

    let mode: ProviderSearchResult['mode'] = parsed.normalized ? 'all' : 'browse';
    // Full query + entity filters keeps highlighting; Meilisearch drops trailing words if needed.
    let res = await run(parsed.normalized, this.filterExpr(req, entityFilters));
    if (!res.totalHits && parsed.terms.length && entityFilters.length) {
      res = await run(parsed.terms.join(' '), this.filterExpr(req, entityFilters));
    }
    if (!res.totalHits && parsed.normalized && entityFilters.length) {
      mode = 'any';
      res = await run(parsed.normalized, this.filterExpr(req));
    }
    const didYouMean =
      !res.totalHits && parsed.normalized
        ? correctQuery(parsed.normalized, buildCorrectionLexicon(v))
        : null;
    if (!res.totalHits && didYouMean) {
      mode = 'fuzzy';
      res = await run(didYouMean, this.filterExpr(req));
    }
    const formatted = (h: Record<string, unknown>) =>
      (h._formatted ?? {}) as Record<string, string | undefined>;
    return {
      hits: res.hits.map((h) => {
        const f = formatted(h as unknown as Record<string, unknown>);
        const snippet =
          [f.shortDescription, f.description, f.content].find((x) => x?.includes(HL.pre)) ?? null;
        return {
          id: String(h.id),
          score: Number((h as { _rankingScore?: number })._rankingScore ?? 0),
          highlight: { title: f.title?.includes(HL.pre) ? f.title : '', snippet },
        };
      }),
      total: res.totalHits ?? 0,
      mode,
      normalizedQuery: parsed.normalized,
      didYouMean,
      interpreted: {
        class: e.class?.slug,
        subject: e.subject?.slug,
        type: e.type?.slug,
        year: e.year,
        term: e.term?.slug,
      },
      facets: this.facets(res.facetDistribution, v),
      tookMs: Math.round(performance.now() - started),
    };
  }

  suggest(q: string, limit?: number): Promise<Suggestion[]> {
    return this.pg.suggest(q, limit);
  }
}
