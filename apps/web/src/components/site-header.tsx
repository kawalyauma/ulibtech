import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { SITE_NAME } from '@/lib/config';
import { SearchBox } from './search-box';
import { MobileMenu } from './mobile-menu';

export const PRIMARY_NAV = [
  { label: 'Classes', href: '/classes' },
  { label: 'Subjects', href: '/subjects' },
  { label: 'Past Papers', href: '/past-papers' },
  { label: 'Notes', href: '/notes' },
  { label: 'Schemes', href: '/schemes-of-work' },
  { label: 'Lesson Plans', href: '/lesson-plans' },
  { label: 'More Resources', href: '/search' },
];

export function SiteHeader({ showSearch = true }: { showSearch?: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
        <MobileMenu items={PRIMARY_NAV} />
        <Link href="/" className="flex shrink-0 items-center gap-2 font-bold tracking-tight" aria-label={`${SITE_NAME} home`}>
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookOpen className="size-4.5" aria-hidden="true" />
          </span>
          <span className="hidden text-base sm:inline">{SITE_NAME}</span>
        </Link>
        {showSearch ? <SearchBox className="ml-auto hidden max-w-md md:block" /> : <div className="ml-auto" />}
        <Link href="/search" className="ml-auto inline-flex h-9 items-center rounded-full border px-3 text-sm text-muted-foreground md:hidden" aria-label="Search resources">
          Search…
        </Link>
      </div>
      <nav aria-label="Main" className="hidden border-t md:block">
        <ul className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 text-sm">
          <li>
            <Link href="/" className="inline-flex h-10 items-center rounded-md px-3 hover:bg-muted">
              Home
            </Link>
          </li>
          {PRIMARY_NAV.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="inline-flex h-10 items-center rounded-md px-3 whitespace-nowrap hover:bg-muted">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
