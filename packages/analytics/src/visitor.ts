import { createHash } from 'node:crypto';

const BOT_RE =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|twitterbot|linkedinbot|embedly|quora link preview|pinterest|vkshare|skypeuripreview|headlesschrome|lighthouse|curl|wget|python-requests|httpclient|go-http-client|axios|node-fetch/i;

export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  return BOT_RE.test(userAgent);
}

export function deviceType(userAgent: string | null | undefined): 'mobile' | 'tablet' | 'desktop' | 'bot' {
  if (isBot(userAgent)) return 'bot';
  const ua = userAgent ?? '';
  if (/ipad|tablet|kindle|playbook|silk|(android(?!.*mobile))/i.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android|blackberry|opera mini|iemobile|kaios/i.test(ua)) return 'mobile';
  return 'desktop';
}

/**
 * Anonymous, daily-rotating visitor identifier. The raw IP never leaves this function;
 * because the day is part of the input, identifiers cannot be linked across days.
 */
export function visitorHash(ip: string | null | undefined, userAgent: string | null | undefined, salt: string, date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  return createHash('sha256')
    .update(`${salt}|${day}|${ip ?? ''}|${userAgent ?? ''}`)
    .digest('hex')
    .slice(0, 32);
}

export function referrerHost(referrer: string | null | undefined, ownHost?: string): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '');
    if (ownHost && host === ownHost.replace(/^www\./, '')) return null;
    return host.slice(0, 200);
  } catch {
    return null;
  }
}
