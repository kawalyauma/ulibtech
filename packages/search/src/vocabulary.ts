import { editDistance, normalizeQuery } from './text';

export interface VocabEntry {
  id: string;
  slug: string;
  name: string;
  /** Display label, e.g. "P6" or "Past Papers". */
  label: string;
  phrases: string[];
  /** For classes: the school level id. */
  parentId?: string | null;
}

export interface Vocabulary {
  classes: VocabEntry[];
  subjects: VocabEntry[];
  types: VocabEntry[];
  terms: VocabEntry[];
  levels: VocabEntry[];
  years: { id: string; year: number }[];
  curricula: VocabEntry[];
  topics: VocabEntry[];
  /** class slug -> subject slugs taught in that class */
  classSubjects: Record<string, string[]>;
}

export type EntityKind = 'class' | 'subject' | 'type' | 'term';

export interface ParsedQuery {
  normalized: string;
  /** Free-text tokens that were not recognised as entities. */
  terms: string[];
  entities: {
    class?: VocabEntry;
    subject?: VocabEntry;
    type?: VocabEntry;
    term?: VocabEntry;
    year?: number;
  };
  /** Tokens consumed by entities (kept for "any" mode). */
  entityTokens: string[];
  advanced: boolean;
}

export function buildPhraseIndex(
  v: Vocabulary,
): Map<string, { kind: EntityKind; entry: VocabEntry }> {
  const map = new Map<string, { kind: EntityKind; entry: VocabEntry }>();
  const add = (kind: EntityKind, list: VocabEntry[]) => {
    for (const entry of list) {
      for (const phrase of entry.phrases) {
        const p = normalizeQuery(phrase);
        if (p && !map.has(p)) map.set(p, { kind, entry });
      }
    }
  };
  // Order matters when phrases collide: classes and types before subjects.
  add('class', v.classes);
  add('type', v.types);
  add('subject', v.subjects);
  add('term', v.terms);
  return map;
}

const MAX_NGRAM = 5;

/** Greedy longest-match entity recognition over the normalised query. */
export function parseQuery(
  raw: string,
  phraseIndex: Map<string, { kind: EntityKind; entry: VocabEntry }>,
  expand: (s: string) => string = (s) => s,
): ParsedQuery {
  const advanced = /["]|(^|\s)-\w|\bor\b/i.test(raw);
  const normalized = expand(normalizeQuery(raw));
  const tokens = normalized.split(' ').filter(Boolean);
  const entities: ParsedQuery['entities'] = {};
  const terms: string[] = [];
  const entityTokens: string[] = [];

  let i = 0;
  while (i < tokens.length) {
    let matched = false;
    for (let n = Math.min(MAX_NGRAM, tokens.length - i); n >= 1; n--) {
      const phrase = tokens.slice(i, i + n).join(' ');
      const hit = phraseIndex.get(phrase);
      // "end of term 2": let "term 2" win over the type alias "end of term".
      if (
        hit &&
        hit.kind !== 'term' &&
        tokens[i + n - 1] === 'term' &&
        /^[1-3]$/.test(tokens[i + n] ?? '')
      )
        continue;
      if (hit && !entities[hit.kind]) {
        entities[hit.kind] = hit.entry;
        entityTokens.push(...tokens.slice(i, i + n));
        i += n;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const tok = tokens[i]!;
    const year = Number(tok);
    if (/^\d{4}$/.test(tok) && year >= 1990 && year <= 2100 && entities.year === undefined) {
      entities.year = year;
      entityTokens.push(tok);
    } else {
      terms.push(tok);
    }
    i++;
  }
  return { normalized, terms, entities, entityTokens, advanced };
}

/** Words that can be used to correct spelling mistakes. */
export function buildCorrectionLexicon(v: Vocabulary, extra: string[] = []): string[] {
  const words = new Set<string>();
  const addPhrase = (p: string) => {
    for (const w of normalizeQuery(p).split(' ')) if (w.length >= 3) words.add(w);
  };
  for (const list of [v.classes, v.subjects, v.types, v.terms, v.topics]) {
    for (const e of list) {
      addPhrase(e.name);
      for (const p of e.phrases) addPhrase(p);
    }
  }
  for (const w of extra) addPhrase(w);
  return [...words];
}

/** Suggests a corrected query ("p6 chemstry" -> "p6 chemistry") or null when nothing changes. */
export function correctQuery(normalized: string, lexicon: string[]): string | null {
  const lex = new Set(lexicon);
  let changed = false;
  const out = normalized.split(' ').map((tok) => {
    if (tok.length < 4 || /\d/.test(tok) || lex.has(tok)) return tok;
    const maxDist = tok.length >= 8 ? 2 : 1;
    let best: string | null = null;
    let bestDist = maxDist + 1;
    for (const w of lexicon) {
      if (Math.abs(w.length - tok.length) > maxDist || w[0] !== tok[0]) continue;
      const d = editDistance(tok, w, maxDist);
      if (d < bestDist) {
        best = w;
        bestDist = d;
      }
    }
    if (best && bestDist <= maxDist) {
      changed = true;
      return best;
    }
    return tok;
  });
  return changed ? out.join(' ') : null;
}
