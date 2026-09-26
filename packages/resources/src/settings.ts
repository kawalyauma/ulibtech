import { eq } from '@edushare/database';
import { siteSettings } from '@edushare/database/schema';
import { seedData } from '@edushare/database';
import { homepageSettingsSchema, siteSettingsSchema, type HomepageSettings, type SiteSettings } from '@edushare/shared';
import { recordAudit } from './audit';
import { PUBLIC_CACHE_NS, type Actor, type ServiceContext } from './context';
import { afterContentChange } from './admin-resources';

const SCHEMAS = { site: siteSettingsSchema, homepage: homepageSettingsSchema } as const;
type SettingKey = keyof typeof SCHEMAS;
type SettingValue<K extends SettingKey> = K extends 'site' ? SiteSettings : HomepageSettings;

const DEFAULTS: { [K in SettingKey]: SettingValue<K> } = {
  site: seedData.DEFAULT_SITE_SETTINGS as SiteSettings,
  homepage: seedData.DEFAULT_HOMEPAGE_SETTINGS as HomepageSettings,
};

export async function getSetting<K extends SettingKey>(ctx: Pick<ServiceContext, 'db'>, key: K): Promise<SettingValue<K>> {
  const row = await ctx.db.query.siteSettings.findFirst({ where: eq(siteSettings.key, key) });
  const parsed = SCHEMAS[key].safeParse(row?.value ?? DEFAULTS[key]);
  return (parsed.success ? parsed.data : DEFAULTS[key]) as SettingValue<K>;
}

export async function updateSetting<K extends SettingKey>(ctx: ServiceContext, actor: Actor, key: K, value: unknown): Promise<SettingValue<K>> {
  const parsed = SCHEMAS[key].parse(value) as SettingValue<K>;
  await ctx.db
    .insert(siteSettings)
    .values({ key, value: parsed, updatedById: actor.id })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: parsed, updatedById: actor.id, updatedAt: new Date() } });
  await recordAudit(ctx, actor, { action: 'settings.update', entityType: 'setting', entityId: key, entityLabel: key });
  await ctx.cache?.invalidate(PUBLIC_CACHE_NS);
  await afterContentChange(ctx, []);
  return parsed;
}
