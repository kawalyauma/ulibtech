import { Suspense } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, CalendarDays, Download, Eye, FileText, Share2 } from 'lucide-react';
import type { ResourceDetail } from '@edushare/shared';
import { formatDate, formatFileSize, pluralize } from '@edushare/shared';
import { learningResourceJsonLd, resourceSeoDescription, resourceSeoTitle } from '@edushare/seo';
import { Badge } from '@edushare/ui';
import { getRelated, getResource } from '@/lib/api';
import { absoluteUrl, SITE_NAME, SITE_URL } from '@/lib/config';
import { Breadcrumbs, type Crumb } from '@/components/breadcrumbs';
import { JsonLd } from '@/components/json-ld';
import { ResourceThumb } from '@/components/resource-thumb';
import { ResourceGrid } from '@/components/resource-card';
import { ShareButtons } from '@/components/share-buttons';
import { PdfPreview } from '@/components/pdf-preview';
import { RelatedClickTracker, ViewTracker } from '@/components/trackers';
import { Section } from '@/components/section';
import { FileMissingNotice } from '@/components/file-missing-notice';

export const revalidate = 300;
export const dynamicParams = true;
export function generateStaticParams() {
  // Rendered on first request, then cached (ISR) and revalidated on content changes.
  return [];
}

type Props = { params: Promise<{ slug: string }> };

function seoInput(r: ResourceDetail) {
  return {
    title: r.title,
    seoTitle: r.seoTitle,
    seoDescription: r.seoDescription,
    shortDescription: r.shortDescription,
    description: r.description,
    className: r.class?.shortName ?? r.class?.name,
    subjectName: r.subject?.name,
    typeName: r.resourceType?.name,
    year: r.academicYear?.year,
    termName: r.term?.name,
    fileLabel: r.fileDetail?.label,
    pageCount: r.fileDetail?.pageCount,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const lookup = await getResource(slug).catch(() => null);
  if (!lookup || !('resource' in lookup))
    return { title: 'Resource not found', robots: { index: false } };
  const r = lookup.resource;
  const title = resourceSeoTitle(seoInput(r));
  const description = resourceSeoDescription(seoInput(r));
  const canonical = r.canonicalUrl ?? `/resources/${r.slug}`;
  return {
    title,
    description,
    keywords: [...r.keywords, ...r.tags.map((t) => t.name)].slice(0, 20),
    alternates: { canonical },
    openGraph: {
      type: 'article',
      title: r.title,
      description,
      url: absoluteUrl(`/resources/${r.slug}`),
      siteName: SITE_NAME,
      publishedTime: r.publishedAt ?? undefined,
      modifiedTime: r.updatedAt,
    },
    twitter: { card: 'summary_large_image', title: r.title, description },
  };
}

function breadcrumbsFor(r: ResourceDetail): Crumb[] {
  const crumbs: Crumb[] = [{ name: 'Home', path: '/' }];
  if (r.class?.level)
    crumbs.push({ name: r.class.level.name, path: `/classes#${r.class.level.slug}` });
  if (r.class)
    crumbs.push({ name: r.class.shortName ?? r.class.name, path: `/classes/${r.class.slug}` });
  if (r.class && r.subject)
    crumbs.push({ name: r.subject.name, path: `/${r.class.slug}/${r.subject.slug}` });
  else if (r.subject) crumbs.push({ name: r.subject.name, path: `/subjects/${r.subject.slug}` });
  if (r.class && r.subject && r.resourceType) {
    crumbs.push({
      name: r.resourceType.pluralName,
      path: `/${r.class.slug}/${r.subject.slug}/${r.resourceType.slug}`,
    });
    if (r.academicYear)
      crumbs.push({
        name: String(r.academicYear.year),
        path: `/${r.class.slug}/${r.subject.slug}/${r.resourceType.slug}/${r.academicYear.year}`,
      });
  } else if (r.resourceType) {
    crumbs.push({ name: r.resourceType.pluralName, path: `/${r.resourceType.slug}` });
  }
  crumbs.push({ name: r.title, path: `/resources/${r.slug}` });
  return crumbs;
}

export default async function ResourcePage({ params }: Props) {
  const { slug } = await params;
  const lookup = await getResource(slug);
  if (!lookup) notFound();
  if ('redirect' in lookup) permanentRedirect(`/resources/${lookup.redirect}`);
  if ('unavailable' in lookup) return <Unavailable title={lookup.unavailable} />;

  const r = lookup.resource;
  const related = await getRelated(r.slug).catch(() => null);
  const url = absoluteUrl(`/resources/${r.slug}`);
  const description = resourceSeoDescription(seoInput(r));
  const fileMissing = !r.fileAvailable;
  const f = r.fileDetail;
  const largestThumb = r.thumbnail?.variants
    .filter((v) => v.format === 'webp')
    .sort((a, b) => b.width - a.width)[0];

  const details: [string, React.ReactNode][] = [
    [
      'Class',
      r.class ? (
        <Link href={`/classes/${r.class.slug}`} className="text-primary hover:underline">
          {r.class.name}
        </Link>
      ) : null,
    ],
    [
      'Subject',
      r.subject ? (
        <Link
          href={r.class ? `/${r.class.slug}/${r.subject.slug}` : `/subjects/${r.subject.slug}`}
          className="text-primary hover:underline"
        >
          {r.subject.name}
        </Link>
      ) : null,
    ],
    [
      'Resource type',
      r.resourceType ? (
        <Link href={`/${r.resourceType.slug}`} className="text-primary hover:underline">
          {r.resourceType.name}
        </Link>
      ) : null,
    ],
    ['Year', r.academicYear?.year ?? null],
    ['Term', r.term?.name ?? null],
    [
      'Topic',
      r.topic ? (
        <Link href={`/topics/${r.topic.slug}`} className="text-primary hover:underline">
          {r.topic.name}
        </Link>
      ) : (
        r.topicText
      ),
    ],
    ['Subtopic', r.subtopic?.name ?? r.subtopicText],
    ['Curriculum', r.curriculum?.name ?? null],
    ['Author / source', r.author],
    ['Publisher', r.publisher],
    ['File type', f ? `${f.label} (.${f.extension})` : null],
    ['File size', f ? formatFileSize(f.sizeBytes) : null],
    ['Pages', f?.pageCount ?? null],
    ['Uploaded', formatDate(r.publishedAt ?? r.createdAt)],
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
      <Breadcrumbs items={breadcrumbsFor(r)} />
      <JsonLd
        data={learningResourceJsonLd({
          name: r.title,
          description,
          url,
          downloadUrl: absoluteUrl(`/download/${r.slug}`),
          image: largestThumb ? absoluteUrl(largestThumb.url) : null,
          datePublished: r.publishedAt,
          dateModified: r.updatedAt,
          educationalLevel: r.class?.name,
          about: r.subject?.name,
          learningResourceType: r.resourceType?.name,
          encodingFormat: f?.mimeType,
          contentSize: f ? formatFileSize(f.sizeBytes) : null,
          numberOfPages: f?.pageCount,
          keywords: [...r.keywords, ...r.tags.map((t) => t.name)],
          author: r.author,
          publisher: { name: SITE_NAME, url: SITE_URL },
          downloads: r.downloadCount,
        })}
      />
      <ViewTracker resourceId={r.id} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <article className="flex min-w-0 flex-col gap-5">
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {r.class ? (
                <Badge variant="secondary">{r.class.shortName ?? r.class.name}</Badge>
              ) : null}
              {r.subject ? <Badge variant="secondary">{r.subject.name}</Badge> : null}
              {r.resourceType ? <Badge variant="outline">{r.resourceType.name}</Badge> : null}
              {r.term ? <Badge variant="outline">{r.term.name}</Badge> : null}
              {r.academicYear ? <Badge variant="outline">{r.academicYear.year}</Badge> : null}
            </div>
            <h1 className="text-2xl leading-tight font-bold tracking-tight sm:text-3xl">
              {r.title}
            </h1>
            <p className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1">
                <Eye className="size-4" aria-hidden="true" /> {pluralize(r.viewCount, 'view')}
              </span>
              <span className="inline-flex items-center gap-1">
                <Download className="size-4" aria-hidden="true" />{' '}
                {pluralize(r.downloadCount, 'download')}
              </span>
              <span className="inline-flex items-center gap-1">
                <Share2 className="size-4" aria-hidden="true" /> {pluralize(r.shareCount, 'share')}
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-4" aria-hidden="true" />{' '}
                {formatDate(r.publishedAt ?? r.createdAt)}
              </span>
            </p>
          </header>

          <Suspense fallback={null}>
            <FileMissingNotice force={fileMissing} />
          </Suspense>

          {/* Mobile download button near the top for quick access. */}
          {!fileMissing ? (
            <DownloadButton
              slug={r.slug}
              label={f?.label}
              size={f?.sizeBytes}
              className="lg:hidden"
            />
          ) : null}

          <div className="grid gap-5 sm:grid-cols-[200px_minmax(0,1fr)]">
            <div className="mx-auto w-40 overflow-hidden rounded-lg border shadow-sm sm:w-full">
              <ResourceThumb
                thumbnail={r.thumbnail}
                title={r.title}
                sizes="(min-width: 640px) 200px, 160px"
                priority
              />
            </div>
            <div className="flex flex-col gap-3">
              {r.description ? (
                <div className="text-base leading-relaxed whitespace-pre-line">{r.description}</div>
              ) : (
                <p className="text-muted-foreground">{description}</p>
              )}
              {r.tags.length ? (
                <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
                  {r.tags.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/search?q=${encodeURIComponent(t.name)}`}
                        className="bg-muted hover:bg-secondary rounded-full px-2.5 py-1 text-xs"
                      >
                        #{t.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          {!fileMissing && f?.previewable === 'pdf' ? (
            <PdfPreview
              url={`/api/files/${r.slug}/preview`}
              pageCount={f.pageCount}
              title={r.title}
            />
          ) : null}
          {!fileMissing && f?.previewable === 'image' ? (
            <img
              src={`/api/files/${r.slug}/preview`}
              alt={r.title}
              loading="lazy"
              className="w-full rounded-xl border"
            />
          ) : null}
          {!f?.previewable && f ? (
            <p className="bg-muted/40 text-muted-foreground flex items-center gap-2 rounded-xl border p-4 text-sm">
              <FileText className="size-5" aria-hidden="true" /> Online preview isn’t available for{' '}
              {f.label} files. Download the file to open it.
            </p>
          ) : null}

          <section aria-labelledby="details-heading" className="bg-card rounded-xl border">
            <h2 id="details-heading" className="border-b px-4 py-3 font-semibold">
              Resource details
            </h2>
            <dl className="grid grid-cols-1 text-sm sm:grid-cols-2">
              {details
                .filter(([, v]) => v !== null && v !== undefined && v !== '')
                .map(([k, v]) => (
                  <div
                    key={k}
                    className="flex justify-between gap-4 border-b px-4 py-2.5 last:border-0 sm:[&:nth-last-child(2)]:border-0"
                  >
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-right font-medium">{v}</dd>
                  </div>
                ))}
            </dl>
          </section>
        </article>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-32 lg:self-start">
          {!fileMissing ? (
            <DownloadButton
              slug={r.slug}
              label={f?.label}
              size={f?.sizeBytes}
              className="hidden lg:flex"
            />
          ) : null}
          <div className="bg-card rounded-xl border p-4">
            <ShareButtons resourceId={r.id} url={url} title={r.title} text={description} />
          </div>
          <p className="bg-secondary/60 text-secondary-foreground rounded-xl p-4 text-sm">
            Free for teachers, learners and parents. No login, no payment and no email required.
          </p>
        </aside>
      </div>

      {related?.groups.length ? (
        <RelatedClickTracker from={r.slug}>
          <div className="mt-12 flex flex-col gap-10">
            {related.groups.map((g) => (
              <Section key={g.title} title={g.title} href={g.href}>
                <ResourceGrid items={g.items} />
              </Section>
            ))}
          </div>
        </RelatedClickTracker>
      ) : null}
    </div>
  );
}

function DownloadButton({
  slug,
  label,
  size,
  className = '',
}: {
  slug: string;
  label?: string;
  size?: number;
  className?: string;
}) {
  return (
    <a
      href={`/download/${slug}`}
      rel="nofollow"
      data-testid="download-button"
      className={`bg-primary text-primary-foreground hover:bg-primary/90 flex h-14 w-full flex-col items-center justify-center rounded-xl shadow-md ${className}`}
    >
      <span className="inline-flex items-center gap-2 text-lg font-bold">
        <Download className="size-5" aria-hidden="true" /> Download Free
      </span>
      {label ? (
        <span className="text-xs opacity-90">
          {[label, size ? formatFileSize(size) : null].filter(Boolean).join(' • ')}
        </span>
      ) : null}
    </a>
  );
}

function Unavailable({ title }: { title: string }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-20 text-center">
      <meta name="robots" content="noindex" />
      <AlertTriangle className="text-warning size-10" aria-hidden="true" />
      <h1 className="text-2xl font-bold">Resource unavailable</h1>
      <p className="text-muted-foreground">
        “{title}” is no longer available. It may have been replaced by a newer version.
      </p>
      <Link
        href={`/search?q=${encodeURIComponent(title)}`}
        className="bg-primary text-primary-foreground inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold"
      >
        Find similar resources
      </Link>
    </div>
  );
}
