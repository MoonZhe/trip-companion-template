import { describe, expect, it } from 'vitest';
import { ORPHAN_AFTER_MS, RECEIPT_GRACE_MS, orphanReceipts } from '@/lib/files/orphans';
import type { TripFile } from '@/lib/files/store';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const file = (id: string, expense: string | null, kind: TripFile['kind'] = 'receipt', ageMs = 60_000): TripFile => ({
  id,
  kind,
  stop_key: null,
  expense_client_id: expense,
  trip_day: null,
  label: 'Receipt 1',
  path: `p/${id}`,
  mime: 'image/jpeg',
  created_at: new Date(NOW - ageMs).toISOString(),
});

describe('orphanReceipts', () => {
  it('keeps receipts whose expense exists', () => {
    expect(orphanReceipts([file('a', 'e1')], new Set(['e1']), { e1: NOW - 60_000 }, NOW)).toEqual([]);
  });
  it('waits out the Undo before removing a deleted expense’s receipts', () => {
    const files = [file('a', 'e1')];
    expect(orphanReceipts(files, new Set(), { e1: NOW - 2_000 }, NOW)).toEqual([]);
    expect(orphanReceipts(files, new Set(), { e1: NOW - RECEIPT_GRACE_MS }, NOW).map((f) => f.id)).toEqual(['a']);
  });
  it('leaves a receipt on a form still being filled in (no expense yet, not marked gone)', () => {
    expect(orphanReceipts([file('a', 'new')], new Set(), {}, NOW)).toEqual([]);
  });
  it('clears receipts with no expense after a few days', () => {
    expect(orphanReceipts([file('a', 'lost', 'receipt', ORPHAN_AFTER_MS)], new Set(), {}, NOW).map((f) => f.id)).toEqual(['a']);
  });
  it('never touches tickets or photos', () => {
    const old = ORPHAN_AFTER_MS * 2;
    expect(orphanReceipts([file('t', null, 'ticket', old), file('p', null, 'photo', old)], new Set(), {}, NOW)).toEqual([]);
  });
});
