import { deviceType, isBot, referrerHost, visitorHash, type VisitorMeta } from '@edushare/analytics';
import { getServerEnv } from '@edushare/shared';
import { clientIp, type AppContext } from './http';

export function visitorMeta(c: AppContext): VisitorMeta {
  const ua = c.req.header('user-agent') ?? null;
  const env = getServerEnv();
  const ownHost = new URL(env.PUBLIC_SITE_URL).hostname;
  const referrer = c.req.header('x-page-referrer') ?? c.req.header('referer') ?? null;
  return {
    visitorHash: visitorHash(clientIp(c), ua, env.ANALYTICS_SALT),
    deviceType: deviceType(ua),
    referrerHost: referrerHost(referrer, ownHost),
    bot: isBot(ua),
  };
}
