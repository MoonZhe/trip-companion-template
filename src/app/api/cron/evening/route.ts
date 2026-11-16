import type { NextRequest } from 'next/server';
import { sendScheduled } from '@/lib/push/cron';

export const dynamic = 'force-dynamic';

/** Vercel cron, 21:00 Tokyo each day: tomorrow's preview. */
export const GET = (request: NextRequest) => sendScheduled(request, 'evening');
