import { afterEach, describe, expect, it } from 'vitest';
import { ledgerlyCompleteJson } from '../src/ai-ledgerly';
import { autopilotReasons } from '../src/autopilot';
import { folderHint, skipReason } from '../src/zip-import';

const MB = 1024 * 1024;

describe('zip import entry filtering', () => {
  it('skips folders, system files, nested zips and unsupported types', () => {
    expect(skipReason('P6/', 0, 100 * MB)).toBe('folder');
    expect(skipReason('__MACOSX/P6/._notes.pdf', 10, 100 * MB)).toBe('system file');
    expect(skipReason('P6/.DS_Store', 10, 100 * MB)).toBe('system file');
    expect(skipReason('P6/~$draft.docx', 10, 100 * MB)).toBe('system file');
    expect(skipReason('P6/Thumbs.db', 10, 100 * MB)).toBe('system file');
    expect(skipReason('more.zip', 10, 100 * MB)).toMatch(/nested zip/);
    expect(skipReason('song.mp3', 10, 100 * MB)).toMatch(/unsupported file type \(\.mp3\)/);
    expect(skipReason('empty.pdf', 0, 100 * MB)).toBe('empty file');
    expect(skipReason('huge.pdf', 200 * MB, 100 * MB)).toBe('larger than 100 MB');
  });

  it('accepts supported documents', () => {
    expect(skipReason('P6/Science/Past Papers/term 2.PDF', 5000, 100 * MB)).toBeNull();
    expect(skipReason('notes.docx', 5000, 100 * MB)).toBeNull();
  });

  it('turns folder names into a classification hint', () => {
    expect(folderHint('P6/Science/Past_Papers/term 2.pdf')).toBe('P6 Science Past Papers');
    expect(folderHint('file.pdf')).toBe('');
  });
});

describe('autopilot quality gate', () => {
  const good = {
    textLength: 5000,
    suggestion: {
      quality: { isEducational: true, safeForAds: true, containsPersonalData: false, notes: null },
    },
    description: Array.from({ length: 70 }, (_, i) => `word${i}`).join(' '),
    classified: { classId: 'c', subjectId: 's', resourceTypeId: 't' },
    duplicateOfPublished: false,
    scanStatus: 'clean',
  };

  it('passes a complete, safe, classified document', () => {
    expect(autopilotReasons(good)).toEqual([]);
  });

  it('holds back thin, unsafe, personal or unclassified documents', () => {
    const reasons = autopilotReasons({
      ...good,
      textLength: 100,
      suggestion: {
        quality: {
          isEducational: false,
          safeForAds: false,
          containsPersonalData: true,
          notes: 'class list',
        },
      },
      description: 'Too short.',
      classified: { classId: null, subjectId: null, resourceTypeId: null },
      duplicateOfPublished: true,
      scanStatus: 'pending',
    });
    expect(reasons).toHaveLength(9);
    expect(reasons.join(' ')).toMatch(/thin content/);
    expect(reasons.join(' ')).toMatch(/personal data/);
    expect(reasons.join(' ')).toMatch(/duplicate/);
    expect(reasons.join(' ')).toMatch(/scan has not finished/);
  });

  it('holds back when the AI gave no quality assessment', () => {
    expect(autopilotReasons({ ...good, suggestion: { quality: null } })).toEqual([
      'The AI did not assess content quality.',
    ]);
  });
});

describe('Ledgerly AI client', () => {
  afterEach(() => {
    delete process.env.LEDGERLY_AI_URL;
    delete process.env.LEDGERLY_AI_API_KEY;
  });

  it('posts to the integration endpoint with the API key and returns the JSON', async () => {
    process.env.LEDGERLY_AI_URL = 'https://erp.example/';
    process.env.LEDGERLY_AI_API_KEY = 'secret-key';
    let seen: { url: string; init: RequestInit } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(
        JSON.stringify({ data: { json: { title: 'X' }, provider: 'codex', durationMs: 5 } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const out = await ledgerlyCompleteJson('sys', 'prompt', fake);
    expect(out).toEqual({ json: { title: 'X' }, provider: 'codex', durationMs: 5 });
    expect(seen!.url).toBe('https://erp.example/api/v1/ledgerly-ai/integrations/complete');
    expect((seen!.init.headers as Record<string, string>)['x-api-key']).toBe('secret-key');
    expect(JSON.parse(String(seen!.init.body))).toMatchObject({
      responseFormat: 'json',
      system: 'sys',
    });
  });

  it('throws with the server message on failure', async () => {
    process.env.LEDGERLY_AI_URL = 'https://erp.example';
    process.env.LEDGERLY_AI_API_KEY = 'k';
    const fake = (async () =>
      new Response(JSON.stringify({ error: { message: 'Missing required scope: ai:write' } }), {
        status: 403,
      })) as unknown as typeof fetch;
    await expect(ledgerlyCompleteJson('s', 'p', fake)).rejects.toThrow(/ai:write/);
  });
});
