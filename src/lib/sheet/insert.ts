import { DAY_HEADER, findColumns, formatTime } from './parse';
import { SheetFormatError } from './types';

/**
 * 0-based row index (into the Itinerary values from A1) where a new stop for `day`
 * at `time` should be inserted so the day stays in time order.
 */
export function insertRowFor(rows: string[][], day: number, time: string): number {
  const { headerRow, cols } = findColumns(rows);
  let inDay = false;
  let insertAt = -1;

  for (let r = headerRow + 1; r < rows.length; r++) {
    const header = (rows[r]?.[0] ?? '').trim().match(DAY_HEADER);
    if (header) {
      if (inDay) return insertAt;
      inDay = Number(header[1]) === day;
      if (inDay) insertAt = r + 1;
      continue;
    }
    if (!inDay) continue;
    const t = formatTime(rows[r]?.[cols.time!] ?? '');
    if (t && t <= time) insertAt = r + 1;
  }
  if (!inDay) throw new SheetFormatError(`Day ${day} not found in the itinerary`);
  return insertAt;
}

/** Stops added from the app start their tips with this, which is how they're told apart from the plan. */
export const ADDED_MARK = 'Added on the go.';

/**
 * 0-based row of a stop added from the app (same day, time and title, tips starting with
 * ADDED_MARK), or -1. Planned stops never match, so the app can't delete those.
 */
export function findAddedRow(rows: string[][], stop: Pick<NewStop, 'day' | 'time' | 'title'>): number {
  const { headerRow, cols } = findColumns(rows);
  let inDay = false;
  for (let r = headerRow + 1; r < rows.length; r++) {
    const header = (rows[r]?.[0] ?? '').trim().match(DAY_HEADER);
    if (header) {
      if (inDay) return -1;
      inDay = Number(header[1]) === stop.day;
      continue;
    }
    if (!inDay) continue;
    const row = rows[r] ?? [];
    if (
      formatTime(row[cols.time!] ?? '') === stop.time &&
      (row[cols.title!] ?? '').trim() === stop.title.trim() &&
      (row[cols.tips!] ?? '').startsWith(ADDED_MARK)
    )
      return r;
  }
  return -1;
}

/** True when this exact stop is already in the sheet: a retry after a lost response must not add it twice. */
export function alreadyAdded(rows: string[][], stop: Pick<NewStop, 'day' | 'time' | 'title'>): boolean {
  return findAddedRow(rows, stop) >= 0;
}

/**
 * The batchUpdate that removes the added stop at 0-based `index`. Its "travel to next" leg goes
 * back to the stop before it (undoing what adding it did), unless that stop already has its own.
 */
export function removeStopRequests(rows: string[][], index: number, sheetId: number): object[] {
  const prev = rows[index - 1] ?? [];
  const leg = rows[index]?.[TRAVEL_COL] ?? '';
  const giveBack = !DAY_HEADER.test((prev[0] ?? '').trim()) && !(prev[TRAVEL_COL] ?? '').trim() && leg.trim();
  return [
    ...(giveBack
      ? [
          {
            updateCells: {
              range: {
                sheetId,
                startRowIndex: index - 1,
                endRowIndex: index,
                startColumnIndex: TRAVEL_COL,
                endColumnIndex: TRAVEL_COL + 1,
              },
              rows: [{ values: [text(leg)] }],
              fields: 'userEnteredValue',
            },
          },
        ]
      : []),
    { deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: index, endIndex: index + 1 } } },
  ];
}

export interface NewStop {
  day: number;
  time: string; // HH:MM
  title: string;
  notes: string;
  /** "Ichiran Shinsaibashi, Osaka": the exact place for the pin and directions (a 📍 line in the tips). */
  place?: string;
  category: string; // e.g. "🍜 Food", matching the sheet's category labels
  costJpy: number | null;
}

/** The tips cell: the summary line, then the 📍 place on a line of its own (the app's pin format). */
export function tipsFor(stop: Pick<NewStop, 'notes' | 'place'>): string {
  const lead = stop.notes ? `${ADDED_MARK} ${stop.notes}` : ADDED_MARK;
  return stop.place ? `${lead}\n📍 ${stop.place}` : lead;
}

type CellData = { userEnteredValue?: { numberValue?: number; stringValue?: string; formulaValue?: string } };
const text = (s: string): CellData => ({ userEnteredValue: { stringValue: s } });
const number = (n: number): CellData => ({ userEnteredValue: { numberValue: n } });
const TRAVEL_COL = 6; // G, "Travel to Next Stop"

/**
 * The one batchUpdate that adds `stop` as a new A–J row at 0-based `index`. Inserting and filling in
 * a single call means a failed write can't leave an empty row behind. Text goes in as plain strings,
 * so a title like "7-11" or "=..." stays text instead of becoming a date or a formula.
 *
 * The stop before it hands over its "travel to next" leg (after the day's last stop that's the trip
 * back to the hotel), since the leg now starts from the new stop. Its own leg to the new stop is
 * unknown, so it's left blank rather than wrong.
 */
export function addStopRequests(
  stop: NewStop,
  {
    sheetId,
    index,
    dateLabel,
    afterHeader,
    prevTravel,
  }: {
    sheetId: number;
    index: number;
    dateLabel: string;
    afterHeader: boolean;
    prevTravel: string;
  },
): object[] {
  const [h, m] = stop.time.split(':').map(Number);
  const n = index + 1; // 1-based sheet row
  const carry = !afterHeader && prevTravel.trim() !== '';
  const row: CellData[] = [
    number(stop.day),
    text(dateLabel),
    number((h * 60 + m) / (24 * 60)), // a sheet time is a fraction of a day; the copied row styling shows it as HH:MM
    text(stop.title),
    text(tipsFor(stop)),
    {},
    carry ? text(prevTravel) : {},
    stop.costJpy === null ? text('—') : number(stop.costJpy),
    { userEnteredValue: { formulaValue: `=IF(ISNUMBER(H${n}),H${n}/JPY_PER_RM,"—")` } },
    text(stop.category),
  ];
  return [
    {
      insertDimension: {
        range: { sheetId, dimension: 'ROWS', startIndex: index, endIndex: index + 1 },
        // Copy styling from a neighbouring stop row, never from a coloured day header.
        inheritFromBefore: !afterHeader,
      },
    },
    { updateCells: { start: { sheetId, rowIndex: index, columnIndex: 0 }, rows: [{ values: row }], fields: 'userEnteredValue' } },
    ...(carry
      ? [
          {
            updateCells: {
              start: { sheetId, rowIndex: index - 1, columnIndex: TRAVEL_COL },
              rows: [{ values: [{}] }],
              fields: 'userEnteredValue',
            },
          },
        ]
      : []),
  ];
}
