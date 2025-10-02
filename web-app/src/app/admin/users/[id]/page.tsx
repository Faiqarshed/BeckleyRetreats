"use client";

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { updateUserProfile, resetUserPassword, deleteUser, UserProfileDb } from '@/services/userService';
import { UserRole } from '@/types/user';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import supabase from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

// Define props structure compatible with App Router
type PageParams = {
  id: string;
};

// Main page component
export default function EditUserPage() {
  // Use useParams hook for route params
  const params = useParams();
  const userId = params.id as string;

  const router = useRouter();
  const { userProfile } = useAuth();
  
  const [user, setUser] = useState<UserProfileDb | null>(null);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    role: UserRole.SCREENER,
    isActive: true,
  });
  
  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Function to determine available roles based on current user's role
  const getAvailableRoles = () => {
    if (!userProfile) return [UserRole.SCREENER]; // Default fallback
    
    // Admins can assign any role
    if (userProfile.role === UserRole.PROGRAM_OPERATIONS_ADMINISTRATOR) {
      return [
        UserRole.SCREENER,
        UserRole.SCREENER_LEAD,
        UserRole.FACILITATOR,
        UserRole.PROGRAM_OPERATIONS_MANAGER,
        UserRole.PROGRAM_OPERATIONS_ADMINISTRATOR
      ];
    } 
    // Program Operations Managers can assign any role except Administrator
    else if (userProfile.role === UserRole.PROGRAM_OPERATIONS_MANAGER) {
      return [
        UserRole.SCREENER,
        UserRole.SCREENER_LEAD,
        UserRole.FACILITATOR,
        UserRole.PROGRAM_OPERATIONS_MANAGER
      ];
    } 
    // Screener Leads can only assign Screener role
    else if (userProfile.role === UserRole.SCREENER_LEAD) {
      return [UserRole.SCREENER];
    }
    
    // Default - no roles can be assigned
    return [];
  };
  
  // Check if user has permission to edit a role
  const canEditRole = () => {
    if (!userProfile || !user) return false;
    
    // Admin can edit any user's role
    if (userProfile.role === UserRole.PROGRAM_OPERATIONS_ADMINISTRATOR) return true;
    
    // Program Ops Manager can edit any role except Administrator
    if (userProfile.role === UserRole.PROGRAM_OPERATIONS_MANAGER && 
        user.role !== UserRole.PROGRAM_OPERATIONS_ADMINISTRATOR) return true;
    
    // Screener Lead can only edit Screeners
    if (userProfile.role === UserRole.SCREENER_LEAD && 
        user.role === UserRole.SCREENER) return true;
    
    return false;
  };

  // Load user data
  useEffect(() => {
    const fetchUser = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .single();
        
        if (error) {
          setError('Failed to load user');
          return;
        }
        
        if (data) {
          setUser(data);
          setFormData({
            firstName: data.first_name,
            lastName: data.last_name,
            role: data.role as UserRole,
            isActive: data.is_active,
          });
        }
      } catch (_) {
        setError('An unexpected error occurred');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchUser();
  }, [userId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: checked }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({ ...prev, [name]: value }));
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSaving(true);
    
    try {
      const { error } = await updateUserProfile(userId, formData);
      
      if (error) {
        setError(error.message || 'Failed to update user');
      } else {
        setSuccess('User updated successfully');
      }
    } catch (_) {
      setError('An unexpected error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    // Validate passwords
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    if (passwordData.newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    
    setIsResetting(true);
    
    try {
      const { error } = await resetUserPassword(userId, passwordData.newPassword);
      
      if (error) {
        setError(error.message || 'Failed to reset password');
      } else {
        setSuccess('Password reset successfully');
        setPasswordData({
          newPassword: '',
          confirmPassword: '',
        });
      }
    } catch (_) {
      setError('An unexpected error occurred');
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeleteUser = async () => {
    setError(null);
    setSuccess(null);
    setIsDeleting(true);
    
    try {
      const { error } = await deleteUser(userId);
      
      if (error) {
        setError(error.message || 'Failed to delete user');
        setShowDeleteConfirm(false);
      } else {
        setSuccess('User deleted successfully');
        // Redirect to users list after successful deletion
        setTimeout(() => {
          router.push('/admin/users');
        }, 1500);
      }
    } catch (_) {
      setError('An unexpected error occurred');
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <div className="mb-6 flex items-center">
          <Link href="/admin/users" className="text-blue-600 hover:text-blue-800 mr-4">
            ← Back to Users
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">User Not Found</h1>
        </div>
        
        <Card>
          <Card.Content>
            <p className="text-gray-700">The requested user could not be found.</p>
            <div className="mt-4">
              <Link href="/admin/users">
                <Button>Return to Users</Button>
              </Link>
            </div>
          </Card.Content>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center">
        <Link href="/admin/users" className="text-blue-600 hover:text-blue-800 mr-4">
          ← Back to Users
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">Edit User</h1>
      </div>
      
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md border border-red-200">
          {error}
        </div>
      )}
      
      {success && (
        <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-md border border-green-200">
          {success}
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* User Profile Card */}
        <Card>
          <Card.Header>
            <h2 className="text-lg font-medium">User Information</h2>
          </Card.Header>
          <Card.Content>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  readOnly
                  className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm h-10 px-3"
                  value={user.email}
                />
                <p className="mt-1 text-xs text-gray-500">Email cannot be changed</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                    First Name
                  </label>
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm h-10 px-3"
                    value={formData.firstName}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                    Last Name
                  </label>
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm h-10 px-3"
                    value={formData.lastName}
                    onChange={handleChange}
                  />
                </div>
              </div>
              
              <div>
                <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                  Role
                </label>
                {canEditRole() ? (
                  <select
                    id="role"
                    name="role"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm h-10 px-3"
                    value={formData.role}
                    onChange={handleChange}
                  >
                    {getAvailableRoles().includes(UserRole.SCREENER) && 
                      <option value={UserRole.SCREENER}>Screener</option>}
                    {getAvailableRoles().includes(UserRole.SCREENER_LEAD) && 
                      <option value={UserRole.SCREENER_LEAD}>Screener Lead</option>}
                    {getAvailableRoles().includes(UserRole.FACILITATOR) && 
                      <option value={UserRole.FACILITATOR}>Facilitator</option>}
                    {getAvailableRoles().includes(UserRole.PROGRAM_OPERATIONS_MANAGER) && 
                      <option value={UserRole.PROGRAM_OPERATIONS_MANAGER}>Program Operations Manager</option>}
                    {getAvailableRoles().includes(UserRole.PROGRAM_OPERATIONS_ADMINISTRATOR) && 
                      <option value={UserRole.PROGRAM_OPERATIONS_ADMINISTRATOR}>Administrator</option>}
                  </select>
                ) : (
                  <div>
                    <input
                      type="text"
                      className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm sm:text-sm h-10 cursor-not-allowed px-3"
                      value={(() => {
                        switch (formData.role) {
                          case UserRole.SCREENER: return 'Screener';
                          case UserRole.SCREENER_LEAD: return 'Screener Lead';
                          case UserRole.FACILITATOR: return 'Facilitator';
                          case UserRole.PROGRAM_OPERATIONS_MANAGER: return 'Program Operations Manager';
                          case UserRole.PROGRAM_OPERATIONS_ADMINISTRATOR: return 'Administrator';
                          default: return formData.role;
                        }
                      })()}
                      disabled
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      You do not have permission to change this user's role.
                    </p>
                  </div>
                )}
              </div>
              
              <div className="flex items-center">
                <input
                  id="isActive"
                  name="isActive"
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={formData.isActive}
                  onChange={handleCheckboxChange}
                />
                <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
                  Active Account
                </label>
              </div>
              
              <div className="pt-2">
                <Button
                  type="submit"
                  isLoading={isSaving}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </Card.Content>
        </Card>
        
        {/* Reset Password Card */}
        <Card>
          <Card.Header>
            <h2 className="text-lg font-medium">Reset Password</h2>
          </Card.Header>
          <Card.Content>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
                  New Password
                </label>
                <input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm h-10 px-3"
                  value={passwordData.newPassword}
                  onChange={handlePasswordChange}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Must be at least 8 characters long
                </p>
              </div>
              
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm h-10 px-3"
                  value={passwordData.confirmPassword}
                  onChange={handlePasswordChange}
                />
              </div>
              
              <div className="pt-2">
                <Button
                  type="submit"
                  isLoading={isResetting}
                  disabled={isResetting}
                >
                  {isResetting ? 'Resetting...' : 'Reset Password'}
                </Button>
              </div>
            </form>
          </Card.Content>
        </Card>

        {/* Delete User Card */}
        <Card>
          <Card.Header>
            <h2 className="text-lg font-medium text-red-600">Danger Zone</h2>
          </Card.Header>
          <Card.Content>
            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                Deleting this user will permanently remove their account and all associated data. This action cannot be undone.
              </p>
              
              {!showDeleteConfirm ? (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Delete User
                </Button>
              ) : (
                <div className="border border-red-300 bg-red-50 p-4 rounded-md">
                  <h3 className="text-red-700 font-medium mb-2">Are you sure?</h3>
                  <p className="text-sm text-red-600 mb-4">
                    This will permanently delete the user account for {user.first_name} {user.last_name} ({user.email}).
                  </p>
                  <div className="flex space-x-3">
                    <Button
                      type="button"
                      variant="danger"
                      isLoading={isDeleting}
                      disabled={isDeleting}
                      onClick={handleDeleteUser}
                    >
                      {isDeleting ? 'Deleting...' : 'Yes, Delete User'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isDeleting}
                      onClick={() => setShowDeleteConfirm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}
