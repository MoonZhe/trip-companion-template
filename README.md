# Trip companion

A private trip app for two people, used as a Home Screen app on your phones. You plan the trip in a Google Sheet; the app turns it into a day-by-day timeline with directions, weather and opening hours, tracks what you spend and who owes whom, keeps tickets and a shopping list, and works offline.

It was built for one real trip to Japan. This copy has the personal details replaced with a sample trip ("Alex & Sam, Japan 2026") so you can make your own.

## Using it for your trip

This repo is meant to be handed to an AI coding agent (Claude Code, Codex, Cursor and the like). Open it in the agent and say something like:

> Read AGENTS.md. I'm going to Vietnam from 3 to 12 March with my partner. Set this app up for our trip.

`AGENTS.md` tells the agent how to set up the accounts, what the sheet must look like, and what to change for a destination that isn't Japan. Expect it to ask you to sign in to a few services along the way:

- Google (a Sheet, and a Cloud project for the Sheets and Maps keys)
- Supabase (database and sign-in)
- Vercel (hosting) and GitHub (keep your copy **private**)

All of them have free tiers that cover one trip.

## What needs changing for another destination

The trip name, timezone, cities and dates are in one file, `src/trip.config.ts`. Currency (the sample is yen for people who think in ringgit) and a few Japan-only extras (convenience-store guide, tax-free shopping, Japanese show-to-staff cards) are still in the code; `AGENTS.md` lists exactly where, and an agent can work through it in a session or two.

## Running it yourself

```bash
pnpm install
```

```bash
pnpm test
```

```bash
pnpm dev
```

`pnpm dev` needs the keys in `.env.local` first (see `.env.example`).

## Keep private things private

Never commit `.env.local`, Google key files, tickets or receipts. If you re-create the sample data from your own sheet, don't publish it.
