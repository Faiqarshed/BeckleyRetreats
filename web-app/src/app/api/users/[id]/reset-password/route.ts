import { NextRequest, NextResponse } from 'next/server';
import { validateServerSession, AdminRole } from '@/lib/server-auth';
import { UserRole } from '@/types/user';


// POST to reset a user's password
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await the params Promise and get userId
    const resolvedParams = await params;
    const userId = resolvedParams.id;
    
    // Use production-ready authentication for password reset
    const requiredRoles: AdminRole[] = ['PROGRAM_OPERATIONS_ADMINISTRATOR', 'PROGRAM_OPERATIONS_MANAGER', 'SCREENER_LEAD'];
    const auth = await validateServerSession(requiredRoles);
    
    // If user is not authenticated or authorized, return error response
    if (!auth.authenticated || !auth.authorized || !auth.adminClient) {
      return auth.response || NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // First, fetch the current user to check their role
    const { data: currentUser, error: userFetchError } = await auth.adminClient
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .single();
    
    if (userFetchError || !currentUser) {
      return NextResponse.json({ error: userFetchError?.message || 'User not found' }, { status: 404 });
    }
    
    // Apply permission restrictions based on role
    if (auth.userRole === UserRole.PROGRAM_OPERATIONS_MANAGER && 
        currentUser.role === UserRole.PROGRAM_OPERATIONS_ADMINISTRATOR) {
      return NextResponse.json({ 
        error: 'Program Operations Managers cannot reset Administrator passwords' 
      }, { status: 403 });
    }
    
    // Apply restrictions for Screener Leads
    if (auth.userRole === UserRole.SCREENER_LEAD && 
        currentUser.role !== UserRole.SCREENER) {
      return NextResponse.json({ 
        error: 'Screener Leads can only reset passwords for Screeners' 
      }, { status: 403 });
    }
    
    // Parse the request body
    const requestData = await request.json();
    const { newPassword } = requestData;
    
    // Validate input
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 400 });
    }
    
    // Update the user password
    const { error } = await auth.adminClient.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error: any) {
    console.error('Error in POST /api/users/[id]/reset-password:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


