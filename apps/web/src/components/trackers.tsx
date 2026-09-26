'use client';

import { useEffect } from 'react';

function send(body: Record<string, unknown>) {
  const payload = JSON.stringify(body);
  try {
    // Prefer fetch keepalive (JSON content type); sendBeacon as a fallback.
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-page-referrer': document.referrer.slice(0, 300) },
      body: payload,
      keepalive: true,
    }).catch(() => navigator.sendBeacon?.('/api/events', new Blob([payload], { type: 'application/json' })));
  } catch {
    /* ignore */
  }
}

export function trackEvent(type: string, data: { resourceId?: string; slug?: string; props?: Record<string, string | number | boolean> } = {}) {
  send({ type, ...data });
}

/** Records one anonymous view per page load (server de-duplicates repeat views). */
export function ViewTracker({ resourceId }: { resourceId: string }) {
  useEffect(() => {
    const t = setTimeout(() => trackEvent('resource_view', { resourceId }), 800);
    return () => clearTimeout(t);
  }, [resourceId]);
  return null;
}

/** Logs a search (and whether it returned results) for the admin analytics. */
export function SearchTracker({ q, results, filters }: { q: string; results: number; filters: Record<string, string> }) {
  const key = `${q}|${results}|${JSON.stringify(filters)}`;
  useEffect(() => {
    if (!q && Object.keys(filters).length === 0) return;
    trackEvent(results === 0 ? 'search_no_result' : 'search', { props: { q, results, ...filters } });
    if (Object.keys(filters).length) trackEvent('filter_use', { props: filters });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

/** Tracks clicks on related-resource links inside its children. */
export function RelatedClickTracker({ from, children }: { from: string; children: React.ReactNode }) {
  return (
    <div
      onClickCapture={(e) => {
        const a = (e.target as HTMLElement).closest('a[href^="/resources/"]');
        if (a) trackEvent('related_resource_click', { slug: from, props: { to: a.getAttribute('href') ?? '' } });
      }}
    >
      {children}
    </div>
  );
}
