import { describe, expect, it } from 'vitest';
import {
  buildSitemapIndex,
  buildUrlset,
  landingHeading,
  learningResourceJsonLd,
  resourceSeoDescription,
  resourceSeoTitle,
  serializeJsonLd,
} from '../src';

describe('seo text', () => {
  it('builds resource titles and descriptions', () => {
    const r = { title: 'P6 Social Studies Term 2 Examination 2026', typeName: 'Past Paper', className: 'P6', subjectName: 'Social Studies', year: 2026, fileLabel: 'PDF', pageCount: 4 };
    expect(resourceSeoTitle(r)).toBe('P6 Social Studies Term 2 Examination 2026 – Past Paper');
    const d = resourceSeoDescription(r);
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d).toContain('Free download (PDF, 4 pages)');
  });
  it('builds landing headings', () => {
    expect(landingHeading({ className: 'P6', subjectName: 'Science', typePlural: 'Notes' })).toBe('P6 Science Notes');
    expect(landingHeading({ className: 'S4', subjectName: 'Chemistry', typePlural: 'Past Papers', year: 2026 })).toBe('S4 Chemistry Past Papers 2026');
    expect(landingHeading({ className: 'P7' })).toBe('P7 Resources');
  });
});

describe('json-ld', () => {
  it('marks resources as free learning resources and escapes safely', () => {
    const ld = learningResourceJsonLd({ name: 'x</script>', description: 'd', url: 'https://e/r', downloadUrl: 'https://e/d', publisher: { name: 'E', url: 'https://e' } });
    expect(ld.isAccessibleForFree).toBe(true);
    expect(serializeJsonLd(ld)).not.toContain('</script>');
  });
});

describe('sitemaps', () => {
  it('escapes urls and builds an index', () => {
    const xml = buildUrlset([{ loc: 'https://e.com/search?q=a&b', lastmod: '2026-01-01T00:00:00Z', priority: 0.8 }]);
    expect(xml).toContain('<loc>https://e.com/search?q=a&amp;b</loc>');
    expect(buildSitemapIndex([{ loc: 'https://e.com/sitemaps/resources-1.xml' }])).toContain('<sitemapindex');
  });
});
