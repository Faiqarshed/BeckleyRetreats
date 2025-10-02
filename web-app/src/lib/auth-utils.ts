import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// Define interface for role types
type AdminRole = 'PROGRAM_OPERATIONS_ADMINISTRATOR' | 'PROGRAM_OPERATIONS_MANAGER' | 'SCREENER_LEAD';

// Create admin client with service role - for server-side operations that bypass RLS
export const createAdminClient = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    {
      auth: {
        persistSession: false,
      },
    }
  );
};

/**
 * Create a secure Supabase client for server-side API routes
 * This properly handles cookies and auth state
 */
export const createServerSupabaseClient = () => {
  // Create a new instance for each request
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      // Define cookie handling - this approach is compatible with Next.js App Router
      cookies: {
        get(name: string) {
          // Use cookies() directly and handle it properly
          const cookieStore = cookies();
          const cookie = cookieStore.get(name);
          return cookie?.value;
        },
        set(name: string, value: string, options: any) {
          // Route handlers don't need to implement this
          // Cookies are set through response headers
        },
        remove(name: string, options: any) {
          // Route handlers don't need to implement this
          // Cookies are removed through response headers
        },
      },
    }
  );
};

/**
 * Verifies if the current user is authenticated and authorized based on roles
 * Production-ready implementation that uses proper session validation
 */
export const verifyUserAuth = async (requiredRoles?: AdminRole[]) => {
  const adminClient = createAdminClient();
  const supabase = createServerSupabaseClient();
  
  try {
    // Get the authenticated session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      console.error('No valid session found:', sessionError);
      return { 
        authenticated: false,
        authorized: false,
        response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      };
    }

    // If we have a session, get the current user's ID
    const userId = session.user.id;
    
    // If no roles are required, just return authenticated
    if (!requiredRoles || requiredRoles.length === 0) {
      return {
        authenticated: true,
        authorized: true,
        userId,
        adminClient
      };
    }
    
    // Use admin client to fetch the user's profile and check their role
    // Admin client bypasses RLS, ensuring we can check roles even if RLS would prevent it
    const { data: userProfile, error: profileError } = await adminClient
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .eq('is_active', true)
      .single();
    
    if (profileError || !userProfile) {
      console.error('Error fetching user profile or profile not found:', profileError);
      return { 
        authenticated: true,
        authorized: false,
        response: NextResponse.json({ error: 'Forbidden: User profile not found or inactive' }, { status: 403 })
      };
    }
    
    // Check if the user's role is in the list of required roles
    const hasRequiredRole = requiredRoles.includes(userProfile.role as AdminRole);
    
    if (!hasRequiredRole) {
      console.error(`User has role ${userProfile.role} but requires one of:`, requiredRoles);
      return { 
        authenticated: true,
        authorized: false,
        response: NextResponse.json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 })
      };
    }
    
    // User is authenticated and has the required role
    return { 
      authenticated: true,
      authorized: true,
      userId,
      userRole: userProfile.role as AdminRole,
      adminClient,
      supabase
    };
  } catch (error) {
    console.error('Auth verification error:', error);
    return { 
      authenticated: false,
      authorized: false,
      response: NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    };
  }
};
