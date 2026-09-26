import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { breadcrumbJsonLd } from '@edushare/seo';
import { absoluteUrl } from '@/lib/config';
import { JsonLd } from './json-ld';

export interface Crumb {
  name: string;
  path: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="text-muted-foreground mb-3 overflow-x-auto text-sm">
        <ol className="flex items-center gap-1 whitespace-nowrap">
          {items.map((c, i) => {
            const last = i === items.length - 1;
            return (
              <li key={`${c.path}-${i}`} className="flex items-center gap-1">
                {i > 0 ? <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" /> : null}
                {last ? (
                  <span
                    aria-current="page"
                    className="text-foreground max-w-[16rem] truncate font-medium"
                  >
                    {c.name}
                  </span>
                ) : (
                  <Link
                    href={c.path}
                    className="hover:text-foreground hover:underline"
                    prefetch={false}
                  >
                    {c.name}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <JsonLd
        data={breadcrumbJsonLd(items.map((c) => ({ name: c.name, url: absoluteUrl(c.path) })))}
      />
    </>
  );
}
