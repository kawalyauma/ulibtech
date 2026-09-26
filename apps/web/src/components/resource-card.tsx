import Link from 'next/link';
import { Download, FileText } from 'lucide-react';
import type { ResourceCard as Card } from '@edushare/shared';
import { formatCompactNumber } from '@edushare/shared';
import { ResourceThumb } from './resource-thumb';

export function resourceContext(r: Pick<Card, 'class' | 'subject'>): string {
  return [r.class?.shortName ?? r.class?.name, r.subject?.name].filter(Boolean).join(' ');
}

export function fileSummary(r: Pick<Card, 'file'>): string | null {
  if (!r.file) return null;
  return [r.file.label, r.file.pageCount ? `${r.file.pageCount} ${r.file.pageCount === 1 ? 'page' : 'pages'}` : null].filter(Boolean).join(' • ');
}

export function ResourceCard({ resource, priority = false, trackRelated }: { resource: Card; priority?: boolean; trackRelated?: string }) {
  const context = resourceContext(resource);
  const file = fileSummary(resource);
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs transition-shadow hover:shadow-md">
      <Link
        href={`/resources/${resource.slug}`}
        className="flex flex-1 flex-col after:absolute after:inset-0"
        data-related={trackRelated}
        prefetch={false}
      >
        <ResourceThumb thumbnail={resource.thumbnail} title={resource.title} priority={priority} fileLabel={resource.file?.label} />
        <div className="flex flex-1 flex-col gap-1 p-3">
          {context ? <p className="text-xs font-semibold tracking-wide text-primary uppercase">{context}</p> : null}
          <h3 className="line-clamp-3 text-sm leading-snug font-semibold group-hover:underline">{resource.title}</h3>
          <p className="mt-auto flex flex-wrap items-center gap-x-2 pt-1 text-xs text-muted-foreground">
            {resource.resourceType ? <span>{resource.resourceType.name}</span> : null}
            {file ? (
              <span className="inline-flex items-center gap-1">
                <FileText className="size-3" aria-hidden="true" />
                {file}
              </span>
            ) : null}
          </p>
        </div>
      </Link>
      <div className="relative z-10 flex flex-col gap-2 border-t px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-muted-foreground">
          {formatCompactNumber(resource.downloadCount)} {resource.downloadCount === 1 ? 'download' : 'downloads'}
        </span>
        <a
          href={`/download/${resource.slug}`}
          className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 sm:h-8"
          aria-label={`Download ${resource.title}`}
          rel="nofollow"
        >
          <Download className="size-3.5" aria-hidden="true" />
          Download
        </a>
      </div>
    </article>
  );
}

export function ResourceGrid({ items, priorityCount = 0, trackRelated }: { items: Card[]; priorityCount?: number; trackRelated?: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {items.map((r, i) => (
        <ResourceCard key={r.id} resource={r} priority={i < priorityCount} trackRelated={trackRelated} />
      ))}
    </div>
  );
}
