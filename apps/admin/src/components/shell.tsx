'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  BarChart3,
  BookOpen,
  FileArchive,
  FileSpreadsheet,
  FileStack,
  FolderTree,
  Home,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  ScrollText,
  Search,
  Settings,
  Tags,
  Upload,
  Users,
} from 'lucide-react';
import type { Permission } from '@edushare/shared';
import { cn } from '@edushare/ui';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@edushare/ui/client';
import { api, setCsrfToken } from '@/lib/api';
import { useSession } from './providers';

type Item = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  perm?: Permission;
};
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Content',
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard },
      { label: 'Resources', href: '/resources', icon: FileStack, perm: 'resources.read' },
      { label: 'Upload', href: '/resources/new', icon: Upload, perm: 'resources.create' },
      { label: 'Bulk upload', href: '/uploads', icon: Upload, perm: 'resources.create' },
      {
        label: 'Zip import (AI)',
        href: '/uploads/zip',
        icon: FileArchive,
        perm: 'resources.create',
      },
      {
        label: 'Spreadsheet import',
        href: '/uploads/import',
        icon: FileSpreadsheet,
        perm: 'resources.create',
      },
      { label: 'Collections', href: '/collections', icon: Library, perm: 'resources.read' },
    ],
  },
  {
    title: 'Classification',
    items: [
      { label: 'Classes', href: '/taxonomy/classes', icon: FolderTree, perm: 'resources.read' },
      {
        label: 'School levels',
        href: '/taxonomy/levels',
        icon: FolderTree,
        perm: 'resources.read',
      },
      { label: 'Subjects', href: '/taxonomy/subjects', icon: FolderTree, perm: 'resources.read' },
      {
        label: 'Resource types',
        href: '/taxonomy/resource-types',
        icon: FolderTree,
        perm: 'resources.read',
      },
      {
        label: 'Academic years',
        href: '/taxonomy/academic-years',
        icon: FolderTree,
        perm: 'resources.read',
      },
      { label: 'Terms', href: '/taxonomy/terms', icon: FolderTree, perm: 'resources.read' },
      { label: 'Topics', href: '/taxonomy/topics', icon: FolderTree, perm: 'resources.read' },
      { label: 'Curricula', href: '/taxonomy/curricula', icon: FolderTree, perm: 'resources.read' },
      { label: 'Tags', href: '/taxonomy/tags', icon: Tags, perm: 'resources.read' },
    ],
  },
  {
    title: 'Insights & site',
    items: [
      { label: 'Analytics', href: '/analytics', icon: BarChart3, perm: 'analytics.read' },
      { label: 'SEO', href: '/seo', icon: Search, perm: 'seo.manage' },
      { label: 'Homepage', href: '/homepage', icon: Home, perm: 'homepage.manage' },
      { label: 'Users & roles', href: '/users', icon: Users, perm: 'admins.manage' },
      { label: 'Audit log', href: '/audit', icon: ScrollText, perm: 'audit.read' },
      { label: 'Settings', href: '/settings', icon: Settings, perm: 'settings.manage' },
    ],
  },
];

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can } = useSession();
  return (
    <nav aria-label="Admin" className="flex flex-col gap-5">
      {GROUPS.map((g) => (
        <div key={g.title} className="flex flex-col gap-0.5">
          <p className="text-muted-foreground px-3 pb-1 text-xs font-semibold tracking-wide uppercase">
            {g.title}
          </p>
          {g.items
            .filter((i) => !i.perm || can(i.perm))
            .map((i) => {
              // A more specific menu item (e.g. /uploads/import) wins over its parent.
              const exactElsewhere = GROUPS.some((grp) =>
                grp.items.some((x) => x.href !== i.href && x.href === pathname),
              );
              const active =
                i.href === '/'
                  ? pathname === '/'
                  : pathname === i.href || (!exactElsewhere && pathname.startsWith(`${i.href}/`));
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'hover:bg-muted flex h-9 items-center gap-2.5 rounded-md px-3 text-sm',
                    active && 'bg-secondary text-secondary-foreground font-medium',
                  )}
                >
                  <i.icon className="size-4" aria-hidden="true" />
                  {i.label}
                </Link>
              );
            })}
        </div>
      ))}
    </nav>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { admin } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const logout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setCsrfToken(null);
    router.replace('/login');
  };
  const brand = (
    <Link href="/" className="flex items-center gap-2 px-3 font-bold">
      <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
        <BookOpen className="size-4" aria-hidden="true" />
      </span>
      EduShare Admin
    </Link>
  );
  return (
    <div className="flex min-h-dvh">
      <aside className="bg-card sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r py-4 lg:flex">
        {brand}
        <div className="px-2">
          <Nav />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-card/95 sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4 backdrop-blur">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              className="hover:bg-muted -ml-2 rounded-md p-2 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="size-5" aria-hidden="true" />
            </SheetTrigger>
            <SheetContent side="left" aria-describedby={undefined}>
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              {brand}
              <Nav onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <a
              href={process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground hidden sm:inline"
            >
              View site ↗
            </a>
            <span className="text-muted-foreground hidden sm:inline">{admin?.name}</span>
            <button
              onClick={logout}
              className="hover:bg-muted inline-flex h-9 items-center gap-1.5 rounded-md border px-3"
            >
              <LogOut className="size-4" aria-hidden="true" /> Sign out
            </button>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="text-muted-foreground mt-1 text-sm">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
