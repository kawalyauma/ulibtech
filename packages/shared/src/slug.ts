/** Convert arbitrary text to a URL-safe, lowercase, hyphenated slug. */
export function slugify(input: string, maxLength = 96): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  if (slug.length <= maxLength) return slug;
  const cut = slug.slice(0, maxLength);
  const lastDash = cut.lastIndexOf('-');
  return (lastDash > maxLength / 2 ? cut.slice(0, lastDash) : cut).replace(/-+$/g, '');
}

/** Human title from a file name: "p6_sst-term2 EXAM 2026.pdf" -> "P6 Sst Term2 Exam 2026". */
export function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]{1,5}$/i, '');
  return base
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => {
      if (/^[ps]\d$/i.test(w)) return w.toUpperCase();
      if (w.length <= 3 && w === w.toUpperCase()) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

/** Returns the file extension (lowercase, without dot) or empty string. */
export function fileExtension(fileName: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(fileName);
  return match?.[1]?.toLowerCase() ?? '';
}

/** Sanitises a user-supplied file name for Content-Disposition headers. */
export function safeDownloadName(name: string): string {
  return (
    name
      .replace(/[\r\n"\\/]+/g, ' ')
      .replace(/[^\x20-\x7e]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 150) || 'download'
  );
}
