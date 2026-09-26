import type { ResourceStatus, ProcessingStatus, ScanStatus } from './constants';

export interface TaxonomyRef {
  id: string;
  name: string;
  slug: string;
}

export interface ClassRef extends TaxonomyRef {
  shortName: string | null;
  level: TaxonomyRef | null;
}

export interface ResourceTypeRef extends TaxonomyRef {
  pluralName: string;
}

export interface ThumbnailVariant {
  width: number;
  height: number;
  format: 'webp' | 'avif' | 'png';
  url: string;
}

export interface Thumbnail {
  alt: string;
  width: number;
  height: number;
  variants: ThumbnailVariant[];
  /** URL of the smallest WebP variant, used as a simple fallback src. */
  src: string;
}

export interface ResourceFileInfo {
  kind: string;
  label: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  pageCount: number | null;
  previewable: 'pdf' | 'image' | null;
}

/** Compact representation used by cards and lists. */
export interface ResourceCard {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  class: ClassRef | null;
  subject: TaxonomyRef | null;
  resourceType: ResourceTypeRef | null;
  academicYear: { id: string; year: number } | null;
  term: TaxonomyRef | null;
  file: Pick<ResourceFileInfo, 'label' | 'extension' | 'sizeBytes' | 'pageCount'> | null;
  thumbnail: Thumbnail | null;
  downloadCount: number;
  viewCount: number;
  featured: boolean;
  publishedAt: string | null;
}

export interface ResourceDetail extends ResourceCard {
  description: string | null;
  topic: TaxonomyRef | null;
  subtopic: TaxonomyRef | null;
  topicText: string | null;
  subtopicText: string | null;
  curriculum: TaxonomyRef | null;
  author: string | null;
  publisher: string | null;
  keywords: string[];
  tags: TaxonomyRef[];
  shareCount: number;
  fileDetail: ResourceFileInfo | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  createdAt: string;
  updatedAt: string;
  fileAvailable: boolean;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SearchHit extends ResourceCard {
  highlight: { title: string; snippet: string | null };
  score: number;
}

export interface FacetBucket {
  slug: string;
  name: string;
  count: number;
}

export interface SearchResponse extends Paginated<SearchHit> {
  query: string;
  normalizedQuery: string;
  tookMs: number;
  mode: 'all' | 'any' | 'fuzzy' | 'browse';
  didYouMean: string | null;
  interpreted: {
    class?: string;
    subject?: string;
    type?: string;
    year?: number;
    term?: string;
  };
  facets: {
    class: FacetBucket[];
    subject: FacetBucket[];
    type: FacetBucket[];
    year: FacetBucket[];
    term: FacetBucket[];
    fileType: FacetBucket[];
  };
}

export interface Suggestion {
  text: string;
  href: string;
  kind: 'landing' | 'resource' | 'query';
}

export interface LandingPage {
  path: string;
  title: string;
  heading: string;
  description: string;
  intro: string;
  noindex: boolean;
  filters: {
    class?: string;
    subject?: string;
    type?: string;
    year?: number;
    level?: string;
    topic?: string;
  };
  breadcrumbs: { name: string; path: string }[];
  context: {
    class: ClassRef | null;
    subject: TaxonomyRef | null;
    resourceType: ResourceTypeRef | null;
    year: number | null;
    topic: TaxonomyRef | null;
  };
  related: { name: string; path: string }[];
}

export interface AdminResourceRow {
  id: string;
  title: string;
  slug: string;
  status: ResourceStatus;
  featured: boolean;
  className: string | null;
  subjectName: string | null;
  resourceTypeName: string | null;
  year: number | null;
  viewCount: number;
  downloadCount: number;
  shareCount: number;
  processingStatus: ProcessingStatus | null;
  scanStatus: ScanStatus | null;
  fileExtension: string | null;
  updatedAt: string;
  publishedAt: string | null;
}

export interface DuplicateCandidate {
  id: string;
  title: string;
  slug: string;
  status: ResourceStatus;
  reasons: string[];
}

export interface AdminSessionInfo {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  csrfToken: string;
}
