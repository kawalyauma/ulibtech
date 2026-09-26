import { truncate } from '@edushare/shared';

export interface ResourceSeoInput {
  title: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  shortDescription?: string | null;
  description?: string | null;
  className?: string | null;
  subjectName?: string | null;
  typeName?: string | null;
  year?: number | null;
  termName?: string | null;
  fileLabel?: string | null;
  pageCount?: number | null;
}

/** Title for the <title> tag, without the site-name suffix (added by the layout template). */
export function resourceSeoTitle(r: ResourceSeoInput): string {
  if (r.seoTitle) return r.seoTitle;
  const base = r.title;
  const extra =
    r.typeName && !base.toLowerCase().includes(r.typeName.toLowerCase()) ? ` – ${r.typeName}` : '';
  return truncate(`${base}${extra}`, 60);
}

export function resourceSeoDescription(r: ResourceSeoInput): string {
  if (r.seoDescription) return r.seoDescription;
  const lead = r.shortDescription || r.description;
  const context = [
    r.className,
    r.subjectName,
    r.typeName,
    r.termName,
    r.year ? String(r.year) : null,
  ]
    .filter(Boolean)
    .join(' ');
  const file = r.fileLabel ? `${r.fileLabel}${r.pageCount ? `, ${r.pageCount} pages` : ''}` : null;
  const parts = [
    lead
      ? truncate(lead.replace(/\s+/g, ' '), 110)
      : `Download ${r.title}${context ? ` for ${context}` : ''}.`,
    `Free download${file ? ` (${file})` : ''} – no account needed.`,
  ];
  return truncate(parts.join(' '), 160);
}

export interface LandingContext {
  className?: string | null;
  classLongName?: string | null;
  subjectName?: string | null;
  typePlural?: string | null;
  year?: number | null;
  levelName?: string | null;
  topicName?: string | null;
  count?: number;
}

/** "P6 Science Past Papers 2026" style headings for classification landing pages. */
export function landingHeading(ctx: LandingContext): string {
  const parts = [
    ctx.className,
    ctx.subjectName,
    ctx.typePlural ?? (ctx.className || ctx.subjectName ? 'Resources' : null),
    ctx.year ? String(ctx.year) : null,
  ];
  const h = parts.filter(Boolean).join(' ');
  if (ctx.topicName) return `${ctx.topicName}${h ? ` – ${h}` : ''}`;
  return h || 'Educational Resources';
}

export function landingTitle(ctx: LandingContext): string {
  const heading = landingHeading(ctx);
  return truncate(`${heading} – Free Download`, 60);
}

export function landingDescription(ctx: LandingContext): string {
  const what = (
    ctx.typePlural ?? 'notes, past papers, schemes of work and lesson plans'
  ).toLowerCase();
  const who = [ctx.classLongName ?? ctx.className, ctx.subjectName].filter(Boolean).join(' ');
  const year = ctx.year ? ` for ${ctx.year}` : '';
  const count = ctx.count ? `${ctx.count} ` : '';
  return truncate(
    `Download ${count}free ${who ? `${who} ` : ''}${what}${year}. Preview online and download instantly – no login, no payment. Updated regularly for Ugandan schools.`,
    160,
  );
}

export function landingIntro(ctx: LandingContext): string {
  const heading = landingHeading(ctx);
  const audience =
    ctx.typePlural && /scheme|lesson plan|teacher/i.test(ctx.typePlural)
      ? 'teachers'
      : 'learners, teachers and parents';
  return `Browse ${heading.toLowerCase().startsWith('p') || heading.toLowerCase().startsWith('s') ? '' : 'our '}${heading} collection. Every resource is free to preview and download without creating an account, and is organised so ${audience} can quickly find what they need. Use the filters to narrow down by term, year or topic.`;
}
