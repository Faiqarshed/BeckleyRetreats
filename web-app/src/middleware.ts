import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Define which routes should be protected
const protectedRoutes = [
  '/dashboard',
  '/participants',
  '/screenings',
  '/admin',
];

// Define public routes that don't need authentication
const publicRoutes = [
  '/',
  '/auth/login',
  '/auth/forgot-password',
  '/auth/reset-password',
];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  
  // Create a Supabase client configured for the middleware
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => req.cookies.get(name)?.value,
        set: (name, value, options) => {
          res.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove: (name, options) => {
          res.cookies.set({
            name,
            value: '',
            ...options,
            maxAge: 0,
          });
        },
      },
    }
  );
  
  // Check if the current route is protected
  const { pathname } = req.nextUrl;
  const isProtectedRoute = protectedRoutes.some(route => 
    pathname.startsWith(route) || pathname === route
  );

  // If it's not a protected route, allow the request to proceed
  if (!isProtectedRoute) {
    return res;
  }

  // Check if the user is authenticated
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // If no session and trying to access a protected route, redirect to login
  if (!session && isProtectedRoute) {
    const redirectUrl = new URL('/auth/login', req.url);
    // Add the original URL as a query parameter to redirect after login
    redirectUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
