import { NextResponse, type NextRequest } from 'next/server';

/** Fast redirect to /login when no session cookie exists. The API enforces real authorisation. */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has('es_session');
  const { pathname, search } = request.nextUrl;
  if (!hasSession && pathname !== '/login') {
    const url = new URL('/login', request.url);
    if (pathname !== '/') url.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|media|_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
