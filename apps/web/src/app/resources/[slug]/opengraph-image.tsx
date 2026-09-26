import { ImageResponse } from 'next/og';
import { getResource } from '@/lib/api';
import { SITE_NAME } from '@/lib/config';

export const alt = 'Free educational resource';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 3600;

/** Social preview: "P6 Science / End of Term 2 Examination 2026 / FREE DOWNLOAD". */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lookup = await getResource(slug).catch(() => null);
  const r = lookup && 'resource' in lookup ? lookup.resource : null;
  const context = r ? [r.class?.shortName ?? r.class?.name, r.subject?.name].filter(Boolean).join(' ') : '';
  const title = r?.title ?? 'Free learning resources';
  const meta = r ? [r.resourceType?.name, r.fileDetail?.label, r.fileDetail?.pageCount ? `${r.fileDetail.pageCount} pages` : null].filter(Boolean).join(' • ') : '';
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 64, background: 'linear-gradient(135deg, #0f766e 0%, #134e4a 100%)', color: 'white', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', fontSize: 44, fontWeight: 700, opacity: 0.92 }}>{context || SITE_NAME}</div>
        <div style={{ display: 'flex', fontSize: title.length > 60 ? 58 : 72, fontWeight: 800, lineHeight: 1.1, maxWidth: 1050 }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', background: '#fbbf24', color: '#422006', padding: '14px 30px', borderRadius: 999, fontSize: 36, fontWeight: 800 }}>FREE DOWNLOAD</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: 28 }}>
            <span>{meta}</span>
            <span style={{ opacity: 0.85 }}>{SITE_NAME}</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
