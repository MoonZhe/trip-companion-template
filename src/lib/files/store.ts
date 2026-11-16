'use client';
import { clear, createStore, del, get, set } from 'idb-keyval';
import type { SupabaseClient } from '@supabase/supabase-js';

export const BUCKET = 'trip-files';

export type FileKind = 'ticket' | 'receipt' | 'photo' | 'wish';

export interface TripFile {
  id: string;
  kind: FileKind;
  stop_key: string | null;
  expense_client_id: string | null;
  trip_day: number | null;
  /** A shopping-list item this photo belongs to. */
  wish_id?: string | null;
  label: string;
  path: string;
  mime: string;
  created_at: string;
}

export type FileLink = Pick<TripFile, 'kind'> &
  Partial<Pick<TripFile, 'stop_key' | 'expense_client_id' | 'trip_day' | 'wish_id' | 'label'>>;

// Blobs get their own store so the itinerary cache stays small and quick to read.
const blobs = typeof indexedDB === 'undefined' ? undefined : createStore('trip-companion-files', 'blobs');

/** Remove every downloaded ticket, receipt and photo from this phone. */
export async function clearLocalFiles(): Promise<void> {
  if (blobs) await clear(blobs);
}

/** Phone photos are 3–5 MB; shrink them before upload. Tickets keep more detail so QR codes stay sharp. */
async function shrink(file: File, kind: FileKind): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  const max = kind === 'ticket' ? 2400 : 1800;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', kind === 'ticket' ? 0.92 : 0.82));
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}

export async function uploadFile(sb: SupabaseClient, file: File, link: FileLink): Promise<TripFile> {
  const body = await shrink(file, link.kind);
  const mime = body.type || file.type || 'application/octet-stream';
  const ext = mime === 'application/pdf' ? 'pdf' : mime.split('/')[1]?.replace('jpeg', 'jpg') || 'bin';
  const id = crypto.randomUUID();
  const path = `${link.kind}/${id}.${ext}`;

  const up = await sb.storage.from(BUCKET).upload(path, body, { contentType: mime, upsert: false });
  if (up.error) throw new Error(up.error.message);
  const row = {
    id,
    kind: link.kind,
    stop_key: link.stop_key ?? null,
    expense_client_id: link.expense_client_id ?? null,
    trip_day: link.trip_day ?? null,
    wish_id: link.wish_id ?? null,
    // Shopping photos start without a caption; the file name (IMG_1234) is no help there.
    label: (link.label ?? (link.kind === 'wish' ? '' : file.name.replace(/\.[^.]+$/, ''))).slice(0, 120),
    path,
    mime,
  };
  const { data, error } = await sb.from('files').insert(row).select().single();
  if (error) {
    await sb.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }
  // The phone's copy is only a cache (fileBlob downloads it again), so a full or flaky IndexedDB
  // mustn't report a saved upload as failed: a retry would add it twice.
  if (blobs) await set(id, body, blobs).catch(() => {});
  return data as TripFile;
}

/** The file's bytes: from this phone if we have them, otherwise downloaded once and kept. */
export async function fileBlob(sb: SupabaseClient, f: TripFile): Promise<Blob | null> {
  const local = blobs ? await get<Blob>(f.id, blobs) : undefined;
  if (local) return local;
  const { data } = await sb.storage.from(BUCKET).download(f.path);
  if (data && blobs) await set(f.id, data, blobs).catch(() => {});
  return data ?? null;
}

export async function hasLocalCopy(id: string): Promise<boolean> {
  return !!(blobs && (await get(id, blobs)));
}

export async function deleteFile(sb: SupabaseClient, f: TripFile): Promise<void> {
  const { error } = await sb.from('files').delete().eq('id', f.id);
  if (error) throw new Error(error.message);
  await sb.storage.from(BUCKET).remove([f.path]);
  if (blobs) await del(f.id, blobs);
}

/** Keep every file on the phone (tickets first) so they all open with no signal. */
export async function keepFilesOffline(sb: SupabaseClient, files: TripFile[]): Promise<void> {
  const order: FileKind[] = ['ticket', 'receipt', 'wish', 'photo'];
  const sorted = [...files].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  for (const f of sorted) {
    if (!(await hasLocalCopy(f.id))) await fileBlob(sb, f).catch(() => null);
  }
}
