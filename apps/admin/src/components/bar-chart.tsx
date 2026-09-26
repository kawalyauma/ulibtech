'use client';

import { useState } from 'react';
import { formatNumber } from '@edushare/shared';

/**
 * Single-series daily bar chart. One series → no legend (the heading names it).
 * Thin bars with 4px rounded tops anchored to the baseline, 2px gaps, recessive grid,
 * a hover tooltip per bar, and an accessible data table.
 */
export function BarChart({
  data,
  label,
}: {
  data: { day: string; value: number }[];
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const H = 160;
  const niceMax = Math.ceil(max / 5) * 5 || 5;
  const ticks = [0, niceMax / 2, niceMax];
  const fmtDay = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const active = hover !== null ? data[hover] : null;
  return (
    <figure className="flex flex-col gap-2">
      <div className="relative">
        <div className="flex">
          <div
            className="text-muted-foreground flex w-8 shrink-0 flex-col justify-between pr-1 text-right text-[10px]"
            style={{ height: H }}
            aria-hidden="true"
          >
            {[...ticks].reverse().map((t) => (
              <span key={t}>{formatNumber(t)}</span>
            ))}
          </div>
          <div
            className="relative flex-1"
            style={{ height: H }}
            onMouseLeave={() => setHover(null)}
          >
            {ticks.map((t) => (
              <div
                key={t}
                className="border-border/70 absolute inset-x-0 border-t border-dashed"
                style={{ bottom: `${(t / niceMax) * 100}%` }}
                aria-hidden="true"
              />
            ))}
            <div
              className="absolute inset-0 flex items-end gap-[2px]"
              role="img"
              aria-label={`${label} per day`}
            >
              {data.map((d, i) => (
                <div
                  key={d.day}
                  className="flex h-full flex-1 items-end"
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  tabIndex={0}
                  aria-label={`${fmtDay(d.day)}: ${d.value} ${label}`}
                >
                  <div
                    className="bg-primary w-full rounded-t-[4px] transition-opacity"
                    style={{
                      height: `${(d.value / niceMax) * 100}%`,
                      minHeight: d.value > 0 ? 2 : 0,
                      opacity: hover === null || hover === i ? 1 : 0.45,
                    }}
                  />
                </div>
              ))}
            </div>
            {active ? (
              <div
                className="bg-popover pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-md border px-2 py-1 text-xs whitespace-nowrap shadow-md"
                style={{ left: `${((hover! + 0.5) / data.length) * 100}%` }}
              >
                <span className="text-muted-foreground">{fmtDay(active.day)}</span>{' '}
                <strong>{formatNumber(active.value)}</strong> {label}
              </div>
            ) : null}
          </div>
        </div>
        <div
          className="text-muted-foreground mt-1 flex justify-between pl-8 text-[10px]"
          aria-hidden="true"
        >
          <span>{data[0] ? fmtDay(data[0].day) : ''}</span>
          <span>{data.at(-1) ? fmtDay(data.at(-1)!.day) : ''}</span>
        </div>
      </div>
      <table className="sr-only">
        <caption>{label} per day</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
