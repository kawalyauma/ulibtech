import { SYNONYMS } from './text';

const SAFE = /^[a-z0-9]+$/;

function phraseToTsquery(phrase: string): string | null {
  const words = phrase.split(/\s+/).filter((w) => SAFE.test(w));
  if (words.length === 0) return null;
  return words.length === 1 ? words[0]! : `(${words.join(' <-> ')})`;
}

/** A single term with prefix matching and synonym alternatives. */
export function termToTsquery(term: string, extraSynonyms: string[] = []): string | null {
  if (!SAFE.test(term)) return null;
  const alts = new Set<string>();
  alts.add(term.length >= 3 && !/^\d+$/.test(term) ? `${term}:*` : term);
  for (const syn of [...(SYNONYMS[term] ?? []), ...extraSynonyms]) {
    const q = phraseToTsquery(syn);
    if (q) alts.add(q);
  }
  return alts.size === 1 ? [...alts][0]! : `(${[...alts].join(' | ')})`;
}

/** Builds a to_tsquery() expression joining terms with AND (`&`) or OR (`|`). */
export function buildTsquery(terms: string[], operator: '&' | '|', synonymsFor?: (t: string) => string[]): string {
  const parts = terms.map((t) => termToTsquery(t, synonymsFor?.(t) ?? [])).filter((p): p is string => Boolean(p));
  return parts.join(` ${operator} `);
}
