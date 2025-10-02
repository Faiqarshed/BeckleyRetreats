import { NextRequest, NextResponse } from 'next/server';
import { verifyUserAuth } from '@/lib/auth-utils';
import { UserRole } from '@/types/user';


// PATCH to update user profile
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await the params Promise and get userId
    const resolvedParams = await params;
    const userId = resolvedParams.id;
    
    // Verify user is authenticated and has admin privileges
    const auth = await verifyUserAuth(['PROGRAM_OPERATIONS_ADMINISTRATOR', 'PROGRAM_OPERATIONS_MANAGER', 'SCREENER_LEAD']);
    
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
    
    // Parse the request body
    const updateData = await request.json();
    
    // Apply permission restrictions based on role
    if (auth.userRole === UserRole.PROGRAM_OPERATIONS_MANAGER) {
      // Program Operations Managers cannot modify Administrator accounts
      if (currentUser.role === UserRole.PROGRAM_OPERATIONS_ADMINISTRATOR) {
        return NextResponse.json({ error: 'Unauthorized to modify administrator accounts' }, { status: 403 });
      }
      
      // Program Operations Managers cannot assign Administrator role
      if (updateData.role === UserRole.PROGRAM_OPERATIONS_ADMINISTRATOR) {
        return NextResponse.json({ error: 'Unauthorized to assign administrator role' }, { status: 403 });
      }
    }
    
    // Apply the same restriction to Screener Leads
    if (auth.userRole === UserRole.SCREENER_LEAD) {
      // Can only modify Screener accounts
      if (currentUser.role !== UserRole.SCREENER) {
        return NextResponse.json({ error: 'Screener Leads can only modify Screener accounts' }, { status: 403 });
      }
      
      // Can only assign Screener role
      if (updateData.role && updateData.role !== UserRole.SCREENER) {
        return NextResponse.json({ error: 'Screener Leads can only assign Screener role' }, { status: 403 });
      }
    }
    
    // Use admin client to update the user
    const { error } = await auth.adminClient
      .from('user_profiles')
      .update(updateData)
      .eq('id', userId);
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error: any) {
    console.error('Error in PATCH /api/users/[id]/update:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
