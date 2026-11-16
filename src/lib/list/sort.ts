export const SORT_GAP = 1024;

export interface Sorted {
  id: string;
  sort: number;
}

/**
 * New sort values after `movedId` lands where it is in `order`. Only the moved item changes: it
 * takes a value between its new neighbours. When there's no room left between them, the whole list
 * is spaced out again (rare, and it leaves room for many more single-row moves).
 */
export function sortUpdates(items: Sorted[], order: string[], movedId: string): Sorted[] {
  const sortOf = new Map(items.map((w) => [w.id, w.sort]));
  const i = order.indexOf(movedId);
  if (i === -1) return [];
  const prev = i > 0 ? sortOf.get(order[i - 1]) : undefined;
  const next = i < order.length - 1 ? sortOf.get(order[i + 1]) : undefined;

  let sort: number | null = null;
  if (prev === undefined && next === undefined) sort = sortOf.get(movedId) ?? 0;
  else if (prev === undefined) sort = next! - SORT_GAP;
  else if (next === undefined) sort = prev + SORT_GAP;
  else if (next - prev > 1) sort = Math.floor((prev + next) / 2);
  // The order shown isn't always stored order (found items sit at the end), so the new value can
  // land on another item's. A tie sorts back by age after a reload, so space the list out instead.
  if (sort !== null && items.some((w) => w.id !== movedId && w.sort === sort)) sort = null;

  if (sort !== null) return sort === sortOf.get(movedId) ? [] : [{ id: movedId, sort }];
  return order.map((id, k) => ({ id, sort: (k + 1) * SORT_GAP })).filter((w) => w.sort !== sortOf.get(w.id));
}
