<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Trip companion app — guide for AI agents

A private, phone-first trip app for two people travelling together. It was built for one real trip (10 days in Japan) and is shared here, with personal details replaced by a sample ("Alex & Sam, Japan 2026"), so someone else can stand up the same thing for their own trip.

**Your job, if you were handed this repo:** get it running for the owner's trip. That means (1) the accounts and keys in *Setup*, (2) their plan in a Google Sheet in the layout in `docs/sheet-format.md`, (3) the changes in *Changing the destination* if the trip is not Japan. Ask the owner for the facts you need first: who the two travellers are (names + Google emails), dates, destination and cities, home currency and local currency, and whether they use iPhones.

What it does: Today / Days timeline from the sheet with Now/Next, directions, map, weather and opening hours · expenses with receipts, a two-person split and settle-up · shopping list with photos · tickets wallet · show-to-staff cards · morning and evening push notifications · works offline as a Home Screen app.

Stack: Next.js (App Router) + Tailwind, Supabase (auth, Postgres, storage, realtime), Google Sheets API (service account), Google Maps/Places, Open-Meteo, web push, hosted on Vercel. One trip fitted the free tiers when this was built; check current limits.

## Ground rules
- **Never commit secrets.** `.env.local`, Google key JSON files, tickets and PDFs stay out of git. Never print secret values.
- The owner's accounts are theirs: ask before creating projects, running migrations, or anything that costs money.
- Itinerary *content* belongs in the sheet, not in code. The app re-reads the sheet every 5 minutes.
- Before pushing: `pnpm test` and `pnpm build` must pass. Line endings are LF.
- This is a two-person app by design (the split is halves; the `Person` type has two values). More travellers is a real redesign of the money code, not a config change. Say so if asked.
- Verify behaviour (offline, on a phone-sized screen) before claiming it works.

## Setup (once)
Do these with the owner; each needs their sign-in. Variable names are in `.env.example`.

1. **Install:** Node 20+, `pnpm install`. Copy `.env.example` to `.env.local`.
2. **Google Sheet:** create a blank sheet. In Google Cloud: new project → enable *Google Sheets API* → create a service account → make a JSON key. Share the sheet with the service account's email as **Editor**. Set `SHEET_ID` (from the sheet's address) and `GOOGLE_SERVICE_ACCOUNT_JSON` (the key file base64-encoded on one line). Then fill the sheet with the sample layout: `pnpm tsx --env-file=.env.local scripts/seed-sheet.mts` (`--check` builds and validates it without touching the network). The seed's output has been checked offline only, never run against a live sheet; if a Sheets call fails, fix the script rather than working around it. Or build the tabs by hand from `docs/sheet-format.md`.
3. **Supabase:** new project in the region nearest the destination. Edit the two emails at the top of `supabase/migrations/20260925000000_init.sql` to the travellers' real addresses (and adapt the sample to-dos in `20260927000000_files_todos_taxfree.sql` and the sample shopping list in the init migration), then apply the migrations in order: `npx supabase link` then `npx supabase db push`, or paste each file into the SQL editor. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `ALLOWED_EMAILS` (same two emails, same order: first = person `alex`, second = `sam`).
4. **Sign-in:** in Supabase Auth, disable sign-ups, then run `pnpm tsx --env-file=.env.local scripts/setup-users.mts` to create the two accounts. Set the Site URL and redirect URLs (`/auth/callback`, `/auth/confirm`, for localhost and the deployed address). Email magic links work straight away; "Continue with Google" needs a Google OAuth web client whose id and secret go into Supabase Auth → Providers → Google.
5. **Maps (optional but worth it):** a browser key with *Maps JavaScript API* and *Places API (New)*, restricted to the app's domains → `NEXT_PUBLIC_GOOGLE_MAPS_KEY`. Without it the map view, opening hours and nearest-station lookups are missing; the rest works.
6. **Push (optional):** `npx web-push generate-vapid-keys` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`; set `VAPID_SUBJECT` and a random `CRON_SECRET`. On iOS, push only works after "Add to Home Screen".
7. **Run:** `pnpm dev`. Sign in locally with `pnpm tsx --env-file=.env.local scripts/dev-login-link.mts`. `pnpm tsx --env-file=.env.local scripts/check-rls.mts` checks the database is closed to outsiders.
8. **Deploy:** push to a **private** GitHub repo, import it in Vercel, add every env var there. `vercel.json` sets the region and two daily crons, in UTC (the sample is 08:00 and 21:00 Japan time): change both to suit the destination. Delete the crons after the trip.

Checking a deploy with `curl` may get a 429 "challenge" from Vercel's bot protection; that is not an app error.

## Changing the destination
The sample is Japan, paid in yen by people whose home currency is Malaysian ringgit. Work through this list for anywhere else. Example values are for Vietnam.

1. **`src/trip.config.ts`** — name, travellers, tagline, `timeZone` (`Asia/Ho_Chi_Minh`), `utcOffset` (`+07:00`), `year`, `startDate`, and the cities with an accent colour and a forecast point each (`HANOI`, `DA NANG`, `HO CHI MINH` … spelled as they will appear in the sheet's day headers). This drives every clock, the weather and the city colours. Also by hand: `public/manifest.webmanifest`, the fallback title in `public/sw.js`, crons and region in `vercel.json`.
2. **The two people.** The ids `alex` and `sam` are data values: the `Person` type (`src/lib/sheet/types.ts`, `src/lib/allowlist.ts`), check constraints in the migrations, labels in the Money screens, and the payer names in the sheet's Payment tab. Simplest: do a whole-word, case-preserving replace of both names across `src`, `tests`, `supabase` and `scripts` **before** the first migration is applied, then run the tests. After the database exists, change labels only.
3. **Currency.** Not in the config yet; it is the biggest job. In code `jpy` means "local currency" and `rm` means "home currency". The cheapest correct route is to keep those internal names and change what people see and what is stored:
   - formatting and symbols: `src/lib/format.ts` (`jpy`, `rm`, locales), then `grep -rn "¥\|RM " src` for labels (converter, add-expense sheet, cash/Wise card, summaries, push briefs in `src/lib/push`);
   - the stored codes `'JPY' | 'MYR'`: the `currency` check in the init migration, `src/lib/money/compute.ts`, `QuickAddSheet.tsx`, `Converter.tsx`;
   - the sheet: cost header aliases in `COLUMN_ALIASES` (`src/lib/sheet/parse.ts`), the exchange-block headers matched in `src/lib/money/exchange.ts`, `scripts/seed-sheet.mts`, and the named range `JPY_PER_RM` (keep the name or rename it in `src/lib/sheet/client.ts` too). It must hold "local units per 1 home unit";
   - large-number currencies such as VND need a look at the amount keypad, the quick-convert chips and chart labels, which assume yen-sized numbers;
   - a traveller whose home currency equals the local one can drop the converter and the exchange blocks.
   Update `tests/unit/money.test.ts`, `today.test.ts` and `format.test.ts` alongside.
4. **Japan-only features** — remove or replace, then delete their dead code:
   - `src/components/trip/KonbiniGuide.tsx` (convenience-store guide) and its entry under More;
   - show-to-staff cards (`StaffCards.tsx`, Hotels column H, `Hotel.ja`): generic idea, Japanese wording; switch the language and labels;
   - `TranslateShortcuts.tsx`: Google Translate / Lens links with `sl=ja`;
   - tax-free shopping: `tax_free` on expenses, `NEW_TAX_FREE_FROM` in `src/lib/money/today.ts`, the tax-free toggle and airport checklist. Drop it unless the destination has a similar scheme;
   - "🚉 Last train" warning and nearest-station lookup (`src/lib/maps/stations.ts`, `/api/station`): only useful where people travel by rail;
   - "Wise" in the Payment tab and Money screens is just "a multi-currency card"; rename to whatever they use;
   - directions always open Google Maps in transit mode (`transitTo` in `src/lib/trip/city.ts`). Where people will use ride-hailing or drive, change the travel mode;
   - city background patterns (`src/lib/trip/patterns.ts`) are Japanese motifs keyed by city; unknown cities fall back to one pattern. Replace or simplify;
   - theme: "Momiji" (autumn) colour tokens in `src/app/globals.css`; the app icon in `public/icons` and the inlined copy in `src/lib/appleIcon.ts` show "26" and a moon.
5. **Tests and sample data.** `tests/fixtures/sheet.json` is the sample sheet; many tests assert on it. Either keep it as the parser's fixture (fine: the parser doesn't care about the destination) or re-dump it from the new sheet with `scripts/dump-sheet.mts` and update the assertions. Never dump a real sheet into a public repo.

Stop and tell the owner when something in this list is a product decision (drop tax-free? keep stations?) rather than guessing.

## The sheet
Full layout: `docs/sheet-format.md`. How to plan in it with an agent: `docs/planning-with-ai.md`. Edit it from the command line with `scripts/sheet.mjs`.

- Ranges read: `RANGES` in `src/lib/sheet/client.ts`. Renaming a tab or moving a fixed-position column needs a code change there.
- Itinerary columns A–J are parsed (found by header name); K = ✍️ Remarks (people only), L = 🎟 Book in advance, M = 🤖 AI notes, N = friend's recs. K, M, N never show in the app.
- Column E (Highlights & Tips), parsed: line 1 summary, then one point per line starting with ⭐ 💡 ⚠️ 🔄 🧾 🚃. A `📍 Place, City` line is the stop's exact place (`pinOf`/`pinQuery` in `src/lib/trip/tips.ts`): directions, map pin, hours and station use it over the title, and the tips list hides it.
- Payment tab: payment rows are found by a payer name in column D; below them two exchange blocks found by their `Who` header and column B's wording (`exchangeRow` in `src/lib/money/exchange.ts`). `/api/cash` writes totals back and appends a History line, only if the row still has the totals the phone saw (409 otherwise, so a retry can't add twice).
- A parse that finds no days, or loses over half the stops, doesn't replace the saved snapshot (`replacesSnapshot`).

## App layout
- **Today / Days:** compact header (weather beside the date; Lens/Translate/Map/Search row), Now/Next (ticking the current stop promotes the next), timeline legs with travel and nearest station, back-to-hotel row, today's spend, weather card, photos. Days has day chips, swipe between days (`src/components/itinerary/DaySwipe.tsx`), and "Add a stop".
- **Search** (`src/components/search/Search.tsx`, matching in `src/lib/search/search.ts`): stops, hotels, shopping, expenses, tickets, from data on the phone (works offline).
- **Add expense** (`QuickAddSheet.tsx`): Amount → Category → Note → Paid by · With · For · Day → receipt. Save sits in the sheet header (iPhone number pad has no Return). `Sheet` sizes its overlay to `visualViewport` so the header stays above the keyboard.
- **Money:** Spending · Summary · Shopping, converter. Shopping = Supabase `wishlist`; tapping an item opens `WishSheet` (photos = `files` kind 'wish').
- **More:** Tickets · show-to-staff cards · Trip info, push toggle + test, sign out everywhere · notification History.

## Subsystems
- **Files:** private Supabase Storage bucket `trip-files` + `files` table; each phone keeps an IndexedDB copy. Receipts are cleaned up with their expense (`src/lib/files/orphans.ts`).
- **Offline:** `public/sw.js` precaches the 4 pages + `/_next/static`. **Bump its VERSION** when caching logic changes. Only runs in production builds.
- **Sign-in checks** are in / out / unknown (`sessionCheck` in `src/lib/supabase/claims.ts`). "Unknown" (a Supabase blip) never signs anyone out: the proxy lets pages through and API routes answer 503 (`src/lib/supabase/api.ts`). Auth checks use `signedInUser()` (`getClaims`, verified locally); don't go back to `getUser()` on hot paths.
- **Outbox** (`src/lib/offline/store.ts`): an op is dropped only for permanent rejections (`isPermanentRejection`); expired tokens, 5xx and timeouts retry. The app syncs on return to the foreground and on realtime reconnect.
- **Trip day** turns over at 04:00 destination time (`tripClock` / `tripDayIndex` in `src/lib/time/now.ts`), everywhere. (`tokyoClock` is the destination's wall clock; the name is historical.)
- **Add / skip a stop:** "Add a stop" writes typed cells in one batchUpdate; stops it adds start their tips with "Added on the go." and only those can be deleted from the app. "Skip this stop" is a shared `skip:<stopKey>` check; the sheet is untouched.
- **Data** reads once per app open + realtime; `TripData` lives in the (app) layout.
- **Weather:** Open-Meteo, `useForecast()` in `src/lib/trip/weather.ts`. **Hours / station:** Google Places (New), cached in `place_cache`; Overpass fallback at `/api/station`.
- **Push:** `push_subscriptions`, `/api/push`, Vercel crons `/api/cron/brief` and `/api/cron/evening` (shared handler `src/lib/push/cron.ts`), saved to `sent_notifications`. `scripts/assistant.mts` lets a scheduled agent read today's context and send a custom push.
- **iOS icon** is inlined as a data URI (`src/lib/appleIcon.ts`) because Vercel's bot check blocks iOS fetching it.
- **Colours:** theme tokens in `src/app/globals.css` (paper/card/sunk/ink*/line, good, warn, caution), light + dark. Use tokens, not hex, in components.
- **Security:** headers in `next.config.ts`; RLS on every table; nobody outside `allowed_emails` can read anything.

## UI rules that were learned the hard way
- Keep tabs uncluttered: group sections behind a segmented switcher. Show status only when offline or slow.
- Every delete or clear asks twice (`useArmed` in `src/lib/ui/useArmed.ts`); expense deletes also get an Undo toast. One user action = one sync write.
- Buttons inside a `<form>` need `type="button"` or they submit it.
- Long text: a `grid` wrapper around `truncate` text needs `grid-cols-[minmax(0,1fr)]` (or `min-w-0` on flex items), or it widens the page.
- The page itself never scrolls: the shell is a `fixed inset-0` flex column, only `#app-scroll` scrolls. A `position: fixed` tab bar over a scrolling document drifted on iPad.
- Overlays follow the light/dark theme. Floating buttons never cover form controls.

## Testing UI without signing in
Every page except /login, /auth and /private redirects to login. Put a throwaway harness page under `src/app/auth/zz-*/page.tsx`, test, then delete it (and `.next/dev/types`, or tsc fails). `?at=2026-10-28T10:00` pins the clock to preview a trip day.

## Background reading
`docs/superpowers/specs` and `docs/superpowers/plans` are the original design notes. They describe the first version; where they disagree with the code, the code is right.
