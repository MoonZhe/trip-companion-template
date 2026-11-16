import { TripSkeleton } from '@/components/ui/States';

/** Shown instantly while a tab that wasn't loaded ahead of time comes in. */
export default function Loading() {
  return <TripSkeleton />;
}
