import { describe, expect, it } from 'vitest';
import { groupByTripDay } from '@/lib/push/history';

const row = (id: string, sent_at: string) => ({ id, sent_at, title: id, body: '', rebuilt: false });

describe('groupByTripDay', () => {
  it('puts the newest day and the newest notification first, in Japan time', () => {
    const days = groupByTripDay([row('a', '2026-10-25T23:00:00Z'), row('b', '2026-10-26T12:00:00Z'), row('c', '2026-10-25T12:00:00Z')]);
    expect(days.map((d) => d.isoDate)).toEqual(['2026-10-26', '2026-10-25']);
    expect(days[0].items.map((n) => [n.id, n.time])).toEqual([
      ['b', '21:00'],
      ['a', '08:00'],
    ]);
  });

  it('keeps a notification after midnight on the day it belongs to', () => {
    const [day] = groupByTripDay([row('late', '2026-10-31T16:30:00Z')]);
    expect(day.isoDate).toBe('2026-10-31');
    expect(day.items[0].time).toBe('01:30');
  });
});
