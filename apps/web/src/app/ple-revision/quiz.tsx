'use client';
import { useState } from 'react';
type Question = { prompt: string; options: string[]; answer: number; reason: string };

export function Quiz({ questions }: { questions: Question[] }) {
  const [score, setScore] = useState<number | null>(null);
  const [choices, setChoices] = useState<number[]>([]);
  return (
    <form
      className="mt-4 space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        setScore(questions.filter((q, i) => q.answer === choices[i]).length);
      }}
      onReset={() => {
        setChoices([]);
        setScore(null);
      }}
    >
      {questions.map((q, i) => (
        <fieldset key={q.prompt} className="bg-card rounded-xl border p-4">
          <legend className="px-1 font-semibold">
            {i + 1}. {q.prompt}
          </legend>
          {q.options.map((option, j) => (
            <label key={option} className="flex cursor-pointer items-center gap-3 py-2">
              <input
                type="radio"
                required
                name={'question-' + i}
                value={j}
                checked={choices[i] === j}
                onChange={() => {
                  const next = choices.slice();
                  next[i] = j;
                  setChoices(next);
                  setScore(null);
                }}
              />
              {option}
            </label>
          ))}
          {score !== null && (
            <p className="mt-2 border-t pt-3">
              <strong>
                {choices[i] === q.answer ? 'Correct.' : 'Answer: ' + q.options[q.answer] + '.'}
              </strong>{' '}
              {q.reason}
            </p>
          )}
        </fieldset>
      ))}
      <div className="flex gap-4">
        <button
          type="submit"
          className="bg-primary text-primary-foreground rounded-lg px-5 py-2 font-semibold"
        >
          Mark my answers
        </button>
        <button type="reset" className="underline">
          Start again
        </button>
      </div>
      <p role="status" className="font-semibold">
        {score === null ? '' : 'Your score: ' + score + ' out of ' + questions.length + '.'}
      </p>
    </form>
  );
}
