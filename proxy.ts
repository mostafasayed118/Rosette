import { NextResponse, type NextRequest } from 'next/server';
import { resolveLocaleRouting } from '@/lib/locale-routing';

export function proxy(request: NextRequest) {
  const decision = resolveLocaleRouting(request.nextUrl.pathname);
  if (decision.type === 'redirect') {
    return NextResponse.redirect(new URL(decision.to, request.url));
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-locale', decision.locale);
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  const city = segments[1];
  if (city) requestHeaders.set('x-city', city);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set('rosette.locale', decision.locale, { path: '/', sameSite: 'lax' });
  return response;
}

export const config = {
  // Skip API routes, the admin area, the admin login, Next internals, and any
  // file path (static assets, sitemap.xml, robots.txt, favicon).
  matcher: ['/((?!api|admin|login|_next|.*\\..*).*)'],
};
