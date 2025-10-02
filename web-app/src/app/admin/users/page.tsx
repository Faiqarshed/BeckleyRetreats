"use client";

import React, { useEffect, useState } from 'react';
import { getAllUsers, UserProfileDb } from '@/services/userService';
import { UserRole } from '@/types/user';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';

// Function to get role display name
const getRoleDisplayName = (role: UserRole): string => {
  switch (role) {
    case UserRole.SCREENER_LEAD:
      return 'Screener Lead';
    case UserRole.SCREENER:
      return 'Screener';
    case UserRole.FACILITATOR:
      return 'Facilitator';
    case UserRole.PROGRAM_OPERATIONS_MANAGER:
      return 'Program Operations Manager';
    case UserRole.PROGRAM_OPERATIONS_ADMINISTRATOR:
      return 'Administrator';
    default:
      return role;
  }
};

export default function UsersPage() {
  const { userProfile } = useAuth();
  const [users, setUsers] = useState<UserProfileDb[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load users on initial render
  useEffect(() => {
    const loadUsers = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const { data, error } = await getAllUsers();
        if (error) {
          setError('Failed to load users');
        } else if (data) {
          setUsers(data);
        }
      } catch (_) {
        setError('An unexpected error occurred');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadUsers();
  }, []);

  // Check if current user can edit other users based on role hierarchy
  const canManageUser = (targetUserRole: UserRole) => {
    if (!userProfile) return false;
    
    // Admins can manage everyone
    if (userProfile.role === UserRole.PROGRAM_OPERATIONS_ADMINISTRATOR) return true;
    
    // Program Ops Managers can manage all users EXCEPT administrators
    if (userProfile.role === UserRole.PROGRAM_OPERATIONS_MANAGER && 
        targetUserRole !== UserRole.PROGRAM_OPERATIONS_ADMINISTRATOR) return true;
    
    // Screener Leads can manage screeners
    if (userProfile.role === UserRole.SCREENER_LEAD && 
        targetUserRole === UserRole.SCREENER) return true;
    
    return false;
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-900">User Management</h1>
        <Link href="/admin/users/new">
          <Button>
            <span className="mr-2">+</span> New User
          </Button>
        </Link>
      </div>
      
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md border border-red-200">
          {error}
        </div>
      )}
      
      {isLoading ? (
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white p-4 rounded-md shadow">
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-md shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>

                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {user.first_name} {user.last_name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                        {getRoleDisplayName(user.role)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.is_active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {canManageUser(user.role) ? (
                        <Link 
                          href={`/admin/users/${user.id}`}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          Edit
                        </Link>
                      ) : (
                        <span className="text-gray-400 cursor-not-allowed">
                          Edit
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
