/** Pure helpers for shopping-list items and their photos. */

interface PhotoLike {
  id: string;
  kind: string;
  wish_id?: string | null;
  created_at: string;
}

/** The item's photos, oldest first. */
export function photosFor<T extends PhotoLike>(files: T[], wishId: string): T[] {
  return files.filter((f) => f.kind === 'wish' && f.wish_id === wishId).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export const photoCheckKey = (fileId: string) => `wishimg:${fileId}`;

/** How many of the item's photos are ticked as found. */
export function foundCount(photos: { id: string }[], checks: Set<string>): { found: number; total: number } {
  return { found: photos.filter((p) => checks.has(photoCheckKey(p.id))).length, total: photos.length };
}

/** A valid http(s) link, trimmed, or null. A bare "example.com" gets https:// added. */
export function cleanUrl(raw: string): string | null {
  const s = raw.trim();
  // Browsers (unlike Node) accept "https://not a url", so spaces are ruled out here.
  if (!s || /\s/.test(s)) return null;
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.') ? u.href : null;
  } catch {
    return null;
  }
}

/** Short link text, e.g. "casio.com". */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Not-found ids first, then found ones; each group keeps its order. */
export function foundLast(ids: string[], isFound: (id: string) => boolean): string[] {
  return [...ids.filter((id) => !isFound(id)), ...ids.filter(isFound)];
}

/** Most characters the item's links may take together (the `url` column's limit). */
export const LINKS_MAX = 4000;

/** The item's links, one per line in `url`. Anything that isn't http(s) is dropped, as each one renders as a tappable link. */
export function linksOf(url: string | null | undefined): string[] {
  return (url ?? '')
    .split('\n')
    .map(cleanUrl)
    .filter((s): s is string => s !== null);
}

/** Links back into the `url` column: one per line, duplicates dropped, null when none. */
export function joinLinks(links: string[]): string | null {
  return [...new Set(links)].join('\n') || null;
}
