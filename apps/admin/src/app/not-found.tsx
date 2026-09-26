import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-4 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link href="/" className="text-primary underline">
        Back to dashboard
      </Link>
    </main>
  );
}
