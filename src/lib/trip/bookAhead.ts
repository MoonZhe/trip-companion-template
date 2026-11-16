export type BookLevel = 'book' | 'optional';

/**
 * How urgent a stop's "Book in advance?" note is. Notes starting "Optional" are optional,
 * "No pre-booking needed" isn't a booking at all, and anything else needs arranging ahead.
 */
export function bookAheadLevel(note: string): BookLevel | null {
  const t = note.trim();
  if (!t || /^no pre-?booking/i.test(t)) return null;
  return /^optional/i.test(t) ? 'optional' : 'book';
}

export const BOOK_LABEL: Record<BookLevel, string> = {
  book: 'Book ahead',
  optional: 'Optional booking',
};
