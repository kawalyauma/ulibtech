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
  { label: 'Trending', href: '/trending' },
  { label: 'More Resources', href: '/search' },
];

export function SiteHeader({ showSearch = true }: { showSearch?: boolean }) {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
      <a
        href="#main"
        className="focus:bg-primary focus:text-primary-foreground sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
        <MobileMenu items={PRIMARY_NAV} />
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-bold tracking-tight"
          aria-label={`${SITE_NAME} home`}
        >
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
            <BookOpen className="size-4.5" aria-hidden="true" />
          </span>
          <span className="hidden text-base sm:inline">{SITE_NAME}</span>
        </Link>
        {showSearch ? (
          <SearchBox className="ml-auto hidden max-w-md md:block" />
        ) : (
          <div className="ml-auto" />
        )}
        <Link
          href="/search"
          className="text-muted-foreground ml-auto inline-flex h-9 items-center rounded-full border px-3 text-sm md:hidden"
          aria-label="Search resources"
        >
          Search…
        </Link>
      </div>
      <nav aria-label="Main" className="hidden border-t md:block">
        <ul className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 text-sm">
          <li>
            <Link href="/" className="hover:bg-muted inline-flex h-10 items-center rounded-md px-3">
              Home
            </Link>
          </li>
          {PRIMARY_NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="hover:bg-muted inline-flex h-10 items-center rounded-md px-3 whitespace-nowrap"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
