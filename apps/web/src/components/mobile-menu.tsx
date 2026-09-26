'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@edushare/ui/client';
import { useState } from 'react';

export function MobileMenu({ items }: { items: { label: string; href: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="-ml-2 rounded-md p-2 hover:bg-muted md:hidden" aria-label="Open menu">
        <Menu className="size-5" aria-hidden="true" />
      </SheetTrigger>
      <SheetContent side="left" aria-describedby={undefined}>
        <SheetTitle className="text-lg font-semibold">Browse</SheetTitle>
        <nav aria-label="Mobile">
          <ul className="flex flex-col">
            {[{ label: 'Home', href: '/' }, ...items, { label: 'Collections', href: '/collections' }, { label: 'About', href: '/about' }].map((i) => (
              <li key={i.href}>
                <Link href={i.href} onClick={() => setOpen(false)} className="flex h-12 items-center rounded-md px-3 text-base hover:bg-muted">
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
