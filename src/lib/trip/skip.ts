import type { Stop } from '@/lib/sheet/types';
import { ADDED_MARK } from '@/lib/sheet/insert';

/**
 * Skipping a stop is a tick under its own key in the shared checks: it syncs to both phones,
 * works offline and never touches the sheet. Skipped stops drop out of Now/Next, leave-by, the
 * day's planned spend and its progress.
 */
export const skipKey = (stopKey: string) => `skip:${stopKey}`;

export const isSkipped = (checks: ReadonlySet<string>, stop: Pick<Stop, 'key'>) => checks.has(skipKey(stop.key));

/** Added from the app's "Add a stop", so the app may delete it (planned stops stay put). */
export const isAddedStop = (stop: Pick<Stop, 'tips'>) => stop.tips.trimStart().startsWith(ADDED_MARK);
