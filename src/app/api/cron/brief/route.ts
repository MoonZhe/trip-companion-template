import type { NextRequest } from 'next/server';
import { sendScheduled } from '@/lib/push/cron';

export const dynamic = 'force-dynamic';

/** Vercel cron, 08:00 Tokyo each day: the morning brief. */
export const GET = (request: NextRequest) => sendScheduled(request, 'morning');
