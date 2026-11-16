/** What a failed outbox write tells us: whether trying again later could ever work. */
export interface WriteFailure {
  /** HTTP status; 0 when the request never got an answer (offline, timed out). */
  status?: number;
  /** Postgres or PostgREST error code, e.g. '23505' or 'PGRST204'. */
  code?: string;
}

// Statuses that say "not now" rather than "never": signed-out or expired token, timeout, rate limit.
const RETRY_STATUSES = new Set([401, 403, 408, 429]);

/**
 * True when the server rejected the write for good (bad data, a broken constraint, an unknown
 * column), so keeping it would block the queue forever. Anything else (no signal, an expired
 * token, a busy or broken server) is kept and tried again on the next sync.
 */
export function isPermanentRejection({ status, code }: WriteFailure): boolean {
  if (code?.startsWith('22') || code?.startsWith('23')) return true;
  return status !== undefined && status >= 400 && status < 500 && !RETRY_STATUSES.has(status);
}
