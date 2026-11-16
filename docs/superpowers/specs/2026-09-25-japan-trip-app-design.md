# Japan 2026 Trip Companion — Design

**Date:** 2026-09-25
**Users:** Alex (alex@example.com) and Sam (sam@example.com) — nobody else
**Trip:** Sat 24 Oct – Mon 2 Nov 2026 · Osaka → Kyoto (Kameoka) → Tokyo

## 1. Goal

A private, phone-first web app that makes the trip itinerary effortless to follow while travelling and tired, and lets the two of us log expenses and see what we actually spent.

Non-goals: editing or deleting existing itinerary rows inside the app, multi-trip support, public sharing, native apps.

## 2. Architecture

| Piece | Choice |
|---|---|
| App | Next.js (latest stable, App Router, TypeScript), Tailwind CSS |
| Hosting | Vercel project `japan-2026`, linked to GitHub `your-github-user/trip-companion` (auto-deploy on push), functions region `hnd1` (Tokyo) |
| Database / auth | Supabase project `japan-2026`, region `ap-northeast-1` (Tokyo) |
| Itinerary source | The existing Google Sheet (source of truth), read server-side |
| Offline | PWA (Serwist service worker) + IndexedDB outbox |

```
Phone (PWA) ──► Next.js on Vercel ──► Google Sheets API (service account, read-only)
      │                  │
      │                  └──► Supabase (auth, expenses, checks, wishlist, sheet snapshot)
      └── IndexedDB (cached itinerary, offline expense outbox)
```

### 2.1 Itinerary sync (sheet is master)

- Server reads tabs `📅 Itinerary`, `🏨 Hotels`, `🗾 Overview`, `💰 Budget`, `Payment` plus the named range `JPY_PER_RM` using the service account (`GOOGLE_SERVICE_ACCOUNT_JSON`, base64, server-only env var).
- Cached for **5 minutes** (Next.js revalidate). Pull-to-refresh forces a fresh read.
- **Parsing is header-based:** columns are located by header text in row 2 (with aliases, e.g. `Activity / Location` | `Activity` | `Location`), never by position.
- **Day header rows** matched by pattern `DAY <n> · <date> · <city>`; option rows by `[Option X]`; the "CHOOSE ONE" banner row is recognised and not shown as a stop.
- Rows that fail to parse are skipped individually; one bad row never hides a day.
- On every successful parse the result is upserted to `sheet_snapshot`. If the fetch or parse fails (sheet unreachable, required header missing), the app serves the last snapshot and shows a small "Showing saved version · sheet format changed" notice.
- The app renders only what the sheet contains. It adds no itinerary content of its own.

### 2.2 Adding unplanned stops (write-back)

- Any day has an **Add a stop** button (name, time, type, optional cost/notes). `POST /api/stops` inserts a row into that day in the Itinerary tab **in time order**, copying a neighbouring stop row's styling, with tips prefixed "Added on the go." and the standard RM formula.
- Uses the same service account with the `spreadsheets` (write) scope; requires a connection (not queued offline).
- Expenses for unplanned things need nothing special: log them with a note.

### 2.3 Stable stop keys

Each stop gets a key `d<day>-<HHMM>-<slug(activity)>` used for "done" checks. Editing a stop's title or time in the sheet orphans its check (acceptable; it simply appears unchecked).

## 3. Authentication & access

- Supabase Auth with **Google OAuth** (primary) and **email magic link** (backup).
- **Public sign-ups disabled.** Exactly two users are pre-created by a one-off local setup script (service-role key used locally only, never deployed). Google sign-in links to the pre-created user by verified email.
- Defence in depth:
  1. Next.js middleware: no session, or email not in `ALLOWED_EMAILS` → redirect to `/login`.
  2. Postgres RLS on every table: `is_allowed()` = `auth.jwt()->>'email'` exists in `allowed_emails`.
- Google OAuth client created in the existing Google Cloud project (`<your-gcp-project>`); redirect URI = Supabase callback.

## 4. Data model (Supabase)

```sql
allowed_emails (email text primary key)                 -- 2 rows

expenses (
  id uuid pk default gen_random_uuid(),
  client_id uuid unique not null,          -- generated on device; dedupes offline retries
  spent_on date not null,                  -- trip day
  amount numeric(12,2) not null check (amount > 0),
  currency text not null check (currency in ('JPY','MYR')),
  category text not null check (category in ('food','transport','activities','shopping','hotel','other')),
  paid_by text not null check (paid_by in ('alex','sam')),          -- whose money it was
  paid_with text not null default 'cash' check (paid_with in ('wise','cash','card')),
  for_whom text not null default 'shared' check (for_whom in ('shared','alex','sam')),
  note text,
  created_by uuid references auth.users not null default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
)

checks (
  key text primary key,                    -- stop key or 'wish:<id>'
  checked_by uuid references auth.users,
  checked_at timestamptz default now()
)

wishlist (
  id uuid pk default gen_random_uuid(),
  label text not null,
  sort int not null default 0,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz default now()
)
-- seeded: Japanese yoghurt in a bag · Supplements & meds · Sunscreen · Skincare · 3COINS haul

trip_settings (id int pk check (id = 1), cash_left_jpy numeric default 0)

sheet_snapshot (id int pk check (id = 1), data jsonb not null, fetched_at timestamptz not null)
```

All tables: RLS enabled, `select/insert/update/delete using (is_allowed())`. Realtime enabled on `expenses`, `checks`, `wishlist`.

## 5. Money logic

- **Rate:** RM = ¥ ÷ `JPY_PER_RM` (read live from the sheet). Changing the sheet's yellow cell re-values every ¥ expense; RM-entered expenses stay fixed.
- **Actual spend** = sum of trip expenses + pre-trip Payment-tab rows of type Flight/Hotel.
  - Payment-tab rows of type `Cash` (the Wise JPY top-up) are money moved, not spent: they are listed for reference only and count in neither spend nor balance.
- **Actual vs budget** per Budget-tab section:
  `hotel→ACCOMMODATION, transport→TRANSPORT, food→FOOD, activities→ACTIVITIES, shopping+other→MISC`; pre-trip flights→FLIGHTS, pre-trip hotels→ACCOMMODATION.
- **Each of us spent**: for each person, everything `for_whom` = that person plus half of everything shared (incl. pre-trip flights and hotels). "Paid by" / "Paid with" are recorded for reference; there is no balance or settle-up screen.

## 5b. Map

- Map / List toggle on Today and Days (remembered per phone). Google Maps JavaScript API with a referrer-restricted browser key (`NEXT_PUBLIC_GOOGLE_MAPS_KEY`); daily quotas set in Google Cloud keep usage inside the free tier.
- Each stop's place query comes from `placeQuery()` (skips meals without a named place, transport legs and hotel logistics). Places (New) text search, falling back to Geocoding, runs in the browser once per query; results are cached in `place_cache` for both phones. "Wrong spot?" re-searches and stores a manual override.
- Numbered pins in the city colour joined in time order (planned route); done stops grey; tonight's hotel as a dark pin. Live location via the browser Geolocation API only after tapping "Show where we are"; nothing is recorded.

## 6. Screens

Phone-first, one-handed, big type, ≤ 2 taps to anything. Bottom tab bar: **Today · Days · Money · More**, plus a floating **＋** (quick-add expense) on every screen.

1. **Today** (default)
   - Day header in the city colour (e.g. "Day 5 · Wed 28 Oct · Kyoto").
   - **Now** card: current stop, highlights, big **Directions** (Google Maps search URL: `<activity>, <city>, Japan`) and **Done ✓**.
   - **Next** card: next stop, start time, "travel to next" text.
   - Remaining timeline below; tap a stop to expand full tips.
   - Tonight's hotel pill (name + address, tap for Maps).
   - Before 24 Oct: countdown + day preview. After 2 Nov: trip recap (total spent, stops done).
   - "Now" is computed in Asia/Tokyo time.
2. **Days** — horizontal day strip (1–10), same timeline component, done stops faded, Day 10 "choose one" as selectable option cards (selection stored as a check).
3. **Money**
   - Quick-add sheet: large keypad, ¥/RM toggle (default ¥), category chips with emoji, Paid by (defaults to current user; Alex / Sam / Cash), For (Shared default), optional note, day (defaults to today). Saves offline.
   - List grouped by day; swipe/long-press to edit or delete.
   - **Summary:** "Our trip together" headline total (RM + ¥), per-category actual-vs-budget soft bars, daily spend chart, "Keeping it even" footnote, cash-left input.
4. **More** — Wishlist (shared ticks, add item), ¥ ⇄ RM converter (two-way, quick chips ¥500/¥1,000/¥5,000), Trip info (flights: times, seats, terminals, refs; hotels: address, Maps, check-in), open Google Sheet, sign out.

### Look & feel
Built with the `design-taste-frontend` skill. Direction: calm Japanese stationery — warm paper-white, ink text, one accent per city matching the sheet (Osaka kōbai rose `#A8385A`, Kyoto murasaki `#5E4A8B`, Nara matcha `#3F6F45`, Tokyo ai indigo `#23446B`, Kamakura asagi teal `#1D6E80` (no orange); accents lift toward white for text in dark mode). Automatic dark mode. Subtle motion, respects reduced-motion. Minimum tap target 48 px.

## 7. Offline & PWA

- Installable (manifest, icons, standalone display).
- Service worker caches the app shell; the last itinerary JSON is cached in IndexedDB and shown with "updated <time> ago".
- Expense create/edit/delete go to an IndexedDB outbox when offline and flush on reconnect (`client_id` prevents duplicates).
- Checks toggled offline are queued the same way.

## 8. Error handling

| Failure | Behaviour |
|---|---|
| Sheet unreachable / header missing | Serve `sheet_snapshot` + notice |
| Single row malformed | Skip row, log server-side |
| Offline | Cached itinerary; outbox for writes; banner "Offline — will sync" |
| Session expired | Redirect to login; outbox preserved |
| Non-allowlisted email | "This trip is private" screen, signed out |

## 9. Testing

- **Unit (Vitest):** sheet parser against a fixture snapshot of the real sheet (incl. reordered columns, missing header, malformed row); money logic (totals, category mapping, keeping-it-even incl. cash float); stop-key generation; "now/next" selection in Asia/Tokyo.
- **Integration:** RLS — allowlisted user can CRUD; a third authenticated email gets zero rows and write errors.
- **E2E smoke (Playwright, mobile viewport):** login gate redirects, Today renders, quick-add expense round-trip.
- Manual check on a phone-sized viewport before hand-off.

## 10. Environment variables

| Name | Where |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + local |
| `GOOGLE_SERVICE_ACCOUNT_JSON` (base64) | Vercel + local, server-only |
| `SHEET_ID` | Vercel + local |
| `ALLOWED_EMAILS` | Vercel + local |
| `SUPABASE_SERVICE_ROLE_KEY` | Local setup script only — never on Vercel |

## 11. Manual steps for Alex

1. Create a Google OAuth client (Web) in Google Cloud project `<your-gcp-project>` and paste client ID/secret into Supabase Auth → Google (guided step-by-step).
2. Approve Supabase project creation and Vercel project linking.
