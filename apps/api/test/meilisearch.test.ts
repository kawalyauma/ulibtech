/**
 * Runs the key search scenarios against a real Meilisearch server.
 * Skipped unless MEILI_TEST_HOST is set (e.g. http://127.0.0.1:7700 with MEILI_TEST_KEY).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootTestApp, makePdf } from './setup';

const host = process.env.MEILI_TEST_HOST;
const run = host ? describe : describe.skip;

run('MeilisearchProvider', () => {
  let t: Awaited<ReturnType<typeof bootTestApp>>;
  let slug = '';

  beforeAll(async () => {
    Object.assign(process.env, {
      SEARCH_PROVIDER: 'meilisearch',
      MEILI_HOST: host,
      MEILI_API_KEY: process.env.MEILI_TEST_KEY ?? '',
      MEILI_INDEX: `test_${Date.now()}`,
    });
    t = await bootTestApp();
    const tax = (await (await t.app.request('/api/taxonomy')).json()) as {
      levels: { classes: { id: string; slug: string }[] }[];
      subjects: { id: string; slug: string }[];
      types: { id: string; slug: string }[];
      years: { id: string; year: number }[];
    };
    const fd = new FormData();
    fd.set(
      'metadata',
      JSON.stringify({
        title: 'P6 Social Studies Term 2 Examination 2026',
        classId: tax.levels.flatMap((l) => l.classes).find((c) => c.slug === 'p6')!.id,
        subjectId: tax.subjects.find((s) => s.slug === 'social-studies')!.id,
        resourceTypeId: tax.types.find((x) => x.slug === 'past-papers')!.id,
        academicYearId: tax.years.find((y) => y.year === 2026)!.id,
      }),
    );
    fd.set(
      'file',
      new Blob([
        new Uint8Array(
          await makePdf(['Name the largest lake in Uganda.', 'Lake Victoria fishing activities.']),
        ),
      ]),
      'exam.pdf',
    );
    const res = (await (
      await t.app.request('/api/admin/resources', t.admin({ method: 'POST', body: fd }))
    ).json()) as { resource: { id: string; slug: string } };
    slug = res.resource.slug;
    await t.app.request(
      `/api/admin/resources/${res.resource.id}/publish`,
      t.admin({ method: 'POST' }),
    );
  });
  afterAll(async () => {
    delete process.env.SEARCH_PROVIDER;
    await t?.close();
  });

  const search = async (qs: string) =>
    (await (await t.app.request(`/api/search?${qs}`)).json()) as {
      total: number;
      mode: string;
      items: { slug: string; highlight: { title: string } }[];
      facets: { class: { slug: string; count: number }[] };
    };

  it('understands "P6 SST past paper" and returns facets', async () => {
    const r = await search('q=P6%20SST%20past%20paper');
    expect(r.total).toBe(1);
    expect(r.items[0]!.slug).toBe(slug);
    expect(r.facets.class[0]).toMatchObject({ slug: 'p6', count: 1 });
  });

  it('matches document text with typos and highlights titles', async () => {
    expect((await search('q=lake%20victorai')).items[0]?.slug).toBe(slug);
    const h = await search('q=social%20studies');
    expect(h.items[0]!.highlight.title).toContain('««Social');
  });

  it('filters and hides unpublished resources', async () => {
    expect((await search('class=p7')).total).toBe(0);
    expect((await search('class=p6&year=2026')).total).toBe(1);
  });
});
