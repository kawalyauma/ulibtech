import { notFound } from 'next/navigation';
import { getLanding } from '@/lib/api';

/**
 * Existence check outside the loading boundary so unknown paths return a real HTTP 404
 * (a notFound() inside a streamed page can only produce a "soft" 404).
 */
export default async function LandingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ segments: string[] }>;
}) {
  const { segments } = await params;
  if (segments.length > 4) notFound();
  const path = `/${segments.map((s) => decodeURIComponent(s).toLowerCase()).join('/')}`;
  if (!(await getLanding(path))) notFound();
  return children;
}
