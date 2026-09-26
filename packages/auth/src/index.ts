import type { Permission } from '@edushare/shared';

export * from './password';
export * from './sessions';

export function hasPermission(granted: readonly string[], required: Permission | Permission[]): boolean {
  const list = Array.isArray(required) ? required : [required];
  return list.every((p) => granted.includes(p));
}
