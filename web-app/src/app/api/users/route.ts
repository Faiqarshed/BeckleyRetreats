import { NextRequest, NextResponse } from 'next/server';
import { validateServerSession, AdminRole } from '@/lib/server-auth';

// GET all users
export async function GET(request: NextRequest) {
  try {
    // Use our production-ready authentication approach
    const requiredRoles: AdminRole[] = ['PROGRAM_OPERATIONS_ADMINISTRATOR', 'PROGRAM_OPERATIONS_MANAGER', 'SCREENER_LEAD'];
    const auth = await validateServerSession(requiredRoles);
    
    // If user is not authenticated or authorized, return error response
    if (!auth.authenticated || !auth.authorized || !auth.adminClient) {
      return auth.response || NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Use admin client to fetch all users without RLS restrictions
    const { data, error } = await auth.adminClient
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching users:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ users: data });
  } catch (error: any) {
    console.error('Error in GET /api/users:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
