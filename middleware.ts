import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const authCookie = request.cookies.get('auth');
  const isLoginPage = request.nextUrl.pathname === '/login';

  // If user is authenticated and trying to access login page, redirect to home
  if (authCookie && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // If user is not authenticated and not on login page, redirect to login
  if (!authCookie && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
