import { serializeJsonLd } from '@edushare/seo';

export function JsonLd({ data }: { data: unknown }) {
  // serializeJsonLd escapes <, > and & so content cannot break out of the script tag.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
