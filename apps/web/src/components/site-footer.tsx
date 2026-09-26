import Link from 'next/link';
import { SITE_NAME } from '@/lib/config';

export function SiteFooter({ note }: { note?: string | null }) {
  return (
    <footer className="bg-muted/40 mt-16 border-t pb-20 md:pb-0">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <p className="font-semibold">{SITE_NAME}</p>
          <p className="text-muted-foreground">
            {note ?? 'All resources are free to download. No account needed.'}
          </p>
        </div>
        <nav aria-label="Browse" className="flex flex-col gap-1.5">
          <p className="font-semibold">Browse</p>
          <Link href="/classes" className="text-muted-foreground hover:text-foreground">
            Classes
          </Link>
          <Link href="/subjects" className="text-muted-foreground hover:text-foreground">
            Subjects
          </Link>
          <Link href="/past-papers" className="text-muted-foreground hover:text-foreground">
            Past papers
          </Link>
          <Link href="/collections" className="text-muted-foreground hover:text-foreground">
            Collections
          </Link>
        </nav>
        <nav aria-label="About" className="flex flex-col gap-1.5">
          <p className="font-semibold">About</p>
          <Link href="/about" className="text-muted-foreground hover:text-foreground">
            About {SITE_NAME}
          </Link>
          <a href="/sitemap.xml" className="text-muted-foreground hover:text-foreground">
            Sitemap
          </a>
        </nav>
      </div>
      <p className="text-muted-foreground border-t py-4 text-center text-xs">
        © {new Date().getFullYear()} {SITE_NAME}. Free educational resources for Ugandan schools.
      </p>
    </footer>
  );
}
