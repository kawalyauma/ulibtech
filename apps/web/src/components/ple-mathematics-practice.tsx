import Link from 'next/link';

const questions = [
  {
    topic: 'Fraction of a quantity',
    question: 'A class has 56 pupils. Three eighths of them walk to school. How many pupils walk?',
    working: '56 ÷ 8 = 7, and 7 × 3 = 21.',
    answer: '21 pupils',
  },
  {
    topic: 'Adding fractions',
    question:
      'A cook uses ⅔ kg of flour for bread and ¾ kg for chapati. How much flour is used in total?',
    working: 'Use twelfths. ⅔ = 8/12 and ¾ = 9/12. Add to get 17/12 kg, or 1 and 5/12 kg.',
    answer: '1 and 5/12 kg',
  },
  {
    topic: 'Decimal to fraction',
    question: 'Write 0.375 as a fraction in its simplest form.',
    working: '0.375 = 375/1,000. Divide the numerator and denominator by 125 to get 3/8.',
    answer: '⅜',
  },
  {
    topic: 'Proportion',
    question: 'Five pens cost UGX 3,500. At the same price per pen, how much do eight pens cost?',
    working: 'One pen costs UGX 3,500 ÷ 5 = UGX 700. Eight cost UGX 700 × 8 = UGX 5,600.',
    answer: 'UGX 5,600',
  },
  {
    topic: 'Percentage discount',
    question:
      'A school bag costs UGX 40,000. The shop gives a 15% discount. What is the new price?',
    working: '15% of UGX 40,000 is UGX 6,000. Subtract it from UGX 40,000 to get UGX 34,000.',
    answer: 'UGX 34,000',
  },
];

export function PleMathematicsPractice() {
  return (
    <section
      aria-labelledby="ple-maths-practice"
      className="bg-card mb-6 rounded-xl border p-4 sm:p-5"
    >
      <h2 id="ple-maths-practice" className="text-lg font-semibold">
        PLE Mathematics practice with worked answers
      </h2>
      <p className="text-muted-foreground mt-2 max-w-prose text-sm">
        Start with five original NotesUG questions on fractions, decimals, proportion and
        percentages. Write down each step before opening the answer. The past papers are listed
        below.
      </p>
      <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm">
        {questions.map(({ topic, question, working, answer }) => (
          <li key={topic}>
            <p>
              <strong>{topic}.</strong> {question}
            </p>
            <details className="mt-1">
              <summary className="text-primary cursor-pointer font-medium">
                Show worked answer
              </summary>
              <p className="mt-1">
                {working} <strong>Answer: {answer}.</strong>
              </p>
            </details>
          </li>
        ))}
      </ol>
      <section aria-labelledby="ple-data-handling" className="mt-6 border-t pt-4">
        <h3 id="ple-data-handling" className="font-semibold">
          Data handling: compare two reading groups
        </h3>
        <p className="mt-2 text-sm">
          In this original NotesUG exercise, each number shows how many books one pupil read in a
          month. In the Mango group the counts are 4, 2, 7, 4 and 3. In the Pawpaw group they are 3,
          5, 4, 3 and 5.
        </p>
        <p className="mt-2 text-sm">
          Which group has the greater mean? Which has the greater range? Find the median and mode of
          the Mango group as a check.
        </p>
        <details className="mt-2 text-sm">
          <summary className="text-primary cursor-pointer font-medium">
            Check the reading groups answer
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              Each group read 20 books between five pupils. Both means are 20 ÷ 5 = 4 books per
              pupil.
            </li>
            <li>
              Mango ranges from 2 to 7, so its range is 7 − 2 = 5 books. Pawpaw ranges from 3 to 5,
              so its range is 2 books. Mango has the greater spread despite the equal means.
            </li>
            <li>
              Put Mango in order: 2, 3, 4, 4, 7. The middle value is 4 (the median), and 4 occurs
              most often (the mode).
            </li>
          </ol>
        </details>
      </section>
      <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <Link href="/p7/mathematics/marking-guides" className="text-primary underline">
          Browse P7 Mathematics marking guides
        </Link>
        <a
          href="https://ncdc.go.ug/wp-content/uploads/2024/07/PRIMARY-SEVEN-SET-ONE.pdf"
          className="text-primary underline"
        >
          NCDC Primary Seven Curriculum, Mathematics Topics 5 and 7
        </a>
      </p>
    </section>
  );
}
