import { splitHighlight } from '@edushare/shared';

/** Renders API highlight markers (««…»») as <mark> without using innerHTML. */
export function Highlight({ text, fallback }: { text: string | null | undefined; fallback?: string }) {
  if (!text) return <>{fallback ?? ''}</>;
  return (
    <>
      {splitHighlight(text).map((part, i) =>
        part.match ? (
          <mark key={i} className="rounded-sm bg-accent px-0.5 text-accent-foreground">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}
