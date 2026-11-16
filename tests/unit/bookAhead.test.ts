import { describe, expect, it } from 'vitest';
import { bookAheadLevel } from '@/lib/trip/bookAhead';

describe('bookAheadLevel', () => {
  it('ignores blanks and "no pre-booking" notes', () => {
    expect(bookAheadLevel('')).toBeNull();
    expect(bookAheadLevel('   ')).toBeNull();
    expect(bookAheadLevel('No pre-booking needed: buy on the day')).toBeNull();
  });

  it('marks "Optional" notes as optional', () => {
    expect(bookAheadLevel('Optional: e-ticket skips the queue')).toBe('optional');
  });

  it('treats everything else as needing a booking', () => {
    expect(bookAheadLevel('Recommended, not a must: Nozomi seats')).toBe('book');
    expect(bookAheadLevel('✏️ BEFORE FLYING: fill in Visit Japan Web')).toBe('book');
  });
});
