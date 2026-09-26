'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { Button } from '@edushare/ui';
import { api, errorMessage } from '@/lib/api';
import { PageHeader } from '@/components/shell';
import { useSession } from '@/components/providers';
import {
  ActivityChart,
  ErrorState,
  RankedList,
  ReportSkeleton,
  StatCard,
  siteUrl,
  useReport,
} from '@/components/report';

export default function DashboardPage() {
  const { can } = useSession();
  const report = useReport(30);
  const queues = useQuery({
    queryKey: ['queues'],
    queryFn: () =>
      api.get<{ items: { name: string; waiting: number; active: number; failed: number }[] }>(
        '/system/queues',
      ),
    enabled: can('settings.manage'),
    refetchInterval: 15_000,
  });
  const r = report.data;
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Today’s activity and what visitors are looking for."
        actions={
          can('resources.create') ? (
            <Button asChild>
              <Link href="/resources/new">
                <Upload className="size-4" aria-hidden="true" /> Upload resource
              </Link>
            </Button>
          ) : null
        }
      />
      {report.isLoading ? <ReportSkeleton /> : null}
      {report.error ? (
        <ErrorState message={errorMessage(report.error)} retry={() => report.refetch()} />
      ) : null}
      {r ? (
        <div className="flex flex-col gap-6">
          <section aria-label="Today" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Resource views today"
              value={r.today.views}
              hint={`${r.today.visitors} visitors`}
            />
            <StatCard label="Downloads today" value={r.today.downloads} />
            <StatCard
              label="Searches today"
              value={r.today.searches}
              hint={`${r.today.noResultSearches} with no results`}
            />
            <StatCard label="Shares today" value={r.today.shares} />
          </section>
          <section aria-label="Library" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Published resources" value={r.totals.published} />
            <StatCard label="Drafts & in review" value={r.totals.drafts} />
            <StatCard label="Processing" value={r.totals.processing} />
            <StatCard label="Failed / missing files" value={r.totals.failed} />
          </section>
          <ActivityChart series={r.series} />
          <div className="grid gap-4 lg:grid-cols-2">
            <RankedList
              title="Most downloaded (30 days)"
              rows={r.topDownloaded.map((x) => ({
                label: x.title,
                value: x.count,
                href: `${siteUrl}/resources/${x.slug}`,
              }))}
              empty="No downloads yet."
              href="/analytics"
            />
            <RankedList
              title="Most searched"
              rows={r.topSearches.map((x) => ({ label: x.query, value: x.count }))}
              empty="No searches yet."
              href="/analytics"
            />
            <RankedList
              title="No-result searches – upload these next"
              rows={r.noResultSearches.map((x) => ({ label: x.query, value: x.count }))}
              empty="Every search found something. 🎉"
              href="/analytics"
            />
            <RankedList
              title="Most viewed (30 days)"
              rows={r.topViewed.map((x) => ({
                label: x.title,
                value: x.count,
                href: `${siteUrl}/resources/${x.slug}`,
              }))}
              empty="No views yet."
            />
          </div>
          {queues.data?.items.length ? (
            <section aria-label="Background jobs" className="grid gap-4 sm:grid-cols-3">
              {queues.data.items.map((q) => (
                <StatCard
                  key={q.name}
                  label={`Queue: ${q.name}`}
                  value={q.waiting + q.active}
                  hint={`${q.active} active · ${q.failed} failed`}
                />
              ))}
            </section>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
