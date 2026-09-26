import {
  ALLOWED_FILE_TYPES,
  type AllowedFileKind,
  type ResourceCard,
  type ResourceDetail,
  type Thumbnail,
} from '@edushare/shared';
import { isPreviewable } from '@edushare/documents';
import type {
  academicYears,
  classes,
  curricula,
  mediaAssets,
  resourceFiles,
  resourceTypes,
  resources,
  schoolLevels,
  subjects,
  subtopics,
  tags,
  terms,
  topics,
} from '@edushare/database/schema';

type Row<T extends { $inferSelect: unknown }> = T['$inferSelect'];

export type ResourceWithRelations = Omit<
  Row<typeof resources>,
  'searchVector' | 'contentVector' | 'searchText'
> & {
  class: (Row<typeof classes> & { level: Row<typeof schoolLevels> | null }) | null;
  subject: Row<typeof subjects> | null;
  resourceType: Row<typeof resourceTypes> | null;
  academicYear: Row<typeof academicYears> | null;
  term: Row<typeof terms> | null;
  file: Omit<Row<typeof resourceFiles>, 'extractedText'> | null;
  thumbnail: Row<typeof mediaAssets> | null;
};

export type ResourceDetailRow = ResourceWithRelations & {
  topic: Row<typeof topics> | null;
  subtopic: Row<typeof subtopics> | null;
  curriculum: Row<typeof curricula> | null;
  tags: { tag: Row<typeof tags> }[];
};

export function fileLabel(kind: string | null | undefined): string {
  if (!kind) return 'File';
  return (
    (ALLOWED_FILE_TYPES as Record<string, { label: string }>)[kind]?.label ?? kind.toUpperCase()
  );
}

export function mapThumbnail(
  asset: Row<typeof mediaAssets> | null,
  mediaBaseUrl: string,
  alt: string,
): Thumbnail | null {
  if (!asset || asset.variants.length === 0) return null;
  const variants = asset.variants.map((v) => ({
    width: v.width,
    height: v.height,
    format: v.format,
    url: `${mediaBaseUrl}/${v.key}`,
  }));
  const webp = variants.filter((v) => v.format === 'webp').sort((a, b) => a.width - b.width);
  return {
    alt: asset.alt ?? alt,
    width: asset.width,
    height: asset.height,
    variants,
    src: (webp[0] ?? variants[0])!.url,
  };
}

export function thumbnailAlt(
  r: Pick<ResourceWithRelations, 'title' | 'class' | 'subject' | 'resourceType'>,
): string {
  const ctx = [r.class?.shortName ?? r.class?.name, r.subject?.name, r.resourceType?.name]
    .filter(Boolean)
    .join(' ');
  return `Cover of ${r.title}${ctx ? ` (${ctx})` : ''}`;
}

export function mapCard(r: ResourceWithRelations, mediaBaseUrl: string): ResourceCard {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    shortDescription: r.shortDescription,
    class: r.class
      ? {
          id: r.class.id,
          name: r.class.name,
          slug: r.class.slug,
          shortName: r.class.shortName,
          level: r.class.level
            ? { id: r.class.level.id, name: r.class.level.name, slug: r.class.level.slug }
            : null,
        }
      : null,
    subject: r.subject ? { id: r.subject.id, name: r.subject.name, slug: r.subject.slug } : null,
    resourceType: r.resourceType
      ? {
          id: r.resourceType.id,
          name: r.resourceType.name,
          slug: r.resourceType.slug,
          pluralName: r.resourceType.pluralName,
        }
      : null,
    academicYear: r.academicYear ? { id: r.academicYear.id, year: r.academicYear.year } : null,
    term: r.term ? { id: r.term.id, name: r.term.name, slug: r.term.slug } : null,
    file: r.file
      ? {
          label: fileLabel(r.file.kind),
          extension: r.file.extension,
          sizeBytes: r.file.sizeBytes,
          pageCount: r.file.pageCount,
        }
      : null,
    thumbnail: mapThumbnail(r.thumbnail, mediaBaseUrl, thumbnailAlt(r)),
    downloadCount: r.downloadCount,
    viewCount: r.viewCount,
    featured: r.featured,
    publishedAt: r.publishedAt?.toISOString() ?? null,
  };
}

export function mapDetail(r: ResourceDetailRow, mediaBaseUrl: string): ResourceDetail {
  const card = mapCard(r, mediaBaseUrl);
  return {
    ...card,
    description: r.description,
    topic: r.topic ? { id: r.topic.id, name: r.topic.name, slug: r.topic.slug } : null,
    subtopic: r.subtopic
      ? { id: r.subtopic.id, name: r.subtopic.name, slug: r.subtopic.slug }
      : null,
    topicText: r.topicText,
    subtopicText: r.subtopicText,
    curriculum: r.curriculum
      ? { id: r.curriculum.id, name: r.curriculum.name, slug: r.curriculum.slug }
      : null,
    author: r.author,
    publisher: r.publisher,
    keywords: r.keywords,
    tags: r.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, slug: t.tag.slug })),
    shareCount: r.shareCount,
    fileDetail: r.file
      ? {
          kind: r.file.kind,
          label: fileLabel(r.file.kind),
          mimeType: r.file.mimeType,
          extension: r.file.extension,
          sizeBytes: r.file.sizeBytes,
          pageCount: r.file.pageCount,
          previewable: isPreviewable(r.file.kind as AllowedFileKind),
        }
      : null,
    seoTitle: r.seoTitle,
    seoDescription: r.seoDescription,
    canonicalUrl: r.canonicalUrl,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    fileAvailable: Boolean(r.file && !r.file.isMissing),
  };
}
