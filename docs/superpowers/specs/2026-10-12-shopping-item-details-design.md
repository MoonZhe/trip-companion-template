# Shopping list: item details (title, description, photos, link)

Date: 12 Oct 2026 · Status: approved in chat, awaiting spec review

## Why

Alex and Sam want to use the Shopping list (Money → Shopping) in shops in Japan:

- **Show staff / spot it:** a photo of the exact product to show staff or match on the shelf.
- **Notes while comparing:** model numbers, sizes, price limits, Japanese search terms.
- **Look up online:** a link to the product or shop page.

Sam will put many product photos on one item (e.g. "Don Don Don DONKI") and work through them in the store.

## What it does

- Every item has a **title** (the existing `label`), an optional **description**, an optional **website link**, and **any number of photos** (camera or gallery).
- Each photo has an optional **caption** and its own **✓ found** tick.
- The item's own tick stays **manual only**. Photo ticks never tick the item. The row shows "3/8 found" for information.
- Adding a photo needs signal (same as tickets today). Viewing photos, ticking, and editing text all work offline. Text edits and ticks are queued and synced later.
- Both people can edit everything (existing RLS: the two allowlisted users).

## Data

One migration, `supabase/migrations/20261012010000_wish_details.sql`:

- `wishlist`: add `notes text not null default '' check (length(notes) <= 2000)` and `url text check (url is null or length(url) <= 500)`.
- `files`: allow `kind = 'wish'` (replace the kind check constraint), add `wish_id uuid references public.wishlist(id) on delete cascade` and an index on it.
- One-off conversion of existing labels in the "Name — details" format: `label` = the text before " — ", `notes` = the text after it (only rows whose label contains " — ").

Photos use the existing private `trip-files` bucket under `wish/<id>.jpg`. They're shrunk like photos (1800 px, JPEG 0.82). The caption is `files.label`, which defaults to '' for wish photos and isn't taken from the file name. A photo's tick is a `checks` row with key `wishimg:<file id>`. Ticks are removed when the photo is deleted, and the item tick `wish:<id>` is unchanged.

The `wishlist.label` limit of 120 stays.

## Code

- `src/lib/files/store.ts`: add `'wish'` to `FileKind` and `wish_id` to `TripFile` / `FileLink`. Use an empty default label for `wish`, and order offline downloads as ticket, receipt, wish, photo.
- `src/lib/offline/store.ts`: the wishlist upsert row type gains `notes` and `url`. Add a `files` op `{ table: 'files', kind: 'label', id, label }`, which runs `update files set label` so captions save offline.
- `src/components/providers/TripData.tsx`:
  - `WishItem` gains `notes` and `url`, and the select reads `id,label,sort,notes,url`.
  - New `updateWish(id, patch)` writes one upsert per change.
  - New `setFileLabel(id, label)`.
  - `removeWish` also clears the `wishimg:` ticks of that item's photos. Storage cleanup happens through `removeFile` for each photo, because the DB cascade can't delete storage objects.
- `src/lib/list/wish.ts` (new, pure):
  - `photosFor(files, wishId)` returns the photos sorted by `created_at`.
  - `foundCount(photos, checks)` returns `{ found, total }`.
  - `hostOf(url)` returns the short "host ↗" link text.
- `src/components/money/ShoppingList.tsx`:
  - The row shows a 44 px rounded thumbnail of the first photo (only when the item has photos).
  - Below the title there's one grey line: "3/8 found" when the item has photos, otherwise the first line of `notes`.
  - The tick circle and the drag grip behave as they do now. Tapping the title area opens the detail sheet, and ticking happens on the circle only.
  - `WishLabel` "Name — details" parsing is removed, because the migration converts those labels.
- `src/components/money/WishSheet.tsx` (new), built on `ui/Sheet.tsx` and following the theme:
  - title input (≤120) and description textarea; both save on blur, and only when changed
  - link input (validated as http/https, shown as a `host ↗` link that opens in a new tab)
  - photo grid, 3 per row:
    - each tile has a ✓ found toggle and a caption field (≤120, saved on blur)
    - **+ Add photo** uses `<input type="file" accept="image/*" multiple>`, so phones offer both camera and gallery; uploads run one at a time with a small per-tile spinner
    - offline, the add button is disabled with the hint "Needs signal to add photos"
    - deleting a photo asks for confirmation (inline "Delete?" on the tile)
  - tapping a photo opens it full screen (theme-matched dark backdrop, caption below, swipe or arrows to the next photo) for showing staff
  - delete item at the bottom, with a confirmation

Floating buttons must not cover the sheet's inputs. Check the bottom of the sheet with the keyboard open.

## Not doing

- Fetching link preview images automatically.
- Tracking prices or photos of what was bought.
- Reordering photos (they're shown oldest first).

## Testing

- Unit (vitest): `foundCount`, `photosFor`, `hostOf`, and the migration's label split rule, mirrored in a small pure helper used by the tests.
- Phone-size check (375 px) in the Browser pane through a throwaway `src/app/auth/zz-*` harness page, deleted afterwards:
  - list rows with and without photos
  - the sheet in light and dark mode
  - full-screen viewer
  - the offline state of the add-photo button
  - nothing overlapping inputs
- `pnpm build` passes, `tsc` passes, and lint passes on the touched files.
- After deploy: confirm that the converted watch items read correctly in the live app.
