import 'server-only';
import { getLanding } from './api';
import { first, type RawSearchParams } from './search-params';

export function landingParams(sp: RawSearchParams) {
  const page = Math.max(1, Math.min(1000, Number(first(sp.page)) || 1));
  const values = {
    term: first(sp.term),
    year: first(sp.year),
    fileType: first(sp.fileType),
    sort: first(sp.sort),
  };
  return { page, values };
}

export async function loadLanding(path: string, sp: RawSearchParams) {
  const { page, values } = landingParams(sp);
  const data = await getLanding(path, {
    page: String(page),
    term: values.term,
    year: values.year,
    fileType: values.fileType,
    sort: values.sort,
  });
  return { data, page, values };
}
