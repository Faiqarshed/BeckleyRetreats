import supabase from '@/lib/supabase';
import { UserRole } from '@/types/user';

// Interface for user data from database
export interface UserProfileDb {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

// Interface for creating a new user
export interface CreateUserData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

// Get all user profiles (admin function)
export const getAllUsers = async () => {
  try {
    const response = await fetch('/api/users');
    
    if (!response.ok) {
      const errorData = await response.json();
      return { data: null, error: new Error(errorData.error || 'Failed to fetch users') };
    }
    
    const { users } = await response.json();
    return { data: users, error: null };
  } catch (error) {
    console.error('Error fetching users:', error);
    return { data: null, error: error instanceof Error ? error : new Error('Unknown error occurred') };
  }
};

// Create a new user with auth and profile (admin function)
export const createUser = async ({ email, password, firstName, lastName, role }: CreateUserData) => {
  try {
    const response = await fetch('/api/users/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        firstName,
        lastName,
        role,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { error: new Error(errorData.error || 'Failed to create user') };
    }
    
    const data = await response.json();
    return { data: data.user, error: null };
  } catch (error) {
    console.error('Error creating user:', error);
    return { error: error instanceof Error ? error : new Error('Unknown error occurred') };
  }
};

// Update a user's profile (admin function)
export const updateUserProfile = async (
  userId: string, 
  data: { firstName?: string; lastName?: string; role?: UserRole; isActive?: boolean }
) => {
  try {
    const updateData: any = {};
    
    if (data.firstName !== undefined) updateData.first_name = data.firstName;
    if (data.lastName !== undefined) updateData.last_name = data.lastName;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.isActive !== undefined) updateData.is_active = data.isActive;
    updateData.updated_at = new Date().toISOString();
    
    const response = await fetch(`/api/users/${userId}/update`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      return { error: new Error(errorData.error || 'Failed to update user profile') };
    }
    
    return { error: null };
  } catch (error) {
    console.error('Error updating user profile:', error);
    return { error: error instanceof Error ? error : new Error('Unknown error occurred') };
  }
};

// Reset user password (admin function)
export const resetUserPassword = async (userId: string, newPassword: string) => {
  try {
    const response = await fetch(`/api/users/${userId}/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ newPassword }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      return { error: new Error(errorData.error || 'Failed to reset password') };
    }
    
    return { error: null };
  } catch (error) {
    console.error('Error resetting password:', error);
    return { error: error instanceof Error ? error : new Error('Unknown error occurred') };
  }
};

// Delete user (admin function)
export const deleteUser = async (userId: string) => {
  try {
    const response = await fetch(`/api/users/${userId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      return { error: new Error(errorData.error || 'Failed to delete user') };
    }
    
    return { error: null };
  } catch (error) {
    console.error('Error deleting user:', error);
    return { error: error instanceof Error ? error : new Error('Unknown error occurred') };
  }
};
