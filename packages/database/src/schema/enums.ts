import { pgEnum } from 'drizzle-orm/pg-core';
import {
  RESOURCE_STATUSES,
  PROCESSING_STATUSES,
  SCAN_STATUSES,
  SHARE_CHANNELS,
} from '@edushare/shared';

export const resourceStatusEnum = pgEnum('resource_status', RESOURCE_STATUSES);
export const processingStatusEnum = pgEnum('processing_status', PROCESSING_STATUSES);
export const scanStatusEnum = pgEnum('scan_status', SCAN_STATUSES);
export const shareChannelEnum = pgEnum('share_channel', SHARE_CHANNELS);
