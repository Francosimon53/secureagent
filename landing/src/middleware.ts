import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Routes that require authentication
const protectedRoutes = ['/dashboard'];

// Routes that are always public
const publicRoutes = ['/', '/blog', '/docs', '/pricing', '/privacy', '/login', '/register', '/api'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if the route is protected
  const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));

  // Check if the route is public
  const isPublicRoute = publicRoutes.some((route) => {
    if (route === '/') return pathname === '/';
    return pathname.startsWith(route);
  });

  // Allow public routes
  if (isPublicRoute && !isProtectedRoute) {
    return NextResponse.next();
  }

  // Check for authentication on protected routes
  if (isProtectedRoute) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET || 'your-development-secret-change-in-production',
    });

    // If not authenticated, redirect to login
    if (!token) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*|api/auth).*)',
  ],
};
