'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, FileText, Folder, Search, TrendingUp, X } from 'lucide-react';
import type { Suggestion } from '@edushare/shared';
import { cn } from '@edushare/ui';

const RECENT_KEY = 'es:recent-searches';

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 6) : [];
  } catch {
    return [];
  }
}

export function saveRecentSearch(q: string) {
  try {
    const next = [q, ...readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(
      0,
      6,
    );
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}

const cache = new Map<string, Suggestion[]>();

/**
 * Search input with debounced suggestions, recent searches and keyboard navigation.
 * Works without JavaScript as a plain GET form to /search.
 */
export function SearchBox({
  defaultValue = '',
  placeholder = 'Search notes, past papers, schemes, lesson plans...',
  size = 'default',
  autoFocus = false,
  className,
  trending = [],
}: {
  defaultValue?: string;
  placeholder?: string;
  size?: 'default' | 'lg';
  autoFocus?: boolean;
  className?: string;
  trending?: string[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [fetched, setFetched] = useState<{ key: string; items: Suggestion[] } | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const query = value.trim();
  const queryKey = query.toLowerCase();
  const items: Suggestion[] =
    query.length < 2
      ? []
      : (cache.get(queryKey) ?? (fetched?.key === queryKey ? fetched.items : []));

  useEffect(() => {
    const q = query;
    const key = queryKey;
    if (q.length < 2 || cache.has(key)) return;
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}&limit=8`, {
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { items: Suggestion[] };
        cache.set(key, data.items);
        setFetched({ key, items: data.items });
      } catch {
        /* aborted or offline */
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query, queryKey]);

  const showRecent = value.trim().length < 2;
  const options: {
    text: string;
    href: string;
    icon: 'recent' | 'trending' | Suggestion['kind'];
  }[] = showRecent
    ? [
        ...recent.map((r) => ({
          text: r,
          href: `/search?q=${encodeURIComponent(r)}`,
          icon: 'recent' as const,
        })),
        ...trending
          .filter((t) => !recent.includes(t))
          .slice(0, 5)
          .map((t) => ({
            text: t,
            href: `/search?q=${encodeURIComponent(t)}`,
            icon: 'trending' as const,
          })),
      ]
    : items.map((s) => ({ text: s.text, href: s.href, icon: s.kind }));

  const go = (href: string, text?: string) => {
    if (text) saveRecentSearch(text);
    setOpen(false);
    inputRef.current?.blur();
    router.push(href);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const opt = options[active];
    if (open && opt)
      return go(
        opt.href,
        opt.icon === 'query' || opt.icon === 'recent' || opt.icon === 'trending'
          ? opt.text
          : undefined,
      );
    const q = value.trim();
    if (!q) return;
    go(`/search?q=${encodeURIComponent(q)}`, q);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) setOpen(true);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (options.length ? (a + 1) % options.length : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (options.length ? (a - 1 + options.length) % options.length : -1));
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  const Icon = ({ kind }: { kind: string }) => {
    const cls = 'size-4 shrink-0 text-muted-foreground';
    if (kind === 'recent') return <Clock className={cls} aria-hidden="true" />;
    if (kind === 'trending' || kind === 'query')
      return <TrendingUp className={cls} aria-hidden="true" />;
    if (kind === 'resource') return <FileText className={cls} aria-hidden="true" />;
    return <Folder className={cls} aria-hidden="true" />;
  };

  const expanded = open && options.length > 0;
  return (
    <form
      action="/search"
      method="get"
      role="search"
      onSubmit={submit}
      className={cn('relative w-full', className)}
    >
      <label htmlFor={`${listId}-input`} className="sr-only">
        Search resources
      </label>
      <div className="relative">
        <Search
          className={cn(
            'text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2',
            size === 'lg' ? 'size-5' : 'size-4',
          )}
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          id={`${listId}-input`}
          name="q"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => {
            setRecent(readRecent());
            setOpen(true);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={expanded}
          aria-controls={`${listId}-list`}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-opt-${active}` : undefined}
          className={cn(
            'border-input bg-card text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-ring/30 w-full rounded-full border pr-24 shadow-sm outline-none focus:ring-2 [&::-webkit-search-cancel-button]:hidden',
            size === 'lg' ? 'h-14 pl-11 text-base sm:text-lg' : 'h-11 pl-10 text-base sm:text-sm',
          )}
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              setValue('');
              inputRef.current?.focus();
            }}
            className="text-muted-foreground hover:bg-muted absolute top-1/2 right-[4.75rem] -translate-y-1/2 rounded-full p-1.5"
            aria-label="Clear search"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="submit"
          className={cn(
            'bg-primary text-primary-foreground hover:bg-primary/90 absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full px-4 font-semibold',
            size === 'lg' ? 'h-11 text-base' : 'h-8 text-sm',
          )}
        >
          Search
        </button>
      </div>
      {expanded ? (
        <ul
          id={`${listId}-list`}
          role="listbox"
          className="bg-popover text-popover-foreground absolute inset-x-0 top-full z-40 mt-2 max-h-[60vh] overflow-y-auto rounded-xl border p-1 shadow-lg"
        >
          {showRecent && recent.length ? (
            <li className="text-muted-foreground px-3 pt-2 pb-1 text-xs font-medium">
              Recent searches
            </li>
          ) : null}
          {options.map((o, i) => (
            <li
              key={`${o.icon}-${o.text}`}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                go(o.href, o.icon === 'resource' || o.icon === 'landing' ? undefined : o.text);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm',
                i === active && 'bg-muted',
              )}
            >
              <Icon kind={o.icon} />
              <span className="truncate">{o.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
