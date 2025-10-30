import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Employee view routes - use separate authentication
  if (pathname.startsWith('/employee-view')) {
    const employeeAuthCookie = request.cookies.get('employee_auth');
    const isEmployeeLoginPage = pathname === '/employee-view/login';

    // If employee is authenticated and trying to access login page, redirect to employee view
    if (employeeAuthCookie && isEmployeeLoginPage) {
      return NextResponse.redirect(new URL('/employee-view', request.url));
    }

    // If employee is not authenticated and not on login page, redirect to employee login
    if (!employeeAuthCookie && !isEmployeeLoginPage) {
      return NextResponse.redirect(new URL('/employee-view/login', request.url));
    }

    return NextResponse.next();
  }

  // Admin routes - use admin authentication
  const authCookie = request.cookies.get('auth');
  const isLoginPage = pathname === '/login';

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
