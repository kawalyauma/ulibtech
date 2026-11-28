import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTaxonomy } from '@/lib/api';
import { loadLanding } from '@/lib/landing';
import type { RawSearchParams } from '@/lib/search-params';
import { LandingView, landingMetadata } from '@/components/landing-view';
import { PleMathematicsPractice } from '@/components/ple-mathematics-practice';

const PLE_MATHS_PATH = '/p7/mathematics/past-papers';

/**
 * Classification landing pages generated from taxonomy, e.g.
 *   /past-papers, /p7/past-papers, /p6/science, /p6/science/past-papers, /p6/science/past-papers/2026
 */
export const revalidate = 300;

type Props = { params: Promise<{ segments: string[] }>; searchParams: Promise<RawSearchParams> };

function pathOf(segments: string[]) {
  return `/${segments.map((s) => decodeURIComponent(s).toLowerCase()).join('/')}`;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { segments } = await params;
  const { data, page } = await loadLanding(pathOf(segments), await searchParams).catch(() => ({
    data: null,
    page: 1,
  }));
  if (!data) return { title: 'Page not found', robots: { index: false } };
  const metadata = landingMetadata(data, page);
  if (data.landing.path === PLE_MATHS_PATH && page === 1 && !data.landing.noindex) {
    return {
      ...metadata,
      title: 'P7 Mathematics Past Papers and PLE Practice',
      description:
        'Browse free P7 Mathematics past papers and practise fractions, decimals, proportion and percentages with five worked answers.',
    };
  }
  return metadata;
}

function MagnetPractice() {
  return (
    <section
      aria-labelledby="p7-magnets"
      className="bg-card mb-6 space-y-3 rounded-xl border p-4 text-sm sm:p-5"
    >
      <h2 id="p7-magnets" className="text-lg font-semibold">
        P7 Science practice: what will a magnet pick up?
      </h2>
      <p>
        Original NotesUG practice. A pupil brings the same bar magnet close to three objects on a
        desk. Use the observations to answer the questions.
      </p>
      <table className="w-full max-w-md text-left">
        <caption className="sr-only">The pupil’s observations</caption>
        <thead>
          <tr>
            <th scope="col">Object</th>
            <th scope="col">What happened</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Small iron nail</td>
            <td>Moved towards the magnet</td>
          </tr>
          <tr>
            <td>Piece of aluminium foil</td>
            <td>Stayed still</td>
          </tr>
          <tr>
            <td>Dry wooden stick</td>
            <td>Stayed still</td>
          </tr>
        </tbody>
      </table>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Which object showed magnetic attraction?</li>
        <li>
          A pupil says a magnet picks up every metal. Which observation challenges that claim?
        </li>
        <li>Why start with the magnet the same distance from each object?</li>
        <li>Two bar magnets are free to move with their north poles facing. What will they do?</li>
        <li>
          How could you separate small iron nails from dry wood shavings without picking out each
          nail by hand?
        </li>
      </ol>
      <details>
        <summary className="text-primary cursor-pointer font-medium">
          Check the five answers
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>The iron nail moved towards the magnet.</li>
          <li>Aluminium is a metal, yet the foil stayed still in this test.</li>
          <li>
            Magnetic pull changes with distance. Keeping the starting gap equal makes the comparison
            fairer.
          </li>
          <li>They repel. Two north poles push apart.</li>
          <li>
            Pass a magnet over the mixture. Lift out the nails that stick to it and leave the
            shavings behind.
          </li>
        </ol>
      </details>
      <a
        className="text-primary inline-block underline"
        href="https://ncdc.go.ug/wp-content/uploads/2024/07/PRIMARY-SEVEN-SET-ONE.pdf#page=89"
      >
        NCDC Primary Seven Curriculum · Integrated Science · Magnetism
      </a>
    </section>
  );
}

export default async function LandingPage({ params, searchParams }: Props) {
  const { segments } = await params;
  if (segments.length > 4) notFound();
  const [{ data, page, values }, taxonomy] = await Promise.all([
    loadLanding(pathOf(segments), await searchParams),
    getTaxonomy().catch(() => null),
  ]);
  if (!data) notFound();
  let practice;
  if (page === 1 && !Object.values(values).some(Boolean)) {
    if (data.landing.path === PLE_MATHS_PATH) practice = <PleMathematicsPractice />;
    if (data.landing.path === '/p7/science') practice = <MagnetPractice />;
  }
  return (
    <LandingView data={data} taxonomy={taxonomy} page={page} values={values} extra={practice} />
  );
}
