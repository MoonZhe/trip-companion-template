import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { forecastFor } from '@/lib/push/forecast';

afterEach(() => vi.unstubAllGlobals());

describe('forecastFor', () => {
  it('gives up on a stalled weather request so the brief still goes out', async () => {
    // A request that only ends when it's aborted, like a connection that hangs.
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const started = Date.now();
    await expect(forecastFor('OSAKA', '2026-10-24')).resolves.toBeNull();
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(Date.now() - started).toBeLessThan(6000);
  }, 10000);

  it('returns null for a city it has no forecast point for', async () => {
    await expect(forecastFor('SAPPORO', '2026-10-24')).resolves.toBeNull();
  });
});
