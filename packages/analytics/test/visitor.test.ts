import { describe, expect, it } from 'vitest';
import { deviceType, isBot, referrerHost, visitorHash } from '../src/visitor';

describe('visitor helpers', () => {
  it('detects bots and link previews', () => {
    expect(isBot('WhatsApp/2.23.20.0')).toBe(true);
    expect(isBot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(isBot('Mozilla/5.0 (Linux; Android 13) Mobile Safari')).toBe(false);
    expect(isBot(undefined)).toBe(true);
  });
  it('classifies devices', () => {
    expect(deviceType('Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit Mobile Safari')).toBe('mobile');
    expect(deviceType('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBe('desktop');
  });
  it('rotates hashes daily and hides the IP', () => {
    const a = visitorHash('1.2.3.4', 'ua', 'salt', new Date('2026-09-26T10:00:00Z'));
    const b = visitorHash('1.2.3.4', 'ua', 'salt', new Date('2026-09-26T22:00:00Z'));
    const c = visitorHash('1.2.3.4', 'ua', 'salt', new Date('2026-09-27T10:00:00Z'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toContain('1.2.3.4');
  });
  it('extracts external referrer hosts only', () => {
    expect(referrerHost('https://www.google.com/search?q=x', 'edushare.ug')).toBe('google.com');
    expect(referrerHost('https://edushare.ug/search', 'edushare.ug')).toBeNull();
    expect(referrerHost('not a url')).toBeNull();
  });
});
