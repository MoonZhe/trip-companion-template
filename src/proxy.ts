import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isAllowedEmail } from '@/lib/allowlist';
import { sessionCheck } from '@/lib/supabase/claims';

// /api/cron: Vercel cron calls carry no session; the route checks CRON_SECRET itself.
const PUBLIC = ['/login', '/auth', '/private', '/api/cron'];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const session = await sessionCheck(supabase);
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC.some((p) => path === p || path.startsWith(`${p}/`));

  // Couldn't check (Supabase blip while refreshing the token): let the request through rather
  // than sending a signed-in phone to /login, which wipes its offline tickets and itinerary.
  if (session.state === 'unknown') {
    if (path.startsWith('/api/') && !isPublic)
      return NextResponse.json({ error: 'auth check failed, try again' }, { status: 503 });
    return response;
  }
  const user = session.state === 'in' ? { email: session.email } : null;

  const redirect = (to: string) => {
    const r = NextResponse.redirect(new URL(to, request.url));
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  if (!user && !isPublic) {
    if (path.startsWith('/api/')) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
    return redirect('/login');
  }
  if (user && !isAllowedEmail(user.email) && path !== '/private') {
    await supabase.auth.signOut();
    return redirect('/private');
  }
  if (user && path === '/login') return redirect('/');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|_vercel|favicon.ico|icons/|sw.js|manifest.webmanifest|.*\\.(?:png|svg|jpg|webp|ico)$).*)'],
};
