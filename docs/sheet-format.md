# The Google Sheet the app reads

The sheet is the source of truth for the plan. The app reads it with a service account every 5 minutes; "Add a stop" and the cash/card exchange card are the only things that write back.

`scripts/seed-sheet.mts` creates all of this with the sample trip. `tests/fixtures/sheet.json` is the same data as the app receives it (an older column layout: its Itinerary stops at column K).

Tab names are exact, emoji included (`RANGES` in `src/lib/sheet/client.ts`).

| Tab | Read by the app | What it holds |
|---|---|---|
| 🗾 Overview | A1:C40 | Flights, route, budget totals, the exchange rate |
| 📅 Itinerary | A1:N500 | Every stop of every day |
| 💰 Budget | A1:D50 | Planned cost per category |
| 💳 Payment | A1:G40 | What was paid before the trip, and money exchanged |
| 🏨 Hotels | A1:H10 | One row per hotel |
| 📝 Change Log | not read | Record of plan changes (for the planning workflow) |

Plus one named range, **`JPY_PER_RM`**: a single cell holding "local currency units per 1 home currency unit". In the sample it is the yellow cell on the Overview tab. The app refuses to load without it.

## 📅 Itinerary

Columns are found by header text, so their order may change; the header row is the one containing both `Day` and `Time`.

| Col | Header | Notes |
|---|---|---|
| A | Day | Day number. Required |
| B | Date | Free text |
| C | Time | Required. A real time cell or `HH:MM` text, 24-hour |
| D | Activity / Location | Required. The stop's title. A title starting `[Option A]` marks a pick-one choice |
| E | Highlights & Tips | See format below |
| F | Duration | Free text: `45 min`, `1.5 hr` |
| G | Travel to Next Stop | Door to door: `Metro 10 min + walk 5 min` |
| H | Cost ¥ (2 pax) | A number, or `—` |
| I | Cost RM (2 pax) | Formula from H and the rate. Not read |
| J | Category | `🍜 Food`, `🚃 Transport`, `🏨 Hotel`, … Drives icons and what counts as a meal or hotel |
| K | ✍️ Remarks | For people to leave comments. Not read |
| L | 🎟 Book in advance | Shown in the app as a booking reminder; blank = nothing to book |
| M | 🤖 AI notes | What an agent changed and why. Not read |
| N | Friend's recs | Not read |

**Day header rows** separate the days. Column A must match `DAY n · date · CITY`:

```
DAY 1  ·  Sat 24 Oct  ·  OSAKA
DAY 4  ·  Tue 27 Oct  ·  OSAKA → KYOTO
```

The date needs a day and a three-letter month (`24 Oct`); the year comes from `src/trip.config.ts`. The city is matched against the config's city list; `A → B` is a travel day. Banner and blank rows are ignored. A row with no time or no title is ignored.

**Column E, Highlights & Tips.** Line 1 is a one-line summary. After that, one short point per line, each starting with an emoji the app understands:

```
Osaka's kitchen: a covered market of seafood and street snacks.
⭐ Grilled scallops and tuna skewers at the stalls
💡 Most stalls are cash only
⚠️ Many shut by 17:00
🔄 Flexible: any stall with a short queue
🧾 Tax-free over ¥5,000 with passport
🚃 Nippombashi Station exit 10, 3 min walk
🚉 Last train: 23:40 from Namba
📍 Kuromon Ichiba Market, Osaka
```

- ⭐ highlight · 💡 tip · ⚠️ heads-up · 🔄 flexible meal · 🧾 tax-free · 🚃 getting there
- `📍 Place, City` is the exact place for directions, the map pin and opening hours (hidden from the tips). Name the specific branch.
- `🚉 Last train: …` on a day's last stop drives the late-night warning.
- Stops added from the phone start with `Added on the go.`

## 🗾 Overview

Flights are found by a row whose column A is `OUTBOUND` or `RETURN`: column B is the route, column C free details (terminal, flight number, seats). The rows straight below, until a blank row, are read by their label in column A: `Airline`, `Departure` (column C = luggage allowance), `Arrival`.

## 🏨 Hotels

A hotel row is any row whose column A contains `BOOKED` or `nights` and whose column B has a name. Column A is multi-line; the line in capitals is the city and must match the itinerary's city names, which is how the app knows where you sleep each night:

```
✅ BOOKED
OSAKA
3 nights
Oct 24–26
```

B = hotel name · C = area · F = notes · **H = name, address and phone in the local language**, for the "show to staff" card.

## 💰 Budget

A = category in capitals (`FOOD`, `TRANSPORT`, `ACCOMMODATION`, `FLIGHTS`, `ACTIVITIES`, `MISC`) · B = item · C = cost in local currency · D = cost in home currency. Rows without a number in D are ignored. The Money tab compares actual spend against these.

## 💳 Payment

Things paid before the trip, one per row: A = Type (`Flight`, `Hotel`, `Train`, `Cash` …) · B = description · C = amount in home currency · **D = payer, exactly one of the two travellers' names**. Rows with any other payer are ignored. `Flight` and `Hotel` rows count as trip spend and are split in half for settle-up.

Below the payments are two blocks with running totals per person. The app finds each by the header row (`Who` in column A, and column B starting `RM paid` or `RM topped up`), then the two rows under it by name:

| Who | RM paid | ¥ received | ¥ per RM | ¥ changed back | RM got back | History |
|---|---|---|---|---|---|---|
| Alex | | | formula C/B | | | |
| Sam | | | formula C/B | | | |

- **💴 Cash exchange** (`RM paid`): cash changed before or during the trip. Each person's cash expenses convert at their own rate.
- **💳 Wise top-ups** (`RM topped up`): money loaded onto a multi-currency card.

The app writes columns B, C, E, F and G; leave D as a formula.

## What breaks the app

- Renaming a tab, or removing the `JPY_PER_RM` named range.
- A day header that doesn't match `DAY n · date · CITY`, or has no `24 Oct` style date.
- Renaming the `Day`, `Time` or `Activity / Location` headers.
- Changing the payer names, the `Who` headers or column B's wording in the exchange blocks.

When the sheet can't be parsed, the app keeps showing the last good copy.
