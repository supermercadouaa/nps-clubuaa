import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/dashboard') && !pathname.startsWith('/dashboard/login')) {
    const token = req.cookies.get('nps_session')?.value;
    if (!token) {
      return NextResponse.redirect(new URL('/dashboard/login', req.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*'],
};
