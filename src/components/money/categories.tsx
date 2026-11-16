'use client';
import { Bed, DotsThree, ForkKnife, ShoppingBag, Ticket, Train, type Icon } from '@phosphor-icons/react';
import type { Category } from '@/lib/money/compute';

export const CATEGORY_UI: Record<Category, { label: string; Icon: Icon }> = {
  food: { label: 'Food', Icon: ForkKnife },
  transport: { label: 'Transport', Icon: Train },
  activities: { label: 'Activities', Icon: Ticket },
  shopping: { label: 'Shopping', Icon: ShoppingBag },
  hotel: { label: 'Hotel', Icon: Bed },
  other: { label: 'Other', Icon: DotsThree },
};

/** Guess a category from the itinerary's own category label. Hotels are prepaid, so they fall to 'other'. */
export function categoryFromStop(sheetCategory: string): Category {
  const c = sheetCategory.toLowerCase();
  if (c.includes('food')) return 'food';
  if (c.includes('transport')) return 'transport';
  if (c.includes('shop')) return 'shopping';
  if (/culture|sightseeing|nature|relax|experience/.test(c)) return 'activities';
  return 'other';
}
