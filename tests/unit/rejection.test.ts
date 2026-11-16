import { describe, expect, it } from 'vitest';
import { isPermanentRejection } from '@/lib/offline/rejection';

describe('isPermanentRejection', () => {
  it('drops bad data and broken constraints', () => {
    expect(isPermanentRejection({ status: 400, code: '22P02' })).toBe(true);
    expect(isPermanentRejection({ status: 409, code: '23505' })).toBe(true);
    expect(isPermanentRejection({ status: 400, code: 'PGRST204' })).toBe(true);
  });
  it('keeps writes that can work later: no signal, expired token, rate limit, server trouble', () => {
    expect(isPermanentRejection({ status: 0, code: '' })).toBe(false);
    expect(isPermanentRejection({ status: 401, code: 'PGRST301' })).toBe(false);
    expect(isPermanentRejection({ status: 403, code: '42501' })).toBe(false);
    expect(isPermanentRejection({ status: 408 })).toBe(false);
    expect(isPermanentRejection({ status: 429 })).toBe(false);
    expect(isPermanentRejection({ status: 503, code: '' })).toBe(false);
    expect(isPermanentRejection({})).toBe(false);
  });
});
