import { LocalFilesystemStorageProvider } from './local';
import type { StorageProvider } from './types';

export * from './types';
export * from './keys';
export { LocalFilesystemStorageProvider } from './local';

let instance: StorageProvider | undefined;

/** Returns the configured storage provider (singleton). */
export function getStorage(): StorageProvider {
  if (!instance) {
    const driver = process.env.STORAGE_DRIVER ?? 'local';
    if (driver !== 'local') throw new Error(`Unsupported STORAGE_DRIVER: ${driver}`);
    const accel = process.env.STORAGE_ACCEL_REDIRECT === 'true' ? '/_protected' : null;
    instance = new LocalFilesystemStorageProvider({
      root: process.env.STORAGE_ROOT ?? './storage',
      accelPrefix: accel,
    });
  }
  return instance;
}

export function setStorage(provider: StorageProvider): void {
  instance = provider;
}
