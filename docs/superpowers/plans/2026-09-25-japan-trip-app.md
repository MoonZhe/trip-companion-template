# Japan 2026 Trip Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Private phone-first PWA that renders the Google-Sheet itinerary, logs expenses, and shows actual spend for Alex & Sam.

**Architecture:** Next.js 16 App Router on Vercel reads the Google Sheet server-side (service account, 5-min revalidate, Supabase snapshot fallback). Supabase provides auth (Google + magic link, sign-ups disabled, 2 pre-created users), RLS-guarded tables for expenses/checks/wishlist, and realtime. Hand-written service worker + IndexedDB give offline reading and an expense outbox.

**Tech Stack:** Next.js 16.3, React 19.3, TypeScript, Tailwind 4.3, @supabase/ssr 0.12 + supabase-js 2.117, google-auth-library 11, idb-keyval 6, motion 13, Vitest 5, Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-09-25-japan-trip-app-design.md`

## Global Constraints

- Only emails `alex@example.com`, `sam@example.com` may access anything.
- The app renders only sheet content; it adds no itinerary content of its own.
- Balance copy never uses "owe", "debt", "debit" or red colour; friendly line only; "Perfectly even ✨" within RM 5.
- Rate: RM = ¥ ÷ `JPY_PER_RM` (sheet named range).
- Times computed in `Asia/Tokyo`.
- Supabase region `ap-northeast-1`; Vercel function region `hnd1`.
- Service-role key never deployed to Vercel.
- Next 16: request gate lives in `src/proxy.ts` (middleware was renamed to proxy).
- Min tap target 48px; respects `prefers-reduced-motion`; automatic dark mode.

## File Structure

```
src/
  proxy.ts                         auth gate (session + allowlist)
  app/
    layout.tsx, globals.css        shell, fonts, theme tokens
    login/page.tsx                 Google + magic link
    auth/callback/route.ts         code exchange
    private/page.tsx               "This trip is private"
    (app)/layout.tsx               tab bar + FAB + providers
    (app)/page.tsx                 Today
    (app)/days/page.tsx            Days
    (app)/money/page.tsx           Money (list + summary)
    (app)/more/page.tsx            Wishlist, converter, trip info
    api/trip/route.ts              GET trip JSON (?fresh=1 bypasses cache)
  lib/
    allowlist.ts                   isAllowedEmail()
    sheet/client.ts                fetch raw values via service account
    sheet/parse.ts                 raw values → Trip
    sheet/types.ts                 Trip, Day, Stop, Hotel, Flight, BudgetLine, PrePayment
    sheet/load.ts                  cached load + snapshot fallback
    money/compute.ts               totals, budget compare, balance
    time/now.ts                    tokyoNow(), dayIndexFor(), nowNext()
    supabase/{server,browser}.ts   clients
    offline/outbox.ts              IndexedDB outbox + flush
    offline/tripCache.ts           last trip JSON in IndexedDB
  components/…                     UI (per screen)
supabase/migrations/0001_init.sql  schema, RLS, seed
scripts/setup-users.mjs            one-off: create the 2 users
public/sw.js, manifest.webmanifest, icons/
tests/unit/*.test.ts, tests/fixtures/sheet.json, tests/e2e/smoke.spec.ts
```

---

### Task 1: Scaffold

**Files:** project root, `vitest.config.ts`, `.env.example`, `.gitignore`

- [ ] `pnpm create next-app@16.3.6 . --ts --tailwind --app --src-dir --eslint --use-pnpm --import-alias "@/*" --yes`
- [ ] Add deps: `@supabase/ssr @supabase/supabase-js google-auth-library idb-keyval motion`; dev: `vitest @playwright/test`.
- [ ] `vitest.config.ts` with `@` alias, `environment: 'node'`, include `tests/unit/**`.
- [ ] `.env.example` listing spec §10 variables; `.env.local` git-ignored.
- [ ] `pnpm build` passes. Commit `chore: scaffold next app`.

### Task 2: Sheet types + parser (TDD)

**Interfaces — Produces (`src/lib/sheet/types.ts`):**
```ts
export type City = 'Osaka'|'Kyoto'|'Nara'|'Tokyo'|'Kamakura'|string;
export interface Stop { key: string; day: number; date: string; time: string; title: string; tips: string; duration: string; travelNext: string; costJpy: number|null; category: string; isOption: boolean; }
export interface Day { day: number; label: string; dateLabel: string; isoDate: string; city: string; stops: Stop[]; }
export interface Hotel { city: string; name: string; area: string; nightsLabel: string; notes: string; }
export interface Flight { direction: 'outbound'|'return'; route: string; details: string; departure: string; arrival: string; }
export interface BudgetLine { section: string; item: string; jpy: number|null; rm: number; }
export interface PrePayment { type: string; desc: string; amountRm: number; payer: 'alex'|'sam'; }
export interface Trip { days: Day[]; hotels: Hotel[]; flights: Flight[]; budget: BudgetLine[]; prePayments: PrePayment[]; jpyPerRm: number; fetchedAt: string; warnings: string[]; }
export interface RawSheet { itinerary: string[][]; hotels: string[][]; overview: string[][]; budget: string[][]; payment: string[][]; jpyPerRm: string; }
```
`parse.ts`: `parseTrip(raw: RawSheet, now = new Date()): Trip` and `stopKey(day:number, time:string, title:string): string` → `d3-0930-sumiyoshi-taisha` style (lowercase, non-alnum → `-`, trimmed, max 40 chars).

Rules: header row = first row containing both `Day` and `Time` cells; columns found by alias lists (`title: ['Activity / Location','Activity','Location']`, `tips: ['Highlights & Tips','Highlights','Tips']`, `travelNext: ['Travel to Next Stop','Travel']`, `cost: ['Cost ¥ (2 pax)','Cost ¥']`, `category: ['Category']`, `duration: ['Duration']`, `date: ['Date']`, `time: ['Time']`, `day: ['Day']`). Missing required (`day,time,title`) → throw `SheetFormatError`. Day header regex `/DAY\s*(\d+)\s*·\s*([^·]+?)\s*·\s*(.+)$/i` on column A. `isoDate` derived from "Sat 24 Oct" + year 2026. Options: title starts `[Option`. Banner rows (no time) skipped. Malformed rows push a warning and are skipped. Cost: numeric string → number, `—`/blank → null.

- [ ] Capture fixture: `tests/fixtures/sheet.json` = current real RawSheet (script `scripts/dump-sheet.mjs` using Task 3 client).
- [ ] Tests (`tests/unit/parse.test.ts`): 10 days parsed; day 1 city `OSAKA`, first stop time `09:50`; stop keys unique; Day 10 has 4 option stops; costs parsed (`2980`), `—` → null; reorder columns E and D in a copy → identical output; remove `Time` header → throws `SheetFormatError`; a row with day `x` → skipped + warning; flights/hotels/budget/prePayments counts (2/3/≥30/5 non-empty).
- [ ] Implement until green. Commit `feat: sheet parser`.

### Task 3: Sheet client + cached loader

**Interfaces:** `fetchRawSheet(): Promise<RawSheet>` (client.ts) using `google-auth-library` JWT from `GOOGLE_SERVICE_ACCOUNT_JSON` (base64) and one `values:batchGet` call with ranges `'📅 Itinerary'!A1:K120`, `'🏨 Hotels'!A1:H10`, `'🗾 Overview'!A1:C40`, `'💰 Budget'!A1:D50`, `'Payment'!A1:F20`, `JPY_PER_RM`, `valueRenderOption=UNFORMATTED_VALUE` coerced to strings. `loadTrip({fresh}): Promise<Trip>` (load.ts): `unstable_cache` 300s tag `trip`; `fresh` → `revalidateTag('trip')`; on success upsert `sheet_snapshot`; on any error read snapshot, append warning `Showing saved version`.
- [ ] `src/app/api/trip/route.ts` GET → `loadTrip({fresh: searchParams.has('fresh')})`, requires allowed session (401 otherwise).
- [ ] Commit `feat: sheet client and loader`.

### Task 4: Money logic (TDD)

**Interfaces (`src/lib/money/compute.ts`):**
```ts
export interface Expense { id: string; client_id: string; spent_on: string; amount: number; currency: 'JPY'|'MYR'; category: 'food'|'transport'|'activities'|'shopping'|'hotel'|'other'; paid_by: 'alex'|'sam'|'cash'; for_whom: 'shared'|'alex'|'sam'; note: string|null; }
export function toRm(e: Pick<Expense,'amount'|'currency'>, jpyPerRm: number): number;
export function totals(exps: Expense[], pre: PrePayment[], jpyPerRm: number): { tripRm: number; preRm: number; allRm: number; byDay: Record<string, number> };
export function budgetCompare(exps: Expense[], pre: PrePayment[], budget: BudgetLine[], jpyPerRm: number): { section: string; budgetRm: number; actualRm: number }[];
export function balance(exps: Expense[], pre: PrePayment[], jpyPerRm: number, cashLeftJpy: number): { alexNet: number; message: string };
```
Rules per spec §5 (Cash pre-payments excluded from spend, credited to funder minus cash_left; category map `hotel→ACCOMMODATION, transport→TRANSPORT, food→FOOD, activities→ACTIVITIES, shopping|other→MISC`, pre Flight→FLIGHTS, pre Hotel→ACCOMMODATION). Message: |net| < 5 → `Perfectly even ✨`; else `${higher} covered a little more so far · RM ${abs.toFixed(0)} evens it out 🤝`.
- [ ] Tests: toRm ¥3870 @38.7 = 100; shared ¥ expense by Alex of RM100 → alexNet +50; alex-only paid by Sam RM40 → alexNet −40; cash expense shared RM20 with float RM100 by Sam, cashLeft 0 → Sam credited 100, both −10; message never contains `owe`; within 5 → even; budgetCompare maps shopping to MISC.
- [ ] Implement, green, commit `feat: money logic`.

### Task 5: Time logic (TDD)

`tokyoNow(d?: Date)`, `tripDayIndex(days: Day[], now: Date): number | 'before' | 'after'`, `nowNext(day: Day, now: Date): { now: Stop|null; next: Stop|null }` (current = last non-option stop whose time ≤ now; next = following non-option stop). Tests at fixed instants (e.g. `2026-10-28T10:00:00+09:00` → day 5, now Tenryu-ji, next Jojakko-ji; `2026-10-01` → before). Commit `feat: time helpers`.

### Task 6: Supabase project + schema

- [ ] `npx supabase projects create japan-2026 --region ap-northeast-1 --org-id <org>`; save DB password locally only.
- [ ] `supabase/migrations/0001_init.sql`: tables per spec §4; `create function is_allowed() returns boolean language sql stable security definer as $$ select exists(select 1 from allowed_emails where email = lower(auth.jwt()->>'email')) $$;` RLS + 4 policies per table; insert both emails; seed wishlist 5 items; insert `trip_settings(1)`; `alter publication supabase_realtime add table expenses, checks, wishlist;` `updated_at` trigger.
- [ ] `supabase/config.toml` auth: `enable_signup=false`, `site_url` = prod URL, redirect URLs (localhost + prod), `[auth.external.google] enabled=true` with env secrets. `npx supabase link` + `db push` + `config push`.
- [ ] `scripts/setup-users.mjs`: admin `createUser({email, email_confirm:true})` for both (idempotent).
- [ ] Commit `feat: supabase schema`.

### Task 7: Auth

- [ ] `lib/supabase/server.ts`, `browser.ts` (@supabase/ssr cookie pattern). `lib/allowlist.ts` from `ALLOWED_EMAILS`.
- [ ] `src/proxy.ts`: refresh session; public paths `/login`, `/auth/*`, `/private`, static, `sw.js`, manifest; no user → `/login`; not allowed → sign out + `/private`.
- [ ] Login page: "Continue with Google" (`signInWithOAuth`) and email field (`signInWithOtp`, `shouldCreateUser:false`). Callback route exchanges code.
- [ ] Commit `feat: auth gate`.

### Task 8: Client data layer

- [ ] `offline/tripCache.ts` get/set trip JSON; `offline/outbox.ts` queue `{op:'upsert'|'delete', table, row}` and `flush(supabase)` on `online` event and app start (upsert on `client_id`).
- [ ] Hooks: `useTrip()` (cached first, then `/api/trip`, refresh()), `useExpenses()`, `useChecks()`, `useWishlist()` with realtime subscription + optimistic updates through outbox.
- [ ] Commit `feat: client data layer`.

### Task 9–12: UI (use design-taste-frontend skill)

Screens exactly per spec §6. Shared: `(app)/layout.tsx` with bottom tab bar (Today/Days/Money/More) + FAB quick-add sheet; city accent via CSS variable; pull-to-refresh calling `refresh()`. Components: `StopCard`, `NowNextCard`, `Timeline`, `DayStrip`, `HotelPill`, `QuickAddSheet`, `ExpenseList`, `SummaryView`, `Wishlist`, `Converter`, `TripInfo`. Commit per screen.

### Task 13: PWA

`public/manifest.webmanifest`, icons (192/512/maskable), `public/sw.js` (cache-first for `/_next/static`, network-first with cache fallback for navigations, skip `/api` & Supabase), register in layout. Commit `feat: pwa`.

### Task 14: Deploy + verify

- [ ] `vercel link` new project `japan-2026`, `vercel.json` `{ "regions": ["hnd1"] }`, add env vars (prod+preview+dev), connect GitHub repo, `vercel --prod`.
- [ ] Update Supabase `site_url`/redirects to prod URL; `config push`.
- [ ] Guide Alex through Google OAuth client creation; set secret in Supabase.
- [ ] Playwright smoke (mobile viewport): unauthenticated `/` → `/login`; `/login` renders both options.
- [ ] Manual check on phone viewport; commit `chore: deploy config`.
