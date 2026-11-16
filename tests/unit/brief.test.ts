import { describe, expect, it } from 'vitest';
import type { Day, Stop } from '@/lib/sheet/types';
import { buildBrief, buildEvening, hourLabel, type BriefWeather } from '@/lib/push/brief';

const stop = (over: Partial<Stop>): Stop => ({
  key: 'k',
  day: 3,
  date: '',
  time: '10:00',
  title: 'Stop',
  tips: '',
  duration: '',
  travelNext: '',
  costJpy: null,
  category: '',
  isOption: false,
  bookAhead: '',
  ...over,
});

const day = (over: Partial<Day> = {}): Day => ({
  day: 3,
  label: 'Day 3',
  dateLabel: '',
  isoDate: '2026-10-26',
  city: 'OSAKA → KYOTO',
  stops: [
    stop({ time: '08:00', title: '[Option A] Early swim', isOption: true }),
    stop({ time: '9:30', title: 'Morning shrine' }),
    stop({ time: '11:00', title: 'Later thing' }),
  ],
  ...over,
});

const w = (over: Partial<BriefWeather> = {}): BriefWeather => ({
  code: 61,
  max: 19,
  min: 12,
  rain: 60,
  rainFrom: 15,
  morning: 14,
  ...over,
});

describe('buildBrief', () => {
  it('builds the title, weather and first stop', () => {
    const b = buildBrief(day(), w());
    expect(b.title).toBe('Day 3 · Kyoto');
    expect(b.tag).toBe('morning-brief');
    expect(b.body).toBe('🌧 19° / 12° · rain from 3pm, take an umbrella\nFirst up: 9:30 Morning shrine');
  });

  it('gives the rain chance when it stays mostly dry', () => {
    expect(buildBrief(day(), w({ code: 1, rain: 10, rainFrom: null })).body.split('\n')[0]).toBe('☀ 19° / 12° · rain 10%');
  });

  it('says rain all day when it starts by 8am', () => {
    expect(buildBrief(day(), w({ rainFrom: 8 })).body.split('\n')[0]).toContain('rain likely all day');
  });

  it('adds a layer tip on a cold morning', () => {
    expect(buildBrief(day(), w({ morning: 9 })).body.split('\n')[1]).toBe('🧥 Cold morning (9°), bring a layer');
    expect(buildBrief(day(), w({ morning: 13 })).body).not.toContain('Cold morning');
  });

  it('adds the moving-day reminder, with the checkout time when known', () => {
    expect(buildBrief(day(), null, { moving: { at: '10:00' } }).body.split('\n')[0]).toBe(
      '🧳 Moving day: checkout 10:00, bring the luggage',
    );
    expect(buildBrief(day(), null, { moving: { at: null } }).body.split('\n')[0]).toBe(
      '🧳 Moving day: checkout, bring the luggage',
    );
  });

  it("lists today's saved tickets", () => {
    const b = buildBrief(day(), null, {
      tickets: [
        { time: '14:00', title: 'teamLab' },
        { time: '18:00', title: 'Sky deck' },
      ],
    });
    expect(b.body.split('\n').at(-1)).toBe('🎟 Tickets saved: teamLab 14:00, Sky deck 18:00');
  });

  it('takes the first non-option stop in sheet order', () => {
    // "9:30" sorts after "11:00" as text, so order must come from the sheet.
    expect(buildBrief(day(), null).body).toBe('First up: 9:30 Morning shrine');
  });

  it('is empty without weather or plain stops', () => {
    expect(buildBrief(day({ stops: [stop({ isOption: true })] }), null).body).toBe('');
  });

  it('keeps the body under 240 characters', () => {
    const long = { time: '10:00', title: 'T'.repeat(60) };
    const b = buildBrief(day({ stops: [stop({ title: 'B'.repeat(90) })] }), w({ morning: 5 }), {
      moving: { at: '10:00' },
      tickets: [long, long, long, long],
    });
    expect(b.body.length).toBeLessThanOrEqual(240);
  });
});

describe('buildEvening', () => {
  it("previews tomorrow's weather, move and first stop, without tickets", () => {
    const b = buildEvening(day(), w(), { moving: { at: '10:00' }, tickets: [{ time: '14:00', title: 'teamLab' }] });
    expect(b.title).toBe('Tomorrow · Day 3 · Kyoto');
    expect(b.tag).toBe('evening-preview');
    expect(b.body.split('\n')).toEqual([
      '🌧 19° / 12° · rain from 3pm, take an umbrella',
      '🧳 Moving day: checkout 10:00, bring the luggage',
      'First up: 9:30 Morning shrine',
    ]);
  });
});

describe('hourLabel', () => {
  it.each([
    [9, '9am'],
    [12, 'noon'],
    [15, '3pm'],
    [22, '10pm'],
  ])('%i → %s', (h, label) => expect(hourLabel(h)).toBe(label));
});
