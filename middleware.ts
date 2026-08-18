import { NextResponse, type NextRequest } from 'next/server';
import { resolveLocaleRouting } from '@/lib/locale-routing';

export function middleware(request: NextRequest) {
  const decision = resolveLocaleRouting(request.nextUrl.pathname);
  if (decision.type === 'redirect') {
    return NextResponse.redirect(new URL(decision.to, request.url));
  }
  const response = NextResponse.next();
  response.cookies.set('rosette.locale', decision.locale, { path: '/', sameSite: 'lax' });
  return response;
}

export const config = {
  // Skip API routes, the admin area, the admin login, Next internals, and any
  // file path (static assets, sitemap.xml, robots.txt, favicon).
  matcher: ['/((?!api|admin|login|_next|.*\\..*).*)'],
};
