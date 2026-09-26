import { notFound } from 'next/navigation';
import { getLanding } from '@/lib/api';

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string; type: string }>;
}) {
  const { slug, type } = await params;
  if (!(await getLanding(`/subjects/${slug}/${type}`))) notFound();
  return children;
}
