'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Expense, Rates } from '@/lib/money/compute';
import type { Trip } from '@/lib/sheet/types';
import { rateOf, type ExchangeKind, type ExchangeTotals } from '@/lib/money/exchange';
import { supabaseBrowser } from '@/lib/supabase/browser';
import {
  clearDropped,
  droppedCount,
  flush,
  getCachedTrip,
  pending,
  queue,
  readCached,
  setCachedTrip,
  writeCached,
  type Op,
} from '@/lib/offline/store';
import type { Person } from '@/lib/allowlist';
import { SORT_GAP, sortUpdates } from '@/lib/list/sort';
import { photoCheckKey, photosFor } from '@/lib/list/wish';
import { deleteFile, keepFilesOffline, uploadFile, type FileLink, type TripFile } from '@/lib/files/store';
import { RECEIPT_GRACE_MS, orphanReceipts } from '@/lib/files/orphans';

export interface Todo {
  id: string;
  label: string;
  due: string | null;
  url: string | null;
  sort: number;
}

export interface WishItem {
  id: string;
  label: string;
  sort: number;
  notes: string;
  url: string | null;
}

interface TripData {
  person: Person;
  trip: Trip | null;
  tripError: string | null;
  refreshing: boolean;
  refresh: (fresh?: boolean) => Promise<void>;
  online: boolean;
  unsynced: number;
  /** Changes the server refused for good (bad data), so they were never saved. 0 once seen. */
  dropped: number;
  clearDropped: () => void;
  expenses: Expense[];
  checks: Set<string>;
  wishlist: WishItem[];
  files: TripFile[];
  todos: Todo[];
  cashLeftJpy: number;
  /** Yen per ringgit for converting: the sheet's rate, and each person's cash rate once they've changed money. */
  rates: Rates | null;
  saveExpense: (e: Expense) => void;
  deleteExpense: (clientId: string) => void;
  /** An expense form closed without saving: its receipt photos can go. */
  forgetReceipts: (clientId: string) => void;
  toggleCheck: (key: string) => void;
  choose: (prefix: string, key: string) => void;
  addWish: (label: string) => void;
  removeWish: (id: string) => void;
  /** Saves a changed title, description or link (one write). */
  updateWish: (id: string, patch: Partial<Pick<WishItem, 'label' | 'notes' | 'url'>>) => void;
  /** A photo caption; saved offline and synced later. */
  setFileLabel: (fileId: string, label: string) => void;
  /** `ids` is the new order; `movedId` is the one item that was dragged or nudged. */
  reorderWish: (ids: string[], movedId: string) => void;
  setCashLeft: (jpy: number) => void;
  /**
   * Saves a person's cash exchange or Wise top-up totals to the sheet (`next` null clears them), only if
   * the sheet still has `expected`; `line` goes into its History. Needs a connection; returns an error message or null.
   */
  saveExchange: (
    kind: ExchangeKind,
    person: Person,
    change: { expected: ExchangeTotals; next: ExchangeTotals | null; line?: string },
  ) => Promise<string | null>;
  addStop: (stop: NewStopInput) => Promise<string | null>;
  /** Removes a stop that was added from the app. Needs a connection; returns an error message or null. */
  deleteStop: (stop: Pick<NewStopInput, 'day' | 'time' | 'title'>) => Promise<string | null>;
  /** Uploads a ticket, receipt or photo. Needs a connection; throws a readable message. */
  addFile: (file: File, link: FileLink) => Promise<TripFile>;
  removeFile: (f: TripFile) => Promise<void>;
  addTodo: (label: string, due: string | null) => void;
  removeTodo: (id: string) => void;
}

export interface NewStopInput {
  day: number;
  time: string;
  title: string;
  notes: string;
  /** Optional exact place, "Ichiran Shinsaibashi, Osaka". */
  place?: string;
  category: string;
  costJpy: number | null;
}

const Ctx = createContext<TripData | null>(null);

export function useTripData(): TripData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTripData outside provider');
  return v;
}

const uid = () => crypto.randomUUID();

/**
 * Expenses deleted (or new-expense forms abandoned) on this phone, with when: their receipts are
 * removed once that's final. Kept on the phone so it still happens after a restart or offline spell.
 */
const GONE_KEY = 'gone-expenses';
function readGone(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(GONE_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}
function writeGone(gone: Record<string, number>) {
  try {
    localStorage.setItem(GONE_KEY, JSON.stringify(gone));
  } catch {}
}

/**
 * Photos of shopping items deleted while offline (or whose removal failed). Their rows go with the
 * item, but the images in storage and on this phone need removing by hand once there's signal.
 */
const GONE_PHOTOS_KEY = 'gone-photos';
function readGonePhotos(): TripFile[] {
  try {
    return JSON.parse(localStorage.getItem(GONE_PHOTOS_KEY) ?? '[]') as TripFile[];
  } catch {
    return [];
  }
}
function writeGonePhotos(photos: TripFile[]) {
  try {
    localStorage.setItem(GONE_PHOTOS_KEY, JSON.stringify(photos));
  } catch {}
}

/** How long to wait before trying unsent changes again on a weak signal (navigator.onLine stays true). */
const RETRY_MS = 20_000;

const TABLES = ['expenses', 'checks', 'wishlist', 'trip_settings', 'files', 'todos'] as const;
type Table = (typeof TABLES)[number];

export function TripDataProvider({ person, children }: { person: Person; children: React.ReactNode }) {
  const sb = supabaseBrowser();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [tripError, setTripError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState(true);
  const [unsynced, setUnsynced] = useState(0);
  const [dropped, setDropped] = useState(0);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [checks, setChecks] = useState<Set<string>>(new Set());
  const [wishlist, setWishlist] = useState<WishItem[]>([]);
  const [files, setFiles] = useState<TripFile[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [cashLeftJpy, setCashLeftJpy] = useState(0);
  const loaded = useRef(false);
  // Bumped whenever a write (a new stop, the cash exchange) sets the trip, so an older refresh
  // that answers afterwards doesn't put the previous copy back.
  const tripVersion = useRef(0);

  const refresh = useCallback(
    async (fresh = false) => {
      setRefreshing(true);
      const version = tripVersion.current;
      try {
        const res = await fetch(`/api/trip${fresh ? '?fresh=1' : ''}`, { cache: 'no-store' });
        if (res.status === 401) {
          router.replace('/login');
          return;
        }
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not load the itinerary');
        const t = (await res.json()) as Trip;
        if (tripVersion.current !== version) return;
        setTrip(t);
        setTripError(null);
        await setCachedTrip(t);
      } catch (e) {
        setTripError(e instanceof Error ? e.message : 'Offline');
      } finally {
        setRefreshing(false);
      }
    },
    [router],
  );

  // Each table's latest load; an older one that answers late is ignored.
  const loadSeq = useRef<Partial<Record<Table, number>>>({});

  /** Reloads one table. True when the server answered (whether or not the answer was still needed). */
  const loadTable = useCallback(
    async (table: Table): Promise<boolean> => {
      // Unsynced local writes win until they're flushed.
      if ((await pending()) > 0) return false;
      const n = (loadSeq.current[table] ?? 0) + 1;
      loadSeq.current[table] = n;
      // Checked once the answer arrives: a change made meanwhile, or a newer load, must not be overwritten.
      const current = async () => loadSeq.current[table] === n && (await pending()) === 0;
      if (table === 'expenses') {
        const { data, error } = await sb.from('expenses').select('*').order('spent_on').order('created_at');
        if (data && (await current())) {
          const rows = data.map((r) => ({ ...r, amount: Number(r.amount) })) as Expense[];
          setExpenses(rows);
          await writeCached('expenses', rows);
        }
        return !error;
      } else if (table === 'checks') {
        const { data, error } = await sb.from('checks').select('key');
        if (data && (await current())) {
          const keys = data.map((r) => r.key as string);
          setChecks(new Set(keys));
          await writeCached('checks', keys);
        }
        return !error;
      } else if (table === 'wishlist') {
        const { data, error } = await sb.from('wishlist').select('id,label,sort,notes,url').order('sort').order('created_at');
        if (data && (await current())) {
          setWishlist(data as WishItem[]);
          await writeCached('wishlist', data);
        }
        return !error;
      } else if (table === 'files') {
        const { data, error } = await sb.from('files').select('*').order('created_at');
        if (data && (await current())) {
          setFiles(data as TripFile[]);
          await writeCached('files', data);
          void keepFilesOffline(sb, data as TripFile[]);
        }
        return !error;
      } else if (table === 'todos') {
        const { data, error } = await sb.from('todos').select('id,label,due,url,sort').order('sort').order('created_at');
        if (data && (await current())) {
          setTodos(data as Todo[]);
          await writeCached('todos', data);
        }
        return !error;
      } else {
        const { data, error } = await sb.from('trip_settings').select('cash_left_jpy').eq('id', 1).maybeSingle();
        if (data && (await current())) {
          setCashLeftJpy(Number(data.cash_left_jpy));
          await writeCached('cashLeft', Number(data.cash_left_jpy));
        }
        return !error;
      }
    },
    [sb],
  );

  // The latest expenses and files, for the receipt sweep (which runs from timers and after syncs).
  const expensesRef = useRef<Expense[]>([]);
  const filesRef = useRef<TripFile[]>([]);
  useEffect(() => {
    expensesRef.current = expenses;
    filesRef.current = files;
  }, [expenses, files]);
  // True once this phone has caught up with the server, so "no expense" really means none.
  const synced = useRef(false);

  /**
   * Delete receipts whose expense is gone (see orphanReceipts): the row, the image in storage and
   * this phone's copy. Needs signal and nothing waiting to sync; otherwise it tries again later.
   */
  const sweepReceipts = useCallback(async () => {
    if (!navigator.onLine || !synced.current || (await pending()) > 0) return;
    const have = new Set(expensesRef.current.map((e) => e.client_id));
    const gone = readGone();
    const stale = orphanReceipts(filesRef.current, have, gone, Date.now());
    // Forget marks for expenses that came back (Undo) or whose receipts are being cleared now.
    for (const id of Object.keys(gone)) if (have.has(id)) delete gone[id];
    if (stale.length) {
      const ids = new Set(stale.map((f) => f.id));
      setFiles((prev) => {
        const next = prev.filter((f) => !ids.has(f.id));
        void writeCached('files', next);
        return next;
      });
      const results = await Promise.all(
        stale.map((f) =>
          deleteFile(sb, f).then(
            () => true,
            () => false,
          ),
        ),
      );
      stale.forEach((f, i) => results[i] && f.expense_client_id && delete gone[f.expense_client_id]);
    }
    writeGone(gone);
  }, [sb]);

  const markGone = useCallback(
    (clientId: string) => {
      writeGone({ ...readGone(), [clientId]: Date.now() });
      setTimeout(() => void sweepReceipts(), RECEIPT_GRACE_MS + 1_000);
    },
    [sweepReceipts],
  );

  /** Removes the images of shopping-item photos deleted offline (see GONE_PHOTOS_KEY). */
  const sweepPhotos = useCallback(async () => {
    const gone = readGonePhotos();
    if (!gone.length || !navigator.onLine) return;
    const results = await Promise.all(
      gone.map((p) =>
        deleteFile(sb, p).then(
          () => true,
          () => false,
        ),
      ),
    );
    const done = new Set(gone.filter((_, i) => results[i]).map((p) => p.id));
    // Re-read: another item may have been deleted while these were going.
    writeGonePhotos(readGonePhotos().filter((p) => !done.has(p.id)));
  }, [sb]);

  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const syncRef = useRef<() => Promise<void>>(async () => {});

  const sync = useCallback(async () => {
    clearTimeout(retryTimer.current);
    const left = await flush(sb);
    setUnsynced(left);
    setDropped(await droppedCount());
    if (left === 0) {
      const loads = await Promise.all(TABLES.map(loadTable));
      // The receipt sweep trusts "no expense" only after expenses and files both loaded in this pass.
      synced.current = loads[TABLES.indexOf('expenses')] && loads[TABLES.indexOf('files')];
      void sweepReceipts();
      void sweepPhotos();
    } else if (navigator.onLine) {
      // A weak signal doesn't fire 'online' again, so try again on a timer.
      retryTimer.current = setTimeout(() => void syncRef.current(), RETRY_MS);
    }
  }, [sb, loadTable, sweepReceipts, sweepPhotos]);
  useEffect(() => {
    syncRef.current = sync;
    return () => clearTimeout(retryTimer.current);
  }, [sync]);

  // Boot: show cached copies instantly, then go to the network.
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    (async () => {
      const [t, e, c, w, cash, f, td] = await Promise.all([
        getCachedTrip(),
        readCached<Expense[]>('expenses'),
        readCached<string[]>('checks'),
        readCached<WishItem[]>('wishlist'),
        readCached<number>('cashLeft'),
        readCached<TripFile[]>('files'),
        readCached<Todo[]>('todos'),
      ]);
      if (f) setFiles(f);
      if (td) setTodos(td);
      if (t) setTrip(t);
      if (e) setExpenses(e);
      if (c) setChecks(new Set(c));
      if (w) setWishlist(w);
      if (cash !== undefined) setCashLeftJpy(cash);
      setUnsynced(await pending());
      setDropped(await droppedCount());
      setOnline(navigator.onLine);
      await Promise.all([refresh(), sync()]);
    })();
  }, [refresh, sync]);

  useEffect(() => {
    const up = () => {
      setOnline(true);
      void sync();
      void refresh();
    };
    const down = () => setOnline(false);
    // iOS pauses the realtime socket in the background and doesn't replay what was missed, so catch up on return.
    const visible = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      void sync();
      void refresh();
    };
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [sync, refresh]);

  useEffect(() => {
    const channel = sb.channel('trip-live');
    for (const table of TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => void loadTable(table));
    }
    // The first subscribe is covered by the boot sync; later ones are reconnects that may have missed changes.
    let first = true;
    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      if (!first) void sync();
      first = false;
    });
    return () => {
      void sb.removeChannel(channel);
    };
  }, [sb, loadTable, sync]);

  const enqueue = useCallback(
    async (op: Op) => {
      await queue(op);
      setUnsynced(await pending());
      if (navigator.onLine) void sync();
    },
    [sync],
  );

  const saveExpense = useCallback(
    (e: Expense) => {
      setExpenses((prev) => {
        const next = prev.some((x) => x.client_id === e.client_id)
          ? prev.map((x) => (x.client_id === e.client_id ? e : x))
          : [...prev, e];
        void writeCached('expenses', next);
        return next;
      });
      const row: Record<string, unknown> = { ...e };
      delete row.id;
      void enqueue({ id: uid(), table: 'expenses', kind: 'upsert', row });
    },
    [enqueue],
  );

  const deleteExpense = useCallback(
    (clientId: string) => {
      setExpenses((prev) => {
        const next = prev.filter((x) => x.client_id !== clientId);
        void writeCached('expenses', next);
        return next;
      });
      void enqueue({ id: uid(), table: 'expenses', kind: 'delete', clientId });
      // Its receipts go too, once the Undo has passed.
      markGone(clientId);
    },
    [enqueue, markGone],
  );

  const setCheck = useCallback(
    (key: string, on: boolean) => {
      setChecks((prev) => {
        const next = new Set(prev);
        if (on) next.add(key);
        else next.delete(key);
        void writeCached('checks', [...next]);
        return next;
      });
      void enqueue({ id: uid(), table: 'checks', kind: on ? 'upsert' : 'delete', key });
    },
    [enqueue],
  );

  const toggleCheck = useCallback((key: string) => setCheck(key, !checks.has(key)), [checks, setCheck]);

  const choose = useCallback(
    (prefix: string, key: string) => {
      const full = `${prefix}${key}`;
      const already = checks.has(full);
      checks.forEach((k) => k.startsWith(prefix) && setCheck(k, false));
      if (!already) setCheck(full, true);
    },
    [checks, setCheck],
  );

  const addWish = useCallback(
    (label: string) => {
      const row = { id: uid(), label, sort: (wishlist.at(-1)?.sort ?? 0) + SORT_GAP, notes: '', url: null };
      setWishlist((prev) => [...prev, row]);
      void enqueue({ id: uid(), table: 'wishlist', kind: 'upsert', row });
    },
    [wishlist, enqueue],
  );

  /** Save a new shopping-list order. Usually only the moved row is written. */
  const reorderWish = useCallback(
    (ids: string[], movedId: string) => {
      const changes = new Map(sortUpdates(wishlist, ids, movedId).map((u) => [u.id, u.sort]));
      if (!changes.size) return;
      const next = wishlist
        .map((w) => (changes.has(w.id) ? { ...w, sort: changes.get(w.id)! } : w))
        .sort((a, b) => a.sort - b.sort);
      setWishlist(next);
      void writeCached('wishlist', next);
      // Only the new position: replayed after the other phone deleted the item, it changes nothing.
      for (const w of next.filter((x) => changes.has(x.id)))
        void enqueue({ id: uid(), table: 'wishlist', kind: 'patch', rowId: w.id, fields: { sort: w.sort } });
    },
    [wishlist, enqueue],
  );

  const removeWish = useCallback(
    (id: string) => {
      const photos = photosFor(files, id);
      setWishlist((prev) => {
        const next = prev.filter((w) => w.id !== id);
        void writeCached('wishlist', next);
        return next;
      });
      setCheck(`wish:${id}`, false);
      for (const p of photos) if (checks.has(photoCheckKey(p.id))) setCheck(photoCheckKey(p.id), false);
      void enqueue({ id: uid(), table: 'wishlist', kind: 'delete', rowId: id });
      // The photo rows go with the item (on delete cascade); the image files in storage need removing by hand.
      if (photos.length) {
        const ids = new Set(photos.map((p) => p.id));
        setFiles((prev) => {
          const next = prev.filter((f) => !ids.has(f.id));
          void writeCached('files', next);
          return next;
        });
        // Remembered until removed, so an offline (or failed) removal is finished on a later sync.
        writeGonePhotos([...readGonePhotos(), ...photos]);
        if (navigator.onLine) void sweepPhotos();
      }
    },
    [files, checks, enqueue, setCheck, sweepPhotos],
  );

  const updateWish = useCallback(
    (id: string, patch: Partial<Pick<WishItem, 'label' | 'notes' | 'url'>>) => {
      const cur = wishlist.find((w) => w.id === id);
      if (!cur) return;
      // Copies cached before notes/url existed lack them.
      const row = { id, label: cur.label, sort: cur.sort, notes: cur.notes ?? '', url: cur.url ?? null, ...patch };
      const next = wishlist.map((w) => (w.id === id ? row : w));
      setWishlist(next);
      void writeCached('wishlist', next);
      // Only the changed fields: a stale copy here mustn't undo the other phone's rename or reorder,
      // or bring back an item it deleted.
      void enqueue({ id: uid(), table: 'wishlist', kind: 'patch', rowId: id, fields: patch });
    },
    [wishlist, enqueue],
  );

  const setFileLabel = useCallback(
    (fileId: string, label: string) => {
      setFiles((prev) => {
        const next = prev.map((f) => (f.id === fileId ? { ...f, label } : f));
        void writeCached('files', next);
        return next;
      });
      void enqueue({ id: uid(), table: 'files', kind: 'label', fileId, label });
    },
    [enqueue],
  );

  const setCashLeft = useCallback(
    (jpy: number) => {
      setCashLeftJpy(jpy);
      void writeCached('cashLeft', jpy);
      void enqueue({ id: uid(), table: 'trip_settings', kind: 'upsert', cashLeftJpy: jpy });
    },
    [enqueue],
  );

  /** Writes a person's cash exchange or Wise totals into the sheet's Payment tab. */
  const saveExchange = useCallback<TripData['saveExchange']>(async (kind, who, change) => {
    if (!navigator.onLine) return 'Saving this needs a connection. Try again when you have signal.';
    try {
      const res = await fetch('/api/cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, person: who, ...change }),
      });
      const body = await res.json().catch(() => ({}));
      // A conflict still sends the sheet's current totals, so the card shows what's really there.
      const fresh = (res.ok ? body : body.trip) as Trip | null | undefined;
      if (fresh?.days) {
        tripVersion.current++;
        setTrip(fresh);
        await setCachedTrip(fresh);
      }
      return res.ok ? null : (body.error ?? 'Could not save it');
    } catch {
      return 'Could not reach the server. Try again in a moment.';
    }
  }, []);

  const rates = useMemo<Rates | null>(() => {
    if (!trip) return null;
    // Older cached copies of the trip predate the cash exchange and Wise blocks.
    return {
      base: trip.jpyPerRm,
      cash: { alex: rateOf(trip.cashExchange?.alex), sam: rateOf(trip.cashExchange?.sam) },
      wise: { alex: rateOf(trip.wise?.alex), sam: rateOf(trip.wise?.sam) },
    };
  }, [trip]);

  /** Writes a new stop into the Google Sheet. Returns an error message, or null on success. */
  const addStop = useCallback(async (stop: NewStopInput): Promise<string | null> => {
    if (!navigator.onLine) return 'Adding stops needs a connection. Try again when you have signal.';
    try {
      const res = await fetch('/api/stops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stop),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return body.error ?? 'Could not add the stop';
      tripVersion.current++;
      setTrip(body as Trip);
      await setCachedTrip(body as Trip);
      return null;
    } catch {
      // The row may have gone in and only the answer got lost, so a blind retry could add it twice.
      return 'Could not confirm it was added. Check the day before trying again.';
    }
  }, []);

  const deleteStop = useCallback(async (stop: Pick<NewStopInput, 'day' | 'time' | 'title'>): Promise<string | null> => {
    if (!navigator.onLine) return 'Deleting stops needs a connection. Try again when you have signal.';
    try {
      const res = await fetch('/api/stops', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day: stop.day, time: stop.time, title: stop.title }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return body.error ?? 'Could not delete the stop';
      tripVersion.current++;
      setTrip(body as Trip);
      await setCachedTrip(body as Trip);
      return null;
    } catch {
      return 'Could not reach the sheet. Check your signal and try again.';
    }
  }, []);

  const addFile = useCallback(
    async (file: File, link: FileLink) => {
      if (!navigator.onLine)
        throw new Error('Uploading needs a connection. It is still on your phone, so add it again when you have signal.');
      const row = await uploadFile(sb, file, link);
      setFiles((prev) => {
        const next = [...prev.filter((x) => x.id !== row.id), row];
        void writeCached('files', next);
        return next;
      });
      return row;
    },
    [sb],
  );

  const removeFile = useCallback(
    async (f: TripFile) => {
      if (!navigator.onLine) throw new Error('Removing needs a connection.');
      await deleteFile(sb, f);
      setFiles((prev) => {
        const next = prev.filter((x) => x.id !== f.id);
        void writeCached('files', next);
        return next;
      });
      if (checks.has(photoCheckKey(f.id))) setCheck(photoCheckKey(f.id), false);
    },
    [sb, checks, setCheck],
  );

  const addTodo = useCallback(
    (label: string, due: string | null) => {
      const row = { id: uid(), label, due, url: null, sort: (todos.at(-1)?.sort ?? 0) + 1 };
      setTodos((prev) => {
        const next = [...prev, row];
        void writeCached('todos', next);
        return next;
      });
      void enqueue({ id: uid(), table: 'todos', kind: 'upsert', row });
    },
    [todos, enqueue],
  );

  const removeTodo = useCallback(
    (id: string) => {
      setTodos((prev) => {
        const next = prev.filter((t) => t.id !== id);
        void writeCached('todos', next);
        return next;
      });
      setCheck(`todo:${id}`, false);
      void enqueue({ id: uid(), table: 'todos', kind: 'delete', rowId: id });
    },
    [enqueue, setCheck],
  );

  const dismissDropped = useCallback(() => {
    setDropped(0);
    void clearDropped();
  }, []);

  const value = useMemo<TripData>(
    () => ({
      person,
      trip,
      tripError,
      refreshing,
      refresh,
      online,
      unsynced,
      dropped,
      clearDropped: dismissDropped,
      expenses,
      checks,
      wishlist,
      files,
      todos,
      cashLeftJpy,
      rates,
      saveExpense,
      deleteExpense,
      forgetReceipts: markGone,
      toggleCheck,
      choose,
      addWish,
      removeWish,
      updateWish,
      setFileLabel,
      reorderWish,
      setCashLeft,
      saveExchange,
      addStop,
      deleteStop,
      addFile,
      removeFile,
      addTodo,
      removeTodo,
    }),
    [
      person,
      trip,
      tripError,
      refreshing,
      refresh,
      online,
      unsynced,
      dropped,
      dismissDropped,
      expenses,
      checks,
      wishlist,
      files,
      todos,
      cashLeftJpy,
      rates,
      saveExpense,
      deleteExpense,
      markGone,
      toggleCheck,
      choose,
      addWish,
      removeWish,
      updateWish,
      setFileLabel,
      reorderWish,
      setCashLeft,
      saveExchange,
      addStop,
      deleteStop,
      addFile,
      removeFile,
      addTodo,
      removeTodo,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
