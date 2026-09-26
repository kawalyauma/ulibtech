import { sql, type Database, type SQL } from '@edushare/database';
import type { Cache } from '@edushare/cache';
import type { FacetBucket, Suggestion } from '@edushare/shared';
import { buildTsquery } from './tsquery';
import { expandNumberWords, normalizeQuery } from './text';
import type { Interpretation, ProviderHit, ProviderSearchResult, SearchProvider, SearchRequest } from './types';
import {
  buildCorrectionLexicon,
  buildPhraseIndex,
  correctQuery,
  parseQuery,
  type ParsedQuery,
  type Vocabulary,
} from './vocabulary';
import { loadVocabulary } from './vocabulary-loader';

/** Rank weights for {D, C, B, A}: title (A) dominates; description (D) is lowest. */
const WEIGHTS = '{0.15,0.35,0.6,1.0}';
const HL = 'StartSel=««, StopSel=»», HighlightAll=true';
const SNIPPET = 'StartSel=««, StopSel=»», MaxWords=28, MinWords=12, MaxFragments=2, FragmentDelimiter=" … "';

type Mode = ProviderSearchResult['mode'];

interface ResolvedFilters {
  where: SQL[];
  impossible: boolean;
}

interface Plan {
  mode: Mode;
  tsquery: string | null;
  hardEntities: boolean;
  /** OR-query over every typed word, used only for highlighting. */
  highlight?: string | null;
}

function emptyFacets(): ProviderSearchResult['facets'] {
  return { class: [], subject: [], type: [], year: [], term: [], fileType: [] };
}

export interface PostgresSearchOptions {
  cache?: Cache;
}

export class PostgresSearchProvider implements SearchProvider {
  readonly name = 'postgres';

  constructor(
    private readonly db: Database,
    private readonly options: PostgresSearchOptions = {},
  ) {}

  // ---------------------------------------------------------------- indexing

  private indexSql(where: SQL): SQL {
    return sql`
      UPDATE resources r SET
        search_vector =
          setweight(to_tsvector('edushare', coalesce(r.title, '')), 'A') ||
          setweight(to_tsvector('edushare', concat_ws(' ',
            c.name, c.short_name, c.slug, array_to_string(c.aliases, ' '),
            s.name, s.short_name, array_to_string(s.aliases, ' '),
            rt.name, rt.plural_name, array_to_string(rt.aliases, ' '),
            ay.year::text, t.name, sl.name)), 'B') ||
          setweight(to_tsvector('edushare', concat_ws(' ',
            tp.name, st.name, r.topic_text, r.subtopic_text,
            array_to_string(r.keywords, ' '),
            (SELECT string_agg(tg.name, ' ') FROM resource_tags rtg JOIN tags tg ON tg.id = rtg.tag_id WHERE rtg.resource_id = r.id))), 'C') ||
          setweight(to_tsvector('edushare', concat_ws(' ',
            r.short_description, r.description, r.author, r.publisher, cu.name,
            regexp_replace(coalesce(f.original_name, ''), '[_.\\-]+', ' ', 'g'))), 'D'),
        content_vector = CASE WHEN f.extracted_text IS NULL OR f.extracted_text = '' THEN NULL
          ELSE to_tsvector('edushare', left(f.extracted_text, 250000)) END,
        search_text = lower(unaccent(concat_ws(' ', r.title, c.short_name, c.name, s.name, s.short_name, rt.name, ay.year::text, t.name, tp.name, r.topic_text))),
        indexed_at = now()
      FROM resources r2
        LEFT JOIN classes c ON c.id = r2.class_id
        LEFT JOIN school_levels sl ON sl.id = c.level_id
        LEFT JOIN subjects s ON s.id = r2.subject_id
        LEFT JOIN resource_types rt ON rt.id = r2.resource_type_id
        LEFT JOIN academic_years ay ON ay.id = r2.academic_year_id
        LEFT JOIN terms t ON t.id = r2.term_id
        LEFT JOIN topics tp ON tp.id = r2.topic_id
        LEFT JOIN subtopics st ON st.id = r2.subtopic_id
        LEFT JOIN curricula cu ON cu.id = r2.curriculum_id
        LEFT JOIN resource_files f ON f.id = r2.file_id
      WHERE r.id = r2.id AND ${where}`;
  }

  async indexResource(resourceId: string): Promise<void> {
    await this.db.execute(this.indexSql(sql`r2.id = ${resourceId}`));
    await this.options.cache?.invalidate('suggest');
  }

  async removeResource(resourceId: string): Promise<void> {
    await this.db.execute(
      sql`UPDATE resources SET search_vector = NULL, content_vector = NULL, indexed_at = now() WHERE id = ${resourceId}`,
    );
    await this.options.cache?.invalidate('suggest');
  }

  async rebuildIndex(): Promise<{ indexed: number }> {
    const rows = await this.db.execute<{ id: string }>(sql`SELECT id FROM resources ORDER BY created_at`);
    const ids = rows.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 200) {
      const batch = ids.slice(i, i + 200);
      await this.db.execute(this.indexSql(sql`r2.id IN (${sql.join(batch.map((id) => sql`${id}::uuid`), sql`, `)})`));
    }
    await this.options.cache?.invalidate('suggest');
    return { indexed: ids.length };
  }

  // ---------------------------------------------------------------- search

  private resolveFilters(req: SearchRequest, v: Vocabulary): ResolvedFilters {
    const where: SQL[] = [sql`r.status = 'published'`];
    let impossible = false;
    const f = req.filters;
    const bySlug = <T extends { slug: string; id: string }>(list: T[], slug?: string) => {
      if (!slug) return undefined;
      const hit = list.find((x) => x.slug === slug);
      if (!hit) impossible = true;
      return hit;
    };
    const cls = bySlug(v.classes, f.class);
    if (cls) where.push(sql`r.class_id = ${cls.id}`);
    const sub = bySlug(v.subjects, f.subject);
    if (sub) where.push(sql`r.subject_id = ${sub.id}`);
    const typ = bySlug(v.types, f.type);
    if (typ) where.push(sql`r.resource_type_id = ${typ.id}`);
    const trm = bySlug(v.terms, f.term);
    if (trm) where.push(sql`r.term_id = ${trm.id}`);
    const cur = bySlug(v.curricula, f.curriculum);
    if (cur) where.push(sql`r.curriculum_id = ${cur.id}`);
    const tp = bySlug(v.topics, f.topic);
    if (tp) where.push(sql`r.topic_id = ${tp.id}`);
    if (f.level) {
      const lvl = bySlug(v.levels, f.level);
      if (lvl) where.push(sql`r.class_id IN (SELECT id FROM classes WHERE level_id = ${lvl.id})`);
    }
    if (f.year) {
      const y = v.years.find((x) => x.year === f.year);
      if (!y) impossible = true;
      else where.push(sql`r.academic_year_id = ${y.id}`);
    }
    if (f.fileType) where.push(sql`f.kind = ${f.fileType.toLowerCase()}`);
    if (f.featured !== undefined) where.push(sql`r.featured = ${f.featured}`);
    if (f.collection) {
      where.push(
        sql`EXISTS (SELECT 1 FROM collection_resources cr JOIN collections co ON co.id = cr.collection_id WHERE cr.resource_id = r.id AND co.slug = ${f.collection} AND co.is_published)`,
      );
    }
    return { where, impossible };
  }

  private entityConditions(parsed: ParsedQuery, req: SearchRequest): SQL[] {
    const out: SQL[] = [];
    const e = parsed.entities;
    // Explicit UI filters win over interpreted entities.
    if (e.class && !req.filters.class) out.push(sql`r.class_id = ${e.class.id}`);
    if (e.subject && !req.filters.subject) out.push(sql`r.subject_id = ${e.subject.id}`);
    if (e.type && !req.filters.type) out.push(sql`r.resource_type_id = ${e.type.id}`);
    if (e.term && !req.filters.term) out.push(sql`r.term_id = ${e.term.id}`);
    if (e.year && !req.filters.year) {
      out.push(sql`r.academic_year_id IN (SELECT id FROM academic_years WHERE year = ${e.year})`);
    }
    return out;
  }

  private boostSql(parsed: ParsedQuery): SQL {
    const e = parsed.entities;
    const parts: SQL[] = [sql`0`];
    if (e.class) parts.push(sql`CASE WHEN r.class_id = ${e.class.id} THEN 0.35 ELSE 0 END`);
    if (e.subject) parts.push(sql`CASE WHEN r.subject_id = ${e.subject.id} THEN 0.35 ELSE 0 END`);
    if (e.type) parts.push(sql`CASE WHEN r.resource_type_id = ${e.type.id} THEN 0.25 ELSE 0 END`);
    if (e.term) parts.push(sql`CASE WHEN r.term_id = ${e.term.id} THEN 0.1 ELSE 0 END`);
    if (e.year) {
      parts.push(sql`CASE WHEN r.academic_year_id IN (SELECT id FROM academic_years WHERE year = ${e.year}) THEN 0.1 ELSE 0 END`);
    }
    return sql.join(parts, sql` + `);
  }

  /** ORDER BY over the `scored` CTE (alias `s`). */
  private orderSql(sort: SearchRequest['sort']): SQL {
    switch (sort) {
      case 'newest':
        return sql`s.published_at DESC NULLS LAST, s.id`;
      case 'oldest':
        return sql`s.published_at ASC NULLS LAST, s.id`;
      case 'downloads':
        return sql`s.download_count DESC, s.published_at DESC NULLS LAST, s.id`;
      case 'popular':
        return sql`s.popularity DESC, s.download_count DESC, s.published_at DESC NULLS LAST, s.id`;
      case 'trending_today':
        return sql`s.trending_day DESC, s.trending_week DESC, s.download_count DESC, s.id`;
      case 'trending_week':
        return sql`s.trending_week DESC, s.download_count DESC, s.published_at DESC NULLS LAST, s.id`;
      case 'title':
        return sql`lower(s.title) ASC, s.id`;
      case 'relevance':
      default:
        return sql`s.score DESC, s.published_at DESC NULLS LAST, s.id`;
    }
  }

  private async runPlan(
    req: SearchRequest,
    parsed: ParsedQuery,
    filters: ResolvedFilters,
    plan: Plan,
    queryText: string,
  ): Promise<{ hits: ProviderHit[]; total: number; where: SQL[]; qExpr: SQL }> {
    const where = [...filters.where];
    if (plan.hardEntities) where.push(...this.entityConditions(parsed, req));

    let qExpr: SQL = sql`NULL::tsquery`;
    let matchSql: SQL | null = null;
    let textScore: SQL = sql`0`;
    if (plan.mode === 'fuzzy') {
      qExpr = plan.tsquery ? sql`to_tsquery('edushare', ${plan.tsquery})` : sql`NULL::tsquery`;
      matchSql = sql`(${queryText} <% r.search_text OR word_similarity(${queryText}, lower(r.title)) > 0.45)`;
      textScore = sql`word_similarity(${queryText}, coalesce(r.search_text, lower(r.title)))`;
    } else if (plan.tsquery && parsed.advanced && plan.mode === 'all') {
      qExpr = sql`websearch_to_tsquery('edushare', ${req.q})`;
    } else if (plan.tsquery) {
      qExpr = sql`to_tsquery('edushare', ${plan.tsquery})`;
    }
    if (plan.mode !== 'fuzzy' && plan.tsquery) {
      matchSql = sql`(numnode(q.q) = 0 OR r.search_vector @@ q.q OR r.content_vector @@ q.q)`;
      textScore = sql`CASE WHEN numnode(q.q) = 0 THEN 0 ELSE
          ts_rank_cd(${WEIGHTS}::float4[], coalesce(r.search_vector, ''::tsvector), q.q, 32)
          + 0.2 * ts_rank(coalesce(r.content_vector, ''::tsvector), q.q, 1) END`;
    }
    if (matchSql) where.push(matchSql);

    const exactTitle = queryText ? sql`CASE WHEN lower(r.title) = ${queryText} THEN 1.0 ELSE 0 END` : sql`0`;
    const titleSim = queryText ? sql`0.4 * word_similarity(${queryText}, lower(r.title))` : sql`0`;
    const score = sql`(${textScore}) + ${exactTitle} + ${titleSim} + (${this.boostSql(parsed)}) + 0.02 * ln(1 + r.download_count) + CASE WHEN r.featured THEN 0.02 ELSE 0 END`;

    const offset = (req.page - 1) * req.pageSize;
    const rows = await this.db.execute<{ id: string; score: number; total: number; title_hl: string | null; snippet: string | null }>(sql`
      WITH q AS (SELECT ${qExpr} AS q, ${plan.highlight ? sql`to_tsquery('edushare', ${plan.highlight})` : qExpr} AS hq),
      scored AS (
        SELECT r.id, r.title, r.short_description, r.description, r.published_at, r.download_count,
               r.popularity, r.trending_day, r.trending_week, r.file_id, (${score})::float8 AS score
        FROM resources r
        LEFT JOIN resource_files f ON f.id = r.file_id
        CROSS JOIN q
        WHERE ${sql.join(where, sql` AND `)}
      ),
      page AS (
        SELECT s.*, count(*) OVER ()::int AS total, row_number() OVER (ORDER BY ${this.orderSql(req.sort)}) AS rn
        FROM scored s
        ORDER BY rn
        LIMIT ${req.pageSize} OFFSET ${offset}
      )
      SELECT p.id, p.score, p.total,
        CASE WHEN q.hq IS NULL OR numnode(q.hq) = 0 THEN NULL
          ELSE ts_headline('edushare', p.title, q.hq, ${HL}) END AS title_hl,
        CASE WHEN q.hq IS NULL OR numnode(q.hq) = 0 THEN NULL
          WHEN to_tsvector('edushare', coalesce(p.short_description, '') || ' ' || coalesce(p.description, '')) @@ q.hq
            THEN ts_headline('edushare', coalesce(p.short_description, '') || ' ' || coalesce(p.description, ''), q.hq, ${SNIPPET})
          WHEN q.q IS NOT NULL AND numnode(q.q) > 0 AND f.extracted_text IS NOT NULL AND to_tsvector('edushare', left(f.extracted_text, 20000)) @@ q.q
            THEN ts_headline('edushare', left(f.extracted_text, 20000), q.q, ${SNIPPET})
          ELSE NULL END AS snippet
      FROM page p
      CROSS JOIN q
      LEFT JOIN resource_files f ON f.id = p.file_id
      ORDER BY p.rn`);

    let total = rows[0]?.total ?? 0;
    if (rows.length === 0 && offset > 0) {
      // Requested page is past the end: still report the real total.
      const [c] = await this.db.execute<{ n: number }>(sql`
        WITH q AS (SELECT ${qExpr} AS q)
        SELECT count(*)::int AS n FROM resources r LEFT JOIN resource_files f ON f.id = r.file_id CROSS JOIN q
        WHERE ${sql.join(where, sql` AND `)}`);
      total = c?.n ?? 0;
    }
    return {
      hits: rows.map((r) => ({
        id: r.id,
        score: Number(r.score),
        highlight: { title: r.title_hl ?? '', snippet: r.snippet },
      })),
      total,
      where,
      qExpr,
    };
  }

  private async facets(where: SQL[], qExpr: SQL, v: Vocabulary): Promise<ProviderSearchResult['facets']> {
    const rows = await this.db.execute<{
      class_id: string | null;
      subject_id: string | null;
      resource_type_id: string | null;
      academic_year_id: string | null;
      term_id: string | null;
      kind: string | null;
      gc: number;
      gs: number;
      gt: number;
      gy: number;
      gm: number;
      gk: number;
      n: number;
    }>(sql`
      WITH q AS (SELECT ${qExpr} AS q)
      SELECT r.class_id, r.subject_id, r.resource_type_id, r.academic_year_id, r.term_id, f.kind,
        GROUPING(r.class_id) AS gc, GROUPING(r.subject_id) AS gs, GROUPING(r.resource_type_id) AS gt,
        GROUPING(r.academic_year_id) AS gy, GROUPING(r.term_id) AS gm, GROUPING(f.kind) AS gk,
        count(*)::int AS n
      FROM resources r
      LEFT JOIN resource_files f ON f.id = r.file_id
      CROSS JOIN q
      WHERE ${sql.join(where, sql` AND `)}
      GROUP BY GROUPING SETS ((r.class_id), (r.subject_id), (r.resource_type_id), (r.academic_year_id), (r.term_id), (f.kind))`);
    const facets = emptyFacets();
    const find = (list: { id: string; slug: string; label: string }[], id: string | null) => list.find((x) => x.id === id);
    for (const row of rows) {
      let bucket: FacetBucket | null = null;
      let key: keyof ProviderSearchResult['facets'] | null = null;
      if (row.gc === 0 && row.class_id) {
        const c = find(v.classes, row.class_id);
        if (c) [key, bucket] = ['class', { slug: c.slug, name: c.label, count: row.n }];
      } else if (row.gs === 0 && row.subject_id) {
        const s = find(v.subjects, row.subject_id);
        if (s) [key, bucket] = ['subject', { slug: s.slug, name: s.label, count: row.n }];
      } else if (row.gt === 0 && row.resource_type_id) {
        const t = find(v.types, row.resource_type_id);
        if (t) [key, bucket] = ['type', { slug: t.slug, name: t.label, count: row.n }];
      } else if (row.gy === 0 && row.academic_year_id) {
        const y = v.years.find((x) => x.id === row.academic_year_id);
        if (y) [key, bucket] = ['year', { slug: String(y.year), name: String(y.year), count: row.n }];
      } else if (row.gm === 0 && row.term_id) {
        const t = find(v.terms, row.term_id);
        if (t) [key, bucket] = ['term', { slug: t.slug, name: t.label, count: row.n }];
      } else if (row.gk === 0 && row.kind) {
        [key, bucket] = ['fileType', { slug: row.kind, name: row.kind.toUpperCase(), count: row.n }];
      }
      if (key && bucket) facets[key].push(bucket);
    }
    const order = (list: { slug: string }[]) => new Map(list.map((x, i) => [x.slug, i]));
    const classOrder = order(v.classes);
    facets.class.sort((a, b) => (classOrder.get(a.slug) ?? 0) - (classOrder.get(b.slug) ?? 0));
    facets.subject.sort((a, b) => b.count - a.count);
    facets.type.sort((a, b) => b.count - a.count);
    facets.year.sort((a, b) => Number(b.slug) - Number(a.slug));
    facets.term.sort((a, b) => a.slug.localeCompare(b.slug));
    facets.fileType.sort((a, b) => b.count - a.count);
    return facets;
  }

  private interpretation(parsed: ParsedQuery): Interpretation {
    const e = parsed.entities;
    return {
      class: e.class?.slug,
      subject: e.subject?.slug,
      type: e.type?.slug,
      year: e.year,
      term: e.term?.slug,
    };
  }

  async search(req: SearchRequest): Promise<ProviderSearchResult> {
    const started = performance.now();
    const v = await loadVocabulary(this.db);
    const phraseIndex = buildPhraseIndex(v);
    const filters = this.resolveFilters(req, v);
    const parsed = parseQuery(req.q, phraseIndex, expandNumberWords);
    const base = {
      normalizedQuery: parsed.normalized,
      interpreted: this.interpretation(parsed),
      didYouMean: null as string | null,
    };
    if (filters.impossible) {
      return { ...base, hits: [], total: 0, mode: 'browse', facets: emptyFacets(), tookMs: 0 };
    }

    // 1. Browse: nothing typed.
    if (!parsed.normalized) {
      const r = await this.runPlan(req, parsed, filters, { mode: 'browse', tsquery: null, hardEntities: false }, '');
      return {
        ...base,
        hits: r.hits,
        total: r.total,
        mode: 'browse',
        facets: await this.facets(r.where, r.qExpr, v),
        tookMs: Math.round(performance.now() - started),
      };
    }

    const queryText = parsed.normalized;
    const allTokens = [...parsed.terms, ...parsed.entityTokens];
    const plans: Plan[] = [
      // All free-text terms must match; recognised class/subject/type/year become filters.
      { mode: 'all', tsquery: buildTsquery(parsed.terms, '&') || null, hardEntities: true, highlight: buildTsquery(allTokens, '|') || null },
      // Relax: any word may match; entities only boost ranking.
      { mode: 'any', tsquery: buildTsquery(allTokens, '|') || null, hardEntities: false, highlight: buildTsquery(allTokens, '|') || null },
    ];

    for (const plan of plans) {
      if (plan.mode === 'all' && !plan.tsquery && !Object.keys(parsed.entities).length) continue;
      const r = await this.runPlan(req, parsed, filters, plan, queryText);
      if (r.total > 0) {
        const lexicon = buildCorrectionLexicon(v);
        return {
          ...base,
          didYouMean: plan.mode === 'any' ? correctQuery(parsed.normalized, lexicon) : null,
          hits: r.hits,
          total: r.total,
          mode: plan.mode,
          facets: await this.facets(r.where, r.qExpr, v),
          tookMs: Math.round(performance.now() - started),
        };
      }
    }

    // 3. Spelling correction, then trigram similarity as a last resort.
    const corrected = correctQuery(parsed.normalized, buildCorrectionLexicon(v));
    if (corrected) {
      const again = await this.search({ ...req, q: corrected });
      if (again.total > 0) {
        return { ...again, didYouMean: corrected, normalizedQuery: parsed.normalized, tookMs: Math.round(performance.now() - started) };
      }
    }
    const fuzzy = await this.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL pg_trgm.word_similarity_threshold = 0.45`);
      const provider = new PostgresSearchProvider(tx as unknown as Database, this.options);
      return provider.runPlan(req, parsed, filters, { mode: 'fuzzy', tsquery: null, hardEntities: false }, queryText);
    });
    return {
      ...base,
      didYouMean: corrected,
      hits: fuzzy.hits,
      total: fuzzy.total,
      mode: 'fuzzy',
      facets: fuzzy.total ? await this.facets(fuzzy.where, fuzzy.qExpr, v) : emptyFacets(),
      tookMs: Math.round(performance.now() - started),
    };
  }

  // ---------------------------------------------------------------- suggestions

  private async combos(v: Vocabulary): Promise<{ label: string; href: string; match: string; count: number; parts: number }[]> {
    const load = async () => {
      const rows = await this.db.execute<{ class_id: string | null; subject_id: string | null; resource_type_id: string | null; n: number }>(sql`
        SELECT class_id, subject_id, resource_type_id, count(*)::int AS n
        FROM resources WHERE status = 'published'
        GROUP BY GROUPING SETS ((class_id, subject_id, resource_type_id), (class_id, subject_id), (class_id, resource_type_id), (resource_type_id), (subject_id), (class_id))`);
      const out: { label: string; href: string; match: string; count: number; parts: number }[] = [];
      for (const r of rows) {
        const c = v.classes.find((x) => x.id === r.class_id);
        const s = v.subjects.find((x) => x.id === r.subject_id);
        const t = v.types.find((x) => x.id === r.resource_type_id);
        if (r.class_id && !c) continue;
        if (r.subject_id && !s) continue;
        if (r.resource_type_id && !t) continue;
        if (!c && !s && !t) continue;
        const label = [c?.label, s?.label, t?.label].filter(Boolean).join(' ');
        let href: string;
        if (c && s && t) href = `/${c.slug}/${s.slug}/${t.slug}`;
        else if (c && s) href = `/${c.slug}/${s.slug}`;
        else if (c && t) href = `/${c.slug}/${t.slug}`;
        else if (c) href = `/classes/${c.slug}`;
        else if (s && t) href = `/subjects/${s.slug}/${t.slug}`;
        else if (s) href = `/subjects/${s.slug}`;
        else href = `/${t!.slug}`;
        const match = normalizeQuery([label, ...(c?.phrases ?? []), ...(s?.phrases ?? []), ...(t?.phrases ?? [])].join(' '));
        out.push({ label, href, match, count: r.n, parts: [c, s, t].filter(Boolean).length });
      }
      return out;
    };
    return this.options.cache ? this.options.cache.wrap('suggest', 'combos', 600, load) : load();
  }

  async suggest(q: string, limit = 8): Promise<Suggestion[]> {
    const normalized = expandNumberWords(normalizeQuery(q));
    if (!normalized) return [];
    const compute = async (): Promise<Suggestion[]> => {
      const v = await loadVocabulary(this.db);
      const tokens = normalized.split(' ');
      const out: Suggestion[] = [];
      const seen = new Set<string>();
      const push = (s: Suggestion) => {
        const k = s.text.toLowerCase();
        if (seen.has(k) || out.length >= limit) return;
        seen.add(k);
        out.push(s);
      };

      // Landing-page combinations such as "P6 Science Past Papers".
      const combos = await this.combos(v);
      const matching = combos
        .filter((c) => {
          const words = c.match.split(' ');
          return tokens.every((tok) => words.some((w) => w.startsWith(tok)));
        })
        .sort((a, b) => {
          // Prefer combinations whose size matches how specific the query is.
          const want = Math.min(3, tokens.length + 1);
          const da = Math.abs(a.parts - want);
          const db = Math.abs(b.parts - want);
          return da - db || b.count - a.count || a.label.length - b.label.length;
        });
      for (const c of matching.slice(0, Math.ceil(limit * 0.6))) push({ text: c.label, href: c.href, kind: 'landing' });

      // Matching resource titles (prefix full-text, then trigram).
      const tsq = buildTsquery(tokens, '&');
      if (tsq) {
        const rows = await this.db.execute<{ title: string; slug: string }>(sql`
          SELECT title, slug FROM resources
          WHERE status = 'published' AND (search_vector @@ to_tsquery('edushare', ${tsq}) OR lower(title) % ${normalized})
          ORDER BY (search_vector @@ to_tsquery('edushare', ${tsq})) DESC, similarity(lower(title), ${normalized}) DESC, download_count DESC
          LIMIT ${limit}`);
        for (const r of rows) push({ text: r.title, href: `/resources/${r.slug}`, kind: 'resource' });
      }

      // Popular past searches that returned results.
      const popular = await this.db.execute<{ normalized: string }>(sql`
        SELECT normalized FROM search_queries
        WHERE created_at > now() - interval '30 days' AND results_count > 0 AND normalized LIKE ${`${normalized.replace(/[%_]/g, '')}%`}
        GROUP BY normalized ORDER BY count(*) DESC LIMIT 3`);
      for (const p of popular) push({ text: p.normalized, href: `/search?q=${encodeURIComponent(p.normalized)}`, kind: 'query' });
      return out;
    };
    return this.options.cache ? this.options.cache.wrap('suggest', `${limit}:${normalized}`, 600, compute) : compute();
  }
}
