import { notFound } from 'next/navigation';
import { getLanding } from '@/lib/api';

/** Real 404 status for unknown subjects (see [...segments]/layout.tsx). */
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!(await getLanding(`/subjects/${slug}`))) notFound();
  return children;
}
