const allowed = (process.env.ALLOWED_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAllowedEmail(email: string | null | undefined): boolean {
  return !!email && allowed.includes(email.toLowerCase());
}

export type Person = 'alex' | 'sam';

/** First allowlisted address is Alex, second is Sam. */
export function personFor(email: string | null | undefined): Person {
  return email?.toLowerCase() === allowed[1] ? 'sam' : 'alex';
}
