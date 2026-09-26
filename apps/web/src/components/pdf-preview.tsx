'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, Loader2, Minus, Plus } from 'lucide-react';
import { Button } from '@edushare/ui';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

/**
 * Progressive PDF preview using PDF.js (legacy build, for older Android browsers). The library is only downloaded when the visitor
 * asks for a preview, and the document is fetched in 64 KB range chunks so the first page
 * appears without downloading the whole file.
 */
export function PdfPreview({
  url,
  pageCount,
  title,
}: {
  url: string;
  pageCount: number | null;
  title: string;
}) {
  const [started, setStarted] = useState(false);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const taskRef = useRef<RenderTask | null>(null);

  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
        const task = pdfjs.getDocument({
          url,
          rangeChunkSize: 65536,
          disableAutoFetch: true,
          disableStream: false,
          isEvalSupported: false,
        } as Parameters<typeof pdfjs.getDocument>[0]);
        loaded = await task.promise;
        if (!cancelled) setDoc(loaded);
      } catch {
        if (!cancelled)
          setError('The preview could not be loaded. You can still download the file.');
      }
    })();
    return () => {
      cancelled = true;
      void loaded?.destroy();
    };
  }, [started, url]);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    (async () => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      try {
        // A canvas can only be used by one render at a time: cancel and wait for the previous one.
        if (taskRef.current) {
          taskRef.current.cancel();
          await taskRef.current.promise.catch(() => undefined);
          taskRef.current = null;
        }
        const p = await doc.getPage(page);
        if (cancelled) return;
        const base = p.getViewport({ scale: 1 });
        const fit = (wrap.clientWidth - 2) / base.width;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = p.getViewport({ scale: fit * scale * dpr });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
        const task = p.render({ canvas, viewport } as Parameters<typeof p.render>[0]);
        taskRef.current = task;
        await task.promise;
      } catch (err) {
        const name = (err as { name?: string }).name ?? '';
        if (!cancelled && !/Cancel/i.test(name)) {
          console.error('[pdf-preview]', err);
          setError('This page could not be displayed.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, page, scale]);

  const total = doc?.numPages ?? pageCount ?? 1;

  if (!started) {
    return (
      <Button variant="outline" size="lg" className="w-full" onClick={() => setStarted(true)}>
        <Eye className="size-5" aria-hidden="true" />
        Preview{pageCount ? ` (${pageCount} ${pageCount === 1 ? 'page' : 'pages'})` : ''}
      </Button>
    );
  }

  return (
    <section
      aria-label={`Preview of ${title}`}
      className="bg-card flex flex-col gap-3 rounded-xl border p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <span className="min-w-24 text-center text-sm" aria-live="polite">
            Page {page} of {total}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setPage((p) => Math.min(total, p + 1))}
            disabled={page >= total}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))}
            aria-label="Zoom out"
          >
            <Minus className="size-4" aria-hidden="true" />
          </Button>
          <span className="w-12 text-center text-sm">{Math.round(scale * 100)}%</span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setScale((s) => Math.min(3, +(s + 0.25).toFixed(2)))}
            aria-label="Zoom in"
          >
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div
        ref={wrapRef}
        className="bg-muted/50 relative min-h-64 w-full overflow-auto rounded-md border"
        data-testid="pdf-preview"
      >
        {!doc && !error ? (
          <div className="text-muted-foreground flex aspect-[1/1.3] items-center justify-center text-sm">
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> Loading preview…
          </div>
        ) : null}
        {error ? <p className="text-destructive p-6 text-center text-sm">{error}</p> : null}
        <canvas
          ref={canvasRef}
          className={doc ? 'mx-auto block bg-white' : 'hidden'}
          aria-label={`Page ${page} of ${title}`}
          role="img"
        />
      </div>
    </section>
  );
}
