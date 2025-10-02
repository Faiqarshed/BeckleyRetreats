import { NextRequest, NextResponse } from 'next/server';
import { validateServerSession, AdminRole } from '@/lib/server-auth';



// DELETE a user by ID
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await the params Promise and get userId
    const resolvedParams = await params;
    const userId = resolvedParams.id;
    
    // Use production-ready authentication for user deletion (restricted to top-level admin only)
    const requiredRoles: AdminRole[] = ['PROGRAM_OPERATIONS_ADMINISTRATOR'];
    const auth = await validateServerSession(requiredRoles);
    
    // If user is not authenticated or authorized, return error response
    if (!auth.authenticated || !auth.authorized || !auth.adminClient) {
      return auth.response || NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // First delete the user profile
    const { error: profileDeleteError } = await auth.adminClient
      .from('user_profiles')
      .delete()
      .eq('id', userId);
      
    if (profileDeleteError) {
      return NextResponse.json({ error: profileDeleteError.message }, { status: 500 });
    }
    
    // Then delete the auth user
    const { error: authDeleteError } = await auth.adminClient.auth.admin.deleteUser(userId);
    
    if (authDeleteError) {
      return NextResponse.json({ error: authDeleteError.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error: any) {
    console.error('Error in DELETE /api/users/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET a single user by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = params.id;
    
    // Use production-ready authentication for viewing user details
    const requiredRoles: AdminRole[] = ['PROGRAM_OPERATIONS_ADMINISTRATOR', 'PROGRAM_OPERATIONS_MANAGER', 'SCREENER_LEAD'];
    const auth = await validateServerSession(requiredRoles);
    
    // If user is not authenticated or authorized, return error response
    if (!auth.authenticated || !auth.authorized || !auth.adminClient) {
      return auth.response || NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data, error } = await auth.adminClient
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();
      
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    if (!data) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    return NextResponse.json({ user: data });
    
  } catch (error: any) {
    console.error('Error in GET /api/users/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
