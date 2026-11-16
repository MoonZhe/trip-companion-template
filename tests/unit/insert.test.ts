import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/sheet.json';
import {
  addStopRequests,
  alreadyAdded,
  findAddedRow,
  insertRowFor,
  removeStopRequests,
  tipsFor,
  type NewStop,
} from '@/lib/sheet/insert';
import { pinOf } from '@/lib/trip/tips';
import { formatTime } from '@/lib/sheet/parse';
import type { RawSheet } from '@/lib/sheet/types';

const rows = (fixture as RawSheet).itinerary;
const titleAt = (i: number) => rows[i]?.[3];

describe('insertRowFor', () => {
  it('slots a stop between the stops around its time on that day', () => {
    // Day 2: 12:30 Oretachi lunch, then 14:00 Kuromon
    const i = insertRowFor(rows, 2, '13:15');
    expect(titleAt(i - 1)).toMatch(/Oretachi/);
    expect(titleAt(i)).toMatch(/Kuromon/);
  });

  it('goes right after the day header when earlier than every stop', () => {
    const i = insertRowFor(rows, 3, '06:00');
    expect(rows[i - 1][0]).toMatch(/DAY 3/);
  });

  it('goes after the last stop of the day when latest', () => {
    const i = insertRowFor(rows, 1, '23:30');
    expect(formatTime(rows[i - 1][2])).toBe('18:30');
    expect(rows[i][0]).toMatch(/DAY 2/);
  });

  it('works for the final day', () => {
    const i = insertRowFor(rows, 10, '23:59');
    expect(i).toBe(rows.length);
  });

  it('keeps time order on the final day too', () => {
    const i = insertRowFor(rows, 10, '09:00');
    expect(formatTime(rows[i - 1][2])).toBe('08:00');
  });

  it('throws for a day that does not exist', () => {
    expect(() => insertRowFor(rows, 42, '10:00')).toThrow();
  });
});

describe('addStopRequests', () => {
  const stop: NewStop = { day: 4, time: '21:30', title: '7-11', notes: '', category: '🍜 Food', costJpy: null };
  type Req = {
    insertDimension?: { range: { startIndex: number }; inheritFromBefore: boolean };
    updateCells?: {
      start: { rowIndex: number; columnIndex: number };
      rows: { values: { userEnteredValue?: Record<string, string | number> }[] }[];
    };
  };
  const build = (opts: Partial<Parameters<typeof addStopRequests>[1]> = {}) =>
    addStopRequests(stop, {
      sheetId: 7,
      index: 40,
      dateLabel: 'Tue 27 Oct',
      afterHeader: false,
      prevTravel: '',
      ...opts,
    }) as Req[];

  it('inserts and fills the row in one request list, with text kept as text', () => {
    const [insert, fill] = build();
    expect(insert.insertDimension?.range.startIndex).toBe(40);
    const cells = fill.updateCells!.rows[0].values.map((c) => c.userEnteredValue);
    expect(fill.updateCells!.start).toMatchObject({ rowIndex: 40, columnIndex: 0 });
    expect(cells[0]).toEqual({ numberValue: 4 });
    expect(cells[2]).toEqual({ numberValue: 21.5 / 24 });
    expect(cells[3]).toEqual({ stringValue: '7-11' });
    expect(cells[7]).toEqual({ stringValue: '—' });
    expect(cells[8]).toEqual({ formulaValue: '=IF(ISNUMBER(H41),H41/JPY_PER_RM,"—")' });
    expect(cells[9]).toEqual({ stringValue: '🍜 Food' });
  });

  it("moves the previous stop's travel leg onto the new stop and blanks the old one", () => {
    const reqs = build({ prevTravel: 'Metro 20 min' });
    expect(reqs).toHaveLength(3);
    expect(reqs[1].updateCells!.rows[0].values[6].userEnteredValue).toEqual({ stringValue: 'Metro 20 min' });
    expect(reqs[2].updateCells!.start).toEqual({ sheetId: 7, rowIndex: 39, columnIndex: 6 });
    expect(reqs[2].updateCells!.rows[0].values[0].userEnteredValue).toBeUndefined();
  });

  it('leaves the day header alone when the stop goes first', () => {
    const reqs = build({ afterHeader: true, prevTravel: 'x' });
    expect(reqs).toHaveLength(2);
    expect(reqs[0].insertDimension?.inheritFromBefore).toBe(false);
  });
});

describe('alreadyAdded', () => {
  const withAdded = (title: string, time: string, notes: string) => {
    const i = insertRowFor(rows, 2, time);
    const copy = rows.map((r) => [...r]);
    const row = [...copy[i - 1]];
    row[2] = time;
    row[3] = title;
    row[4] = notes;
    copy.splice(i, 0, row);
    return copy;
  };
  it('spots the same stop added from the app on that day', () => {
    const r = withAdded('Ramen stop', '13:15', 'Added on the go.');
    expect(alreadyAdded(r, { day: 2, time: '13:15', title: 'Ramen stop' })).toBe(true);
  });
  it('ignores other days, times and stops typed into the sheet by hand', () => {
    const r = withAdded('Ramen stop', '13:15', 'Planned');
    expect(alreadyAdded(r, { day: 2, time: '13:15', title: 'Ramen stop' })).toBe(false);
    const r2 = withAdded('Ramen stop', '13:15', 'Added on the go.');
    expect(alreadyAdded(r2, { day: 3, time: '13:15', title: 'Ramen stop' })).toBe(false);
    expect(alreadyAdded(r2, { day: 2, time: '13:20', title: 'Ramen stop' })).toBe(false);
  });
});

describe('tipsFor', () => {
  it('puts the place on its own 📍 line, which the map and directions read', () => {
    expect(tipsFor({ notes: 'Get the matcha', place: 'Nakamura Tokichi, Uji' })).toBe(
      'Added on the go. Get the matcha\n📍 Nakamura Tokichi, Uji',
    );
    expect(pinOf(tipsFor({ notes: '', place: 'Ichiran Shinsaibashi, Osaka' }))?.text).toBe('Ichiran Shinsaibashi, Osaka');
  });
  it('leaves the cell as before without a place', () => {
    expect(tipsFor({ notes: '' })).toBe('Added on the go.');
  });
});

describe('removing an added stop', () => {
  // Day 2 with an app-added stop after Oretachi that took over Oretachi's leg.
  const i = insertRowFor(rows, 2, '13:15');
  const leg = rows[i - 1][6];
  const added = [...rows[i - 1]];
  added[2] = '13:15';
  added[3] = 'Matcha';
  added[4] = 'Added on the go. Nice';
  added[6] = leg;
  const prev = [...rows[i - 1]];
  prev[6] = '';
  const sheet = [...rows.slice(0, i - 1), prev, added, ...rows.slice(i)];

  it('finds only stops added from the app', () => {
    expect(findAddedRow(sheet, { day: 2, time: '13:15', title: 'Matcha' })).toBe(i);
    expect(findAddedRow(sheet, { day: 3, time: '13:15', title: 'Matcha' })).toBe(-1);
    const planned = rows[i - 1];
    expect(findAddedRow(rows, { day: 2, time: formatTime(planned[2]), title: planned[3] })).toBe(-1);
  });

  it('deletes the row and hands its leg back to the stop before', () => {
    type Req = { updateCells?: { range: { startRowIndex: number } }; deleteDimension?: { range: { startIndex: number } } };
    const reqs = removeStopRequests(sheet, i, 7) as Req[];
    expect(reqs[0].updateCells?.range.startRowIndex).toBe(i - 1);
    expect(reqs[1].deleteDimension?.range.startIndex).toBe(i);
    // The stop before kept a leg of its own: leave it alone.
    expect(removeStopRequests([...sheet.slice(0, i - 1), rows[i - 1], ...sheet.slice(i)], i, 7)).toHaveLength(1);
  });
});
