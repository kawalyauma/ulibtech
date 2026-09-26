import { describe, expect, it } from 'vitest';
import {
  buildCorrectionLexicon,
  buildPhraseIndex,
  correctQuery,
  parseQuery,
  type Vocabulary,
} from '../src/vocabulary';
import { editDistance, expandNumberWords, normalizeQuery } from '../src/text';

const e = (slug: string, name: string, phrases: string[]) => ({
  id: slug,
  slug,
  name,
  label: name,
  phrases: [name, slug, ...phrases],
});
const vocab: Vocabulary = {
  classes: [
    e('p6', 'Primary 6', ['p6', 'primary six']),
    e('p7', 'Primary 7', ['p7']),
    e('s2', 'Senior 2', ['s2', 'senior two']),
  ],
  subjects: [
    e('social-studies', 'Social Studies', ['sst', 'social']),
    e('science', 'Science', ['sci']),
    e('integrated-science', 'Integrated Science', []),
    e('chemistry', 'Chemistry', ['chem']),
    e('mathematics', 'Mathematics', ['maths', 'math']),
  ],
  types: [
    e('past-papers', 'Past Paper', ['past papers', 'paper', 'exam', 'examination']),
    e('notes', 'Notes', ['note']),
    e('schemes-of-work', 'Scheme of Work', ['scheme', 'schemes of work']),
    e('lesson-plans', 'Lesson Plan', ['lesson plans']),
  ],
  terms: [e('term-2', 'Term 2', ['term 2'])],
  levels: [],
  years: [],
  curricula: [],
  topics: [],
  classSubjects: {},
};
const index = buildPhraseIndex(vocab);

describe('normalizeQuery', () => {
  it('normalises class and term notations', () => {
    expect(normalizeQuery('P.6  S.S.T  Past-Paper!')).toBe('p6 sst past paper');
    expect(normalizeQuery('Primary 7 T2')).toBe('p7 term 2');
    expect(expandNumberWords('primary six term two')).toBe('p6 term 2');
  });
});

describe('parseQuery', () => {
  it('recognises class, subject and type in "P6 SST past paper"', () => {
    const p = parseQuery('P6 SST past paper', index);
    expect(p.entities.class?.slug).toBe('p6');
    expect(p.entities.subject?.slug).toBe('social-studies');
    expect(p.entities.type?.slug).toBe('past-papers');
    expect(p.terms).toEqual([]);
  });

  it('keeps topic words as free text', () => {
    const p = parseQuery('photosynthesis p6 notes', index);
    expect(p.entities.class?.slug).toBe('p6');
    expect(p.entities.type?.slug).toBe('notes');
    expect(p.terms).toEqual(['photosynthesis']);
  });

  it('prefers the longest phrase', () => {
    const p = parseQuery('s2 integrated science scheme term 2 2026', index, expandNumberWords);
    expect(p.entities.subject?.slug).toBe('integrated-science');
    expect(p.entities.type?.slug).toBe('schemes-of-work');
    expect(p.entities.term?.slug).toBe('term-2');
    expect(p.entities.year).toBe(2026);
  });

  it('prefers an explicit term over the "end of term" alias', () => {
    const idx = buildPhraseIndex({
      ...vocab,
      types: [...vocab.types, e('past-papers-eot', 'EOT', ['end of term'])],
    });
    const p = parseQuery('primary six end of term ii examination 2026', idx, expandNumberWords);
    expect(p.entities.class?.slug).toBe('p6');
    expect(p.entities.term?.slug).toBe('term-2');
    expect(p.entities.year).toBe(2026);
  });

  it('detects advanced syntax', () => {
    expect(parseQuery('"acids and bases" -organic', index).advanced).toBe(true);
  });
});

describe('spelling correction', () => {
  const lex = buildCorrectionLexicon(vocab);
  it('corrects common misspellings', () => {
    expect(correctQuery('p6 chemstry', lex)).toBe('p6 chemistry');
    expect(correctQuery('mathematcs notes', lex)).toBe('mathematics notes');
    expect(correctQuery('p6 science', lex)).toBeNull();
  });
  it('computes transposition distance', () => {
    expect(editDistance('scinece', 'science')).toBe(1);
  });
});
