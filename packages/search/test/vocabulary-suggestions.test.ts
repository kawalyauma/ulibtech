import { describe, expect, it } from 'vitest';
import { vocabularySuggestions, type Vocabulary } from '../src/vocabulary';

const e = (slug: string, label: string, phrases: string[] = []) => ({
  id: slug,
  slug,
  name: label,
  label,
  phrases: [label, slug, ...phrases],
});
const vocab: Vocabulary = {
  classes: [e('p6', 'P6', ['primary six']), e('s2', 'S2')],
  subjects: [e('mathematics', 'Mathematics', ['maths']), e('science', 'Science')],
  types: [e('past-papers', 'Past Papers')],
  terms: [],
  levels: [],
  years: [],
  curricula: [],
  topics: [e('measurement-of-mass', 'Measurement of Mass'), e('fractions', 'Fractions')],
  classSubjects: {},
};

describe('vocabularySuggestions', () => {
  it('suggests landing pages by prefix with no published resources', () => {
    expect(vocabularySuggestions(vocab, ['ma'], 8)).toEqual([
      { text: 'Mathematics', href: '/subjects/mathematics' },
      { text: 'Measurement of Mass', href: '/topics/measurement-of-mass' },
    ]);
  });

  it('matches phrases and requires every token', () => {
    expect(vocabularySuggestions(vocab, ['primary', 'six'], 8)).toEqual([
      { text: 'P6', href: '/classes/p6' },
    ]);
    expect(vocabularySuggestions(vocab, ['past'], 8)).toEqual([
      { text: 'Past Papers', href: '/past-papers' },
    ]);
    expect(vocabularySuggestions(vocab, ['zzz'], 8)).toEqual([]);
  });

  it('respects the limit', () => {
    expect(vocabularySuggestions(vocab, ['m'], 1)).toHaveLength(1);
  });
});
