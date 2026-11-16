import type { TripFile } from './store';

/** How long after an expense is deleted before its receipts go: past the 5 s Undo, with room to spare. */
export const RECEIPT_GRACE_MS = 8_000;
/** A receipt whose expense never existed (a form closed without saving, on either phone) goes after this. */
export const ORPHAN_AFTER_MS = 3 * 86_400_000;

/**
 * Receipts to delete: their expense is gone, and either this phone deleted it (or closed its form
 * unsaved) at least RECEIPT_GRACE_MS ago, or the receipt is older than ORPHAN_AFTER_MS.
 * `gone` maps an expense's client_id to when it was deleted or abandoned here.
 */
export function orphanReceipts(
  files: TripFile[],
  expenseIds: ReadonlySet<string>,
  gone: Readonly<Record<string, number>>,
  now: number,
): TripFile[] {
  return files.filter((f) => {
    if (f.kind !== 'receipt' || !f.expense_client_id || expenseIds.has(f.expense_client_id)) return false;
    const at = gone[f.expense_client_id];
    if (at !== undefined && now - at >= RECEIPT_GRACE_MS) return true;
    const made = Date.parse(f.created_at);
    return Number.isFinite(made) && now - made >= ORPHAN_AFTER_MS;
  });
}
