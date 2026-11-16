# Planning the trip with an AI agent

The app shows the plan; the plan itself was written and revised in the Google Sheet, mostly by an agent acting on short remarks the travellers typed into the sheet. This is the workflow that made that reliable. Copy the parts you want into your own agent instructions.

## The loop

1. A traveller types a remark in **column K (✍️ Remarks)** on the stop it is about: "too early", "swap with the museum", "add this ramen place <link>".
2. The agent reads the sheet, makes the change, and moves the remark out of K into **column M (🤖 AI notes)** as `💬 remark → what changed. #n`, leaving K empty. Column K is for people only; the agent never writes its own text there.
3. Every change gets a numbered row in **📝 Change Log**: `# · Date · Day / Stop · Your remark · What changed · Before → After`.
4. The app picks the change up within 5 minutes.

## Rules worth giving the agent

- **Read before writing.** Get the rows you are changing and the rows around them first. Before any write, print each target row with its title and check it is the stop you meant: an off-by-one overwrites someone's booked slot.
- **Never overwrite formulas with values** (check with `formulas`).
- **Times must add up:** start + duration (F) + travel (G) = the next stop's time. Travel is door to door, including hotel → first stop and last stop → hotel.
- **Keep links.** A remark with a link (a reel, a website) keeps the link on that stop as a `💡` line in column E, not only in the log.
- **Group days by area.** Never the same area on two different days; no long cross-city hop just for dinner.
- **Meals are flexible:** give a nearby fallback (`🔄 Flexible: …`) rather than a detour.
- **Fixed bookings are fixed.** List them in your instructions; the agent must not move or shorten them.
- Write down the travellers' pace and limits (late starts? no taxis? how much walking?) once, so every revision respects them.
- Column E follows the format in `docs/sheet-format.md`: short lines, no paragraphs.

## The command-line helper

`scripts/sheet.mjs` needs no install. Set `SHEET_ID` and `GOOGLE_SERVICE_ACCOUNT_JSON` (raw JSON or base64) in the environment.

```bash
node scripts/sheet.mjs tabs
node scripts/sheet.mjs get "'📅 Itinerary'!A1:N130"
node scripts/sheet.mjs formulas "'💰 Budget'!A1:D50"
node scripts/sheet.mjs set "'📅 Itinerary'!M12" '[["💬 remark → change. #80"]]'
node scripts/sheet.mjs append "'📝 Change Log'!A:F" '[["80","20 Oct","Day 4 · …","…","…","…"]]'
```

Gotchas:

- `get` prints `<n> <json>` with **n starting at 0**; the sheet row is n+1 for a range starting at row 1.
- On Windows call `node` directly rather than through `sh`: MSYS mangles JSON arguments with no spaces, like `[["11:10"]]`.
- Sheets returns 429 after about 60 writes a minute. Back off and retry.
- Print with UTF-8; the tab names and tips are full of emoji.
