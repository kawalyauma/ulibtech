import Link from 'next/link';
import { Download } from 'lucide-react';
import type { SearchHit } from '@edushare/shared';
import { formatCompactNumber, formatDate } from '@edushare/shared';
import { Highlight } from './highlight';
import { ResourceThumb } from './resource-thumb';
import { fileSummary, resourceContext } from './resource-card';

export function SearchResult({ hit, priority }: { hit: SearchHit; priority?: boolean }) {
  const context = [resourceContext(hit), hit.resourceType?.name, hit.term?.name, hit.academicYear?.year].filter(Boolean).join(' • ');
  const file = fileSummary(hit);
  return (
    <article className="group relative flex gap-3 rounded-xl border bg-card p-3 shadow-xs hover:shadow-md sm:gap-4">
      <div className="w-20 shrink-0 overflow-hidden rounded-md border sm:w-[100px]">
        <ResourceThumb thumbnail={hit.thumbnail} title={hit.title} sizes="100px" priority={priority} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {context ? <p className="truncate text-xs font-semibold tracking-wide text-primary uppercase">{context}</p> : null}
        <h2 className="text-base leading-snug font-semibold">
          <Link href={`/resources/${hit.slug}`} className="after:absolute after:inset-0 group-hover:underline" prefetch={false}>
            <Highlight text={hit.highlight.title} fallback={hit.title} />
          </Link>
        </h2>
        {hit.highlight.snippet || hit.shortDescription ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            <Highlight text={hit.highlight.snippet} fallback={hit.shortDescription ?? ''} />
          </p>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
          <p className="text-xs text-muted-foreground">
            {[file, `${formatCompactNumber(hit.downloadCount)} ${hit.downloadCount === 1 ? 'download' : 'downloads'}`, hit.publishedAt ? formatDate(hit.publishedAt) : null].filter(Boolean).join(' · ')}
          </p>
          <a
            href={`/download/${hit.slug}`}
            rel="nofollow"
            className="relative z-10 inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            aria-label={`Download ${hit.title}`}
          >
            <Download className="size-3.5" aria-hidden="true" /> Download free
          </a>
        </div>
      </div>
    </article>
  );
}
