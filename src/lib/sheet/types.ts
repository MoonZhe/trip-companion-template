export interface Stop {
  key: string;
  day: number;
  date: string;
  time: string;
  title: string;
  tips: string;
  duration: string;
  travelNext: string;
  costJpy: number | null;
  category: string;
  isOption: boolean;
  /** Text from the sheet's "Book in advance?" column; empty when nothing needs arranging. */
  bookAhead: string;
}

export interface Day {
  day: number;
  label: string;
  dateLabel: string;
  isoDate: string;
  city: string;
  stops: Stop[];
}

export interface Hotel {
  city: string;
  name: string;
  area: string;
  nightsLabel: string;
  notes: string;
  /** Name, address and phone in Japanese (Hotels column H), to show staff when asking the way. */
  ja: string;
}

export interface Flight {
  direction: 'outbound' | 'return';
  route: string;
  details: string;
  airline: string;
  departure: string;
  arrival: string;
  luggage: string;
}

export interface BudgetLine {
  section: string;
  item: string;
  jpy: number | null;
  rm: number;
}

export type Person = 'alex' | 'sam';

export interface PrePayment {
  type: string;
  desc: string;
  amountRm: number;
  payer: Person;
}

/**
 * Ringgit changed into yen so far, fees included (totals across exchanges), and any leftover yen
 * changed back. `rm` or `jpy` is 0 while only one of them is entered.
 */
export interface CashExchange {
  rm: number;
  jpy: number;
  backJpy?: number;
  backRm?: number;
  /** The sheet's History cell: one dated line per exchange made from the app. */
  history?: string;
}

export interface Trip {
  days: Day[];
  hotels: Hotel[];
  flights: Flight[];
  budget: BudgetLine[];
  prePayments: PrePayment[];
  /** From the Payment tab's cash exchange block; null until that person has changed money. */
  cashExchange: Record<Person, CashExchange | null>;
  /** From the Payment tab's Wise top-up block; null until that person has topped up. */
  wise: Record<Person, CashExchange | null>;
  jpyPerRm: number;
  fetchedAt: string;
  warnings: string[];
}

export interface RawSheet {
  itinerary: string[][];
  hotels: string[][];
  overview: string[][];
  budget: string[][];
  payment: string[][];
  jpyPerRm: string;
}

export class SheetFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SheetFormatError';
  }
}
