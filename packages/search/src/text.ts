/** Lowercases, folds accents and normalises common Ugandan class/term notations. */
export function normalizeQuery(input: string): string {
  let q = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/&/g, ' and ');
  // "p.6", "p 6", "primary6" -> p6 ; "s.3" -> s3
  q = q.replace(/\b(p|s)\s*\.\s*(\d)\b/g, '$1$2');
  q = q.replace(/\bprimary\s*(\d)\b/g, 'p$1').replace(/\bsenior\s*(\d)\b/g, 's$1');
  q = q.replace(/\bterm\s*(\d)\b/g, 'term $1').replace(/\bt([1-3])\b/g, 'term $1');
  q = q
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ');
  // Collapse spelled-out abbreviations: "s s t" -> "sst"
  q = q.replace(/\b(?:[a-z] )+[a-z]\b/g, (m) => m.replace(/ /g, ''));
  return q.trim();
}

export function tokenize(normalized: string): string[] {
  return normalized.split(' ').filter(Boolean);
}

const NUMBER_WORDS: Record<string, string> = {
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  first: '1',
  second: '2',
  third: '3',
};

/** "primary six" -> "p6", "term two" -> "term 2", "senior three" -> "s3". */
export function expandNumberWords(normalized: string): string {
  return normalized
    .replace(
      /\b(primary|senior|term)\s+(one|two|three|four|five|six|seven)\b/g,
      (_, a: string, n: string) => {
        const d = NUMBER_WORDS[n] ?? n;
        return a === 'primary' ? `p${d}` : a === 'senior' ? `s${d}` : `term ${d}`;
      },
    )
    .replace(/\b(first|second|third)\s+term\b/g, (_, n: string) => `term ${NUMBER_WORDS[n]}`);
}

/** Damerau–Levenshtein (optimal string alignment) distance with an early-exit bound. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array<number>(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length]![b.length]!;
}

/** General-purpose synonyms applied to free-text terms (entity aliases live in the vocabulary). */
export const SYNONYMS: Record<string, string[]> = {
  exam: ['examination'],
  exams: ['examination'],
  examination: ['exam'],
  bot: ['beginning of term'],
  mot: ['mid term'],
  eot: ['end of term'],
  midterm: ['mid term'],
  ple: ['primary leaving examination'],
  uce: ['uganda certificate of education'],
  uace: ['uganda advanced certificate of education'],
  revise: ['revision'],
  revision: ['revise'],
  answers: ['marking guide'],
  colour: ['color'],
  color: ['colour'],
  maths: ['mathematics'],
  math: ['mathematics'],
  sst: ['social studies'],
  sci: ['science'],
  eng: ['english'],
  agric: ['agriculture'],
  chem: ['chemistry'],
  bio: ['biology'],
  phy: ['physics'],
  geog: ['geography'],
  hist: ['history'],
  econ: ['economics'],
  lit: ['literature'],
  cre: ['christian religious education'],
  ire: ['islamic religious education'],
};
