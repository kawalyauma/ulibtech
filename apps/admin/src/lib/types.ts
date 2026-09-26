import type {
  AdminResourceRow,
  DuplicateCandidate,
  Paginated,
  ResourceDetail,
  ResourceStatus,
} from '@edushare/shared';

export type { AdminResourceRow, Paginated };

export interface AdminResource extends ResourceDetail {
  status: ResourceStatus;
  ids: Record<
    | 'classId'
    | 'subjectId'
    | 'resourceTypeId'
    | 'academicYearId'
    | 'termId'
    | 'topicId'
    | 'subtopicId'
    | 'curriculumId',
    string | null
  >;
  processing: {
    status: string;
    error: string | null;
    scanStatus: string;
    processedAt: string | null;
    isMissing: boolean;
    originalName: string;
    sha256: string;
    metadata: Record<string, unknown>;
  } | null;
  versions: {
    id: string;
    versionNumber: number;
    notes: string | null;
    createdAt: string;
    isCurrent: boolean;
    file: {
      id: string;
      originalName: string;
      sizeBytes: number;
      kind: string;
      pageCount: number | null;
      processingStatus: string;
      scanStatus: string;
    };
  }[];
  stats: { day: string; views: number; downloads: number; shares: number }[];
  duplicates: DuplicateCandidate[];
}

export interface TaxonomyRow {
  id: string;
  name?: string;
  slug?: string;
  year?: number;
  usage_count: number;
  [key: string]: unknown;
}
