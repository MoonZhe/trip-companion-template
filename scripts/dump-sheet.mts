// Dumps the live sheet into tests/fixtures/sheet.json for parser tests.
// Run: pnpm tsx --env-file=.env.local scripts/dump-sheet.mts
import { writeFileSync } from 'node:fs';
import { fetchRawSheet } from '../src/lib/sheet/client';

const raw = await fetchRawSheet();
writeFileSync('tests/fixtures/sheet.json', JSON.stringify(raw, null, 1));
console.log('rows', raw.itinerary.length, 'rate', raw.jpyPerRm);
