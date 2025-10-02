import { NextRequest, NextResponse } from 'next/server';
import { validateServerSession, AdminRole } from '@/lib/server-auth';


// POST to create a new user
export async function POST(request: NextRequest) {
  try {
    // Use production-ready authentication for user creation (restricted to admins)
    const requiredRoles: AdminRole[] = ['PROGRAM_OPERATIONS_ADMINISTRATOR', 'PROGRAM_OPERATIONS_MANAGER'];
    const auth = await validateServerSession(requiredRoles);
    
    // If user is not authenticated or authorized, return error response
    if (!auth.authenticated || !auth.authorized || !auth.adminClient) {
      return auth.response || NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Parse the request body
    const userData = await request.json();
    const { email, password, firstName, lastName, role } = userData;
    
    if (!email || !password || !firstName || !lastName || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // Create the user with the admin client
    const { data: authData, error: authError } = await auth.adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm the email
    });
    
    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message || 'Failed to create user' }, { status: 500 });
    }
    
    // Create the user profile in the database
    const { error: profileError } = await auth.adminClient
      .from('user_profiles')
      .insert({
        id: authData.user.id,
        first_name: firstName,
        last_name: lastName,
        email,
        role,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    
    if (profileError) {
      // Try to clean up the auth user if profile creation fails
      await auth.adminClient.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true, user: { 
      id: authData.user.id,
      email,
      firstName,
      lastName,
      role
    } }, { status: 201 });
    
  } catch (error: any) {
    console.error('Error in POST /api/users/create:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
