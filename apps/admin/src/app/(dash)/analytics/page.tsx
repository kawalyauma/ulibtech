'use client';

import { useState } from 'react';
import { NativeSelect } from '@edushare/ui';
import { errorMessage } from '@/lib/api';
import { PageHeader } from '@/components/shell';
import {
  ActivityChart,
  ErrorState,
  RankedList,
  ReportSkeleton,
  siteUrl,
  useReport,
} from '@/components/report';

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const report = useReport(days);
  const r = report.data;
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Anonymous, first-party statistics. No visitor accounts or third-party trackers."
        actions={
          <label className="flex items-center gap-2 text-sm">
            Period
            <NativeSelect
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-36"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last 12 months</option>
            </NativeSelect>
          </label>
        }
      />
      {report.isLoading ? <ReportSkeleton /> : null}
      {report.error ? (
        <ErrorState message={errorMessage(report.error)} retry={() => report.refetch()} />
      ) : null}
      {r ? (
        <div className="flex flex-col gap-6">
          <ActivityChart series={r.series} />
          <div className="grid gap-4 lg:grid-cols-2">
            <RankedList
              title="Most downloaded"
              rows={r.topDownloaded.map((x) => ({
                label: x.title,
                value: x.count,
                href: `${siteUrl}/resources/${x.slug}`,
              }))}
              empty="No downloads in this period."
            />
            <RankedList
              title="Most viewed"
              rows={r.topViewed.map((x) => ({
                label: x.title,
                value: x.count,
                href: `${siteUrl}/resources/${x.slug}`,
              }))}
              empty="No views in this period."
            />
            <RankedList
              title="Top searches"
              rows={r.topSearches.map((x) => ({
                label: `${x.query} (≈${x.avgResults} results)`,
                value: x.count,
              }))}
              empty="No searches in this period."
            />
            <RankedList
              title="Searches with no results"
              rows={r.noResultSearches.map((x) => ({ label: x.query, value: x.count }))}
              empty="None — great coverage."
            />
            <RankedList
              title="Most searched subjects"
              rows={r.topSubjects.map((x) => ({ label: x.name, value: x.count }))}
              empty="No subject data yet."
            />
            <RankedList
              title="Most searched classes"
              rows={r.topClasses.map((x) => ({ label: x.name, value: x.count }))}
              empty="No class data yet."
            />
            <RankedList
              title="Popular resource types (downloads)"
              rows={r.topTypes.map((x) => ({ label: x.name, value: x.count }))}
              empty="No downloads yet."
            />
            <RankedList
              title="Shares by channel"
              rows={r.shareChannels.map((x) => ({ label: x.channel, value: x.count }))}
              empty="No shares yet."
            />
            <RankedList
              title="Views by device"
              rows={r.devices.map((x) => ({ label: x.device, value: x.count }))}
              empty="No views yet."
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
