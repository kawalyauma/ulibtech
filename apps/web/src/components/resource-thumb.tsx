import type { Thumbnail } from '@edushare/shared';
import { cn } from '@edushare/ui';

/**
 * Responsive thumbnail using pre-generated AVIF/WebP variants (320/640/1200). A fixed
 * aspect-ratio box prevents layout shift while images load lazily.
 */
export function ResourceThumb({
  thumbnail,
  title,
  sizes = '(min-width: 1024px) 240px, (min-width: 640px) 30vw, 45vw',
  priority = false,
  className,
  fileLabel,
}: {
  thumbnail: Thumbnail | null;
  title: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  fileLabel?: string | null;
}) {
  if (!thumbnail) {
    return (
      <div
        className={cn(
          'from-secondary to-muted flex aspect-[1/1.3] w-full items-center justify-center bg-gradient-to-br p-3 text-center',
          className,
        )}
      >
        <span className="text-secondary-foreground line-clamp-4 text-sm font-semibold">
          {title}
        </span>
        {fileLabel ? <span className="sr-only">{fileLabel}</span> : null}
      </div>
    );
  }
  const webp = thumbnail.variants
    .filter((v) => v.format === 'webp')
    .sort((a, b) => a.width - b.width);
  const avif = thumbnail.variants.filter((v) => v.format === 'avif');
  const fallback = webp[1] ?? webp[0];
  return (
    <picture className={cn('bg-muted block aspect-[1/1.3] w-full overflow-hidden', className)}>
      {avif.length ? (
        <source
          type="image/avif"
          srcSet={avif.map((v) => `${v.url} ${v.width}w`).join(', ')}
          sizes={sizes}
        />
      ) : null}
      <img
        src={fallback?.url ?? thumbnail.src}
        srcSet={webp.map((v) => `${v.url} ${v.width}w`).join(', ')}
        sizes={sizes}
        alt={thumbnail.alt}
        width={fallback?.width ?? 640}
        height={fallback?.height ?? 832}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        className="h-full w-full object-cover object-top"
      />
    </picture>
  );
}
