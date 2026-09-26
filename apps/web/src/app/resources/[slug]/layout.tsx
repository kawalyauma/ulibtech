import { notFound } from 'next/navigation';
import { getResource } from '@/lib/api';

/** Real 404 status for unknown resources (see [...segments]/layout.tsx). */
export default async function ResourceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!(await getResource(slug))) notFound();
  return children;
}
