'use client';
import { clear, createStore, get, set } from 'idb-keyval';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Trip } from '@/lib/sheet/types';
import { isPermanentRejection } from './rejection';

const db = typeof indexedDB === 'undefined' ? undefined : createStore('trip-companion', 'kv');

export async function readCached<T>(key: string): Promise<T | undefined> {
  return db ? get<T>(key, db) : undefined;
}
/** Saves a cached copy. A failed write (storage full, iOS dropped the connection) only costs the offline copy. */
export async function writeCached<T>(key: string, value: T): Promise<void> {
  try {
    if (db) await set(key, value, db);
  } catch (e) {
    console.warn('[cache] not saved', key, e);
  }
}

/** Remove the cached itinerary, expenses and unsent changes from this phone. */
export async function clearCache(): Promise<void> {
  unsaved = [];
  if (db) await clear(db);
}

export const getCachedTrip = () => readCached<Trip>('trip');
export const setCachedTrip = (t: Trip) => writeCached('trip', t);

/** Writes that could not reach Supabase yet. Replayed in order when back online. */
export type Op =
  | { id: string; table: 'expenses'; kind: 'upsert'; row: Record<string, unknown> }
  | { id: string; table: 'expenses'; kind: 'delete'; clientId: string }
  | { id: string; table: 'checks'; kind: 'upsert'; key: string }
  | { id: string; table: 'checks'; kind: 'delete'; key: string }
  | {
      id: string;
      table: 'wishlist';
      kind: 'upsert';
      row: { id: string; label: string; sort: number; notes: string; url: string | null };
    }
  // Edits and reorders send only the changed fields, and do nothing if the other phone deleted the item.
  | {
      id: string;
      table: 'wishlist';
      kind: 'patch';
      rowId: string;
      fields: Partial<{ label: string; sort: number; notes: string; url: string | null }>;
    }
  | { id: string; table: 'wishlist'; kind: 'delete'; rowId: string }
  | { id: string; table: 'files'; kind: 'label'; fileId: string; label: string }
  | { id: string; table: 'trip_settings'; kind: 'upsert'; cashLeftJpy: number }
  // Legacy: the cash exchange briefly lived in Supabase; it's in the sheet now. Kept so a queued op still replays.
  | { id: string; table: 'trip_settings'; kind: 'cash_exchange'; rmPaid: number | null; jpyGot: number | null }
  | {
      id: string;
      table: 'todos';
      kind: 'upsert';
      row: { id: string; label: string; due: string | null; url: string | null; sort: number };
    }
  | { id: string; table: 'todos'; kind: 'delete'; rowId: string };

// Every read-modify-write of the outbox goes through this chain, so ops queued
// in the same instant (e.g. reordering a list) can't overwrite each other.
let outboxLock: Promise<unknown> = Promise.resolve();
function withOutbox<T>(fn: () => Promise<T>): Promise<T> {
  const run = outboxLock.then(fn, fn);
  outboxLock = run.catch(() => {});
  return run;
}

// Ops IndexedDB refused to store (storage full, or iOS dropped the connection after backgrounding).
// They're kept in memory so they still sync while the app stays open, instead of vanishing.
let unsaved: Op[] = [];

async function storedOps(): Promise<Op[]> {
  return db ? ((await get<Op[]>('outbox', db)) ?? []) : [];
}

export function queue(op: Op): Promise<void> {
  return withOutbox(async () => {
    try {
      if (!db) throw new Error('No IndexedDB');
      await set('outbox', [...(await storedOps()), op], db);
    } catch {
      unsaved.push(op);
    }
  });
}

async function allOps(): Promise<Op[]> {
  const stored = await storedOps().catch(() => [] as Op[]);
  return [...stored, ...unsaved];
}

export async function pending(): Promise<number> {
  return (await allOps()).length;
}

/** How many queued changes the server refused for good since this was last cleared. */
export async function droppedCount(): Promise<number> {
  return (await readCached<number>('dropped').catch(() => undefined)) ?? 0;
}
export const clearDropped = () => writeCached('dropped', 0);

async function run(sb: SupabaseClient, op: Op) {
  switch (op.table) {
    case 'expenses':
      return op.kind === 'upsert'
        ? sb.from('expenses').upsert(op.row, { onConflict: 'client_id' })
        : sb.from('expenses').delete().eq('client_id', op.clientId);
    case 'checks':
      return op.kind === 'upsert' ? sb.from('checks').upsert({ key: op.key }) : sb.from('checks').delete().eq('key', op.key);
    case 'wishlist':
      if (op.kind === 'patch') return sb.from('wishlist').update(op.fields).eq('id', op.rowId);
      return op.kind === 'upsert' ? sb.from('wishlist').upsert(op.row) : sb.from('wishlist').delete().eq('id', op.rowId);
    case 'files':
      return sb.from('files').update({ label: op.label }).eq('id', op.fileId);
    case 'todos':
      return op.kind === 'upsert' ? sb.from('todos').upsert(op.row) : sb.from('todos').delete().eq('id', op.rowId);
    case 'trip_settings':
      return op.kind === 'cash_exchange'
        ? sb.from('trip_settings').upsert({ id: 1, cash_rm_paid: op.rmPaid, cash_jpy_got: op.jpyGot })
        : sb.from('trip_settings').upsert({ id: 1, cash_left_jpy: op.cashLeftJpy });
  }
}

let flushing: Promise<number> | null = null;

/** Replays queued writes; stops at the first failure that may pass (no signal, expired token). Returns how many remain. */
export function flush(sb: SupabaseClient): Promise<number> {
  flushing ??= (async () => {
    try {
      let ops = await allOps();
      while (ops.length) {
        const { error, status } = await run(sb, ops[0]);
        if (error && !isPermanentRejection({ status, code: error.code })) break;
        // Rejected for good (e.g. bad data): dropped so it can't block the queue, and counted so the phone can say so.
        if (error) {
          console.warn('[outbox] dropped', ops[0], error.message);
          await writeCached('dropped', (await droppedCount()) + 1);
        }
        const doneId = ops[0].id;
        ops = await withOutbox(async () => {
          unsaved = unsaved.filter((o) => o.id !== doneId);
          const stored = await storedOps();
          const rest = stored.filter((o) => o.id !== doneId);
          if (db && rest.length !== stored.length) await set('outbox', rest, db);
          return [...rest, ...unsaved];
        });
      }
      return ops.length;
    } catch {
      return pending();
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}
