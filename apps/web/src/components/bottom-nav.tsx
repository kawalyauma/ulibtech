import Link from 'next/link';
import { FileText, GraduationCap, Home, NotebookPen, Search } from 'lucide-react';

const ITEMS = [
  { label: 'Home', href: '/', icon: Home },
  { label: 'Classes', href: '/classes', icon: GraduationCap },
  { label: 'Search', href: '/search', icon: Search },
  { label: 'Papers', href: '/past-papers', icon: FileText },
  { label: 'Notes', href: '/notes', icon: NotebookPen },
];

/** Thumb-friendly navigation for phones. */
export function BottomNav() {
  return (
    <nav
      aria-label="Quick"
      className="bg-background/95 fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {ITEMS.map(({ label, href, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="text-muted-foreground hover:text-foreground flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]"
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
