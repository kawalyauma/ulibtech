import { notFound } from 'next/navigation';
import { getCollection } from '@/lib/api';

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!(await getCollection(slug))) notFound();
  return children;
}
