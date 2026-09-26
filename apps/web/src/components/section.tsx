import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export function Section({
  title,
  href,
  children,
  id,
}: {
  title: string;
  href?: string | null;
  children: React.ReactNode;
  id?: string;
}) {
  const headingId = id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <h2 id={headingId} className="text-xl font-bold tracking-tight sm:text-2xl">
          {title}
        </h2>
        {href ? (
          <Link
            href={href}
            className="text-primary inline-flex shrink-0 items-center gap-1 text-sm font-medium hover:underline"
          >
            View all <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function PageContainer({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-6xl px-4 py-6 sm:py-8 ${className}`}>{children}</div>
  );
}

export function ChipLink({
  href,
  children,
  count,
}: {
  href: string;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="bg-card hover:border-primary hover:text-primary inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap shadow-xs"
    >
      {children}
      {count !== undefined ? <span className="text-muted-foreground text-xs">{count}</span> : null}
    </Link>
  );
}
