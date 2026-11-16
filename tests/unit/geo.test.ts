import { describe, expect, it } from 'vitest';
import { metres, nearestNode, shortStation, walkMinutes } from '@/lib/trip/geo';

describe('geo helpers', () => {
  it('measures and turns distance into a walk', () => {
    const m = metres({ lat: 34.6873, lng: 135.5262 }, { lat: 34.6804, lng: 135.534 });
    expect(m).toBeGreaterThan(1000);
    expect(m).toBeLessThan(1100);
    expect(walkMinutes(m)).toBe(18);
    expect(walkMinutes(10)).toBe(1);
  });
  it('shortens station names', () => {
    expect(shortStation('Namba Station')).toBe('Namba');
    expect(shortStation('難波駅')).toBe('難波');
  });
  it('picks the closest named station, English name first', () => {
    const from = { lat: 34.6873, lng: 135.5262 };
    expect(
      nearestNode(from, [
        { lat: 34.6804, lon: 135.534, tags: { name: '森ノ宮', 'name:en': 'Morinomiya' } },
        { lat: 34.6865, lon: 135.5265, tags: { name: '大阪ビジネスパーク', 'name:en': 'Osaka Business Park' } },
        { lat: 34.6873, lon: 135.5262 },
      ]),
    ).toEqual({ name: 'Osaka Business Park', lat: 34.6865, lng: 135.5265 });
    expect(nearestNode(from, [])).toBeNull();
  });
});
