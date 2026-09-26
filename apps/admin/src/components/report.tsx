'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { formatNumber } from '@edushare/shared';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DashboardCardSkeleton,
  Skeleton,
  cn,
} from '@edushare/ui';
import { api } from '@/lib/api';
import { BarChart } from './bar-chart';

export interface DashboardReport {
  today: {
    views: number;
    downloads: number;
    searches: number;
    shares: number;
    noResultSearches: number;
    visitors: number;
  };
  totals: {
    resources: number;
    published: number;
    drafts: number;
    processing: number;
    failed: number;
  };
  series: { day: string; views: number; downloads: number; searches: number; shares: number }[];
  topDownloaded: { id: string; title: string; slug: string; count: number }[];
  topViewed: { id: string; title: string; slug: string; count: number }[];
  topSearches: { query: string; count: number; avgResults: number }[];
  noResultSearches: { query: string; count: number; lastSearchedAt: string }[];
  topSubjects: { name: string; count: number }[];
  topClasses: { name: string; count: number }[];
  topTypes: { name: string; count: number }[];
  shareChannels: { channel: string; count: number }[];
  devices: { device: string; count: number }[];
}

export function useReport(days: number) {
  return useQuery({
    queryKey: ['report', days],
    queryFn: () => api.get<DashboardReport>(`/analytics/dashboard?days=${days}`),
    refetchInterval: 60_000,
  });
}

export function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card className="flex flex-col gap-1 p-5">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="text-3xl font-bold tabular-nums">{formatNumber(value)}</p>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </Card>
  );
}

export function RankedList({
  title,
  rows,
  empty,
  href,
}: {
  title: string;
  rows: { label: string; value: number; href?: string }[];
  empty: string;
  href?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {href ? (
          <Link href={href} className="text-primary text-xs hover:underline">
            View all
          </Link>
        ) : null}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{empty}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <li key={`${r.label}-${i}`} className="flex flex-col gap-1 text-sm">
                <div className="flex justify-between gap-3">
                  {r.href ? (
                    <a
                      href={r.href}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate hover:underline"
                    >
                      {r.label}
                    </a>
                  ) : (
                    <span className="truncate">{r.label}</span>
                  )}
                  <span className="text-muted-foreground tabular-nums">
                    {formatNumber(r.value)}
                  </span>
                </div>
                <div className="bg-muted h-1.5 rounded-full" aria-hidden="true">
                  <div
                    className="bg-primary/70 h-full rounded-full"
                    style={{ width: `${(r.value / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

const METRICS = ['downloads', 'views', 'searches', 'shares'] as const;

export function ActivityChart({ series }: { series: DashboardReport['series'] }) {
  const [metric, setMetric] = useState<(typeof METRICS)[number]>('downloads');
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base capitalize">{metric} per day</CardTitle>
        <div role="tablist" aria-label="Metric" className="bg-muted flex gap-1 rounded-md p-0.5">
          {METRICS.map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={metric === m}
              onClick={() => setMetric(m)}
              className={cn(
                'rounded px-2.5 py-1 text-xs capitalize',
                metric === m ? 'bg-card font-medium shadow-xs' : 'text-muted-foreground',
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <BarChart data={series.map((s) => ({ day: s.day, value: s[metric] }))} label={metric} />
      </CardContent>
    </Card>
  );
}

export function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <DashboardCardSkeleton key={i} />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div
      role="alert"
      className="border-destructive/30 bg-destructive/5 flex items-center gap-3 rounded-xl border p-4 text-sm"
    >
      <AlertTriangle className="text-destructive size-5" aria-hidden="true" />
      <span className="flex-1">{message}</span>
      {retry ? (
        <button onClick={retry} className="bg-card rounded-md border px-3 py-1.5">
          Retry
        </button>
      ) : null}
    </div>
  );
}

export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
