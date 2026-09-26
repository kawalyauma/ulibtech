export const RESOURCE_STATUSES = ['draft', 'review', 'published', 'unpublished', 'archived'] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

export const PROCESSING_STATUSES = ['pending', 'processing', 'ready', 'failed'] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export const SCAN_STATUSES = ['pending', 'clean', 'skipped', 'infected'] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const SHARE_CHANNELS = [
  'whatsapp',
  'facebook',
  'x',
  'telegram',
  'email',
  'copy',
  'native',
] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

export const ANALYTICS_EVENT_TYPES = [
  'resource_view',
  'resource_download',
  'resource_share',
  'search',
  'search_no_result',
  'filter_use',
  'related_resource_click',
] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export const PERMISSIONS = {
  'resources.read': 'View resources in the admin dashboard',
  'resources.create': 'Upload and create resources',
  'resources.update': 'Edit resources, replace files, manage versions',
  'resources.publish': 'Publish, unpublish and archive resources',
  'resources.delete': 'Permanently delete resources',
  'taxonomy.manage': 'Manage classes, subjects, types, years, terms, topics and tags',
  'collections.manage': 'Manage curated collections',
  'seo.manage': 'Manage SEO metadata and landing pages',
  'analytics.read': 'View analytics and reports',
  'homepage.manage': 'Manage homepage sections and announcements',
  'settings.manage': 'Manage site settings',
  'admins.manage': 'Manage administrators and roles',
  'audit.read': 'View the audit log',
} as const;
export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const DEFAULT_ROLES: Record<
  string,
  { name: string; description: string; permissions: Permission[] }
> = {
  super_admin: {
    name: 'Super Admin',
    description: 'Full access to every feature, including administrators and roles.',
    permissions: ALL_PERMISSIONS,
  },
  admin: {
    name: 'Admin',
    description: 'Manages content, SEO, homepage, analytics and settings.',
    permissions: ALL_PERMISSIONS.filter((p) => p !== 'admins.manage'),
  },
  content_manager: {
    name: 'Content Manager',
    description: 'Uploads, classifies and publishes resources.',
    permissions: [
      'resources.read',
      'resources.create',
      'resources.update',
      'resources.publish',
      'taxonomy.manage',
      'collections.manage',
      'seo.manage',
      'analytics.read',
    ],
  },
  editor: {
    name: 'Editor',
    description: 'Uploads and edits resources; cannot publish or delete.',
    permissions: ['resources.read', 'resources.create', 'resources.update', 'analytics.read'],
  },
  moderator: {
    name: 'Moderator',
    description: 'Reviews and publishes or unpublishes resources.',
    permissions: ['resources.read', 'resources.publish', 'analytics.read'],
  },
};

/** File kinds accepted for upload. Detected by signature, never by extension alone. */
export const ALLOWED_FILE_TYPES = {
  pdf: { mime: 'application/pdf', extensions: ['pdf'], label: 'PDF' },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['docx'],
    label: 'Word',
  },
  doc: { mime: 'application/msword', extensions: ['doc'], label: 'Word' },
  pptx: {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extensions: ['pptx'],
    label: 'PowerPoint',
  },
  ppt: { mime: 'application/vnd.ms-powerpoint', extensions: ['ppt'], label: 'PowerPoint' },
  xlsx: {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extensions: ['xlsx'],
    label: 'Excel',
  },
  xls: { mime: 'application/vnd.ms-excel', extensions: ['xls'], label: 'Excel' },
  odt: { mime: 'application/vnd.oasis.opendocument.text', extensions: ['odt'], label: 'ODT' },
  jpg: { mime: 'image/jpeg', extensions: ['jpg', 'jpeg'], label: 'JPEG' },
  png: { mime: 'image/png', extensions: ['png'], label: 'PNG' },
  webp: { mime: 'image/webp', extensions: ['webp'], label: 'WebP' },
  txt: { mime: 'text/plain', extensions: ['txt'], label: 'Text' },
} as const;
export type AllowedFileKind = keyof typeof ALLOWED_FILE_TYPES;

export const THUMBNAIL_WIDTHS = [320, 640, 1200] as const;

export const CACHE_TAGS = {
  all: 'all',
  home: 'home',
  taxonomy: 'taxonomy',
  sitemap: 'sitemap',
  resource: (slug: string) => `resource:${slug}`,
  resources: 'resources',
  landing: 'landing',
  collections: 'collections',
  settings: 'settings',
} as const;

export const SESSION_COOKIE = 'es_session';
export const CSRF_HEADER = 'x-csrf-token';
