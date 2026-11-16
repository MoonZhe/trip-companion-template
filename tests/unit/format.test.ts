import { describe, expect, it } from 'vitest';
import { shortRm } from '@/lib/format';

describe('shortRm', () => {
  it.each([
    [0.4, '0'],
    [85.6, '86'],
    [999, '999'],
    [999.7, '1k'],
    [10000, '10k'],
    [1000, '1k'],
    [1240, '1.2k'],
    [12400, '12k'],
  ])('%f → %s', (n, s) => expect(shortRm(n)).toBe(s));
});
