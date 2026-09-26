import Link from 'next/link';
import { SearchBox } from '@/components/search-box';

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-5 px-4 py-20 text-center">
      <p className="text-primary text-sm font-semibold tracking-widest uppercase">404</p>
      <h1 className="text-3xl font-bold">We couldn’t find that page</h1>
      <p className="text-muted-foreground">
        The resource may have moved or been removed. Try searching for it instead.
      </p>
      <SearchBox />
      <div className="flex gap-3 text-sm">
        <Link href="/" className="text-primary underline">
          Home
        </Link>
        <Link href="/classes" className="text-primary underline">
          Browse classes
        </Link>
        <Link href="/past-papers" className="text-primary underline">
          Past papers
        </Link>
      </div>
    </div>
  );
}
