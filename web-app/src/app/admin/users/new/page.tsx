"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createUser } from '@/services/userService';
import { UserRole } from '@/types/user';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import { useAuth } from '@/context/AuthContext';

export default function NewUserPage() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: '',
    role: UserRole.SCREENER, // Default role
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    if (!formData.email || !formData.firstName || !formData.lastName || !formData.password) {
      setError('All fields are required');
      return false;
    }
    
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return false;
    }
    
    return true;
  };

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!validateForm()) return;
    
    setIsLoading(true);
    
    try {
      const { error } = await createUser(formData);
      
      if (error) {
        setError(error.message || 'Failed to create user');
      } else {
        // Success - redirect back to users list
        router.push('/admin/users');
      }
    } catch (_) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center">
        <Link href="/admin/users" className="text-blue-600 hover:text-blue-800 mr-4">
          ← Back to Users
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">Create New User</h1>
      </div>
      
      <Card>
        <Card.Content>
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md border border-red-200">
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm h-10 px-3"
                value={formData.email}
                onChange={handleChange}
              />
            </div>
            
            {/* Name fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                  First Name <span className="text-red-500">*</span>
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
                  Last Name <span className="text-red-500">*</span>
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
            
            {/* Role */}
            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                Role <span className="text-red-500">*</span>
              </label>
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
            </div>
            
            {/* Password fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password <span className="text-red-500">*</span>
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm h-10 px-3"
                  value={formData.password}
                  onChange={handleChange}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Must be at least 8 characters long
                </p>
              </div>
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  Confirm Password <span className="text-red-500">*</span>
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm h-10 px-3"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                />
              </div>
            </div>
            
            {/* Form Actions */}
            <div className="flex justify-end space-x-3 pt-4">
              <Link href="/admin/users">
                <Button type="button" variant="outline" disabled={isLoading}>
                  Cancel
                </Button>
              </Link>
              <Button type="submit" isLoading={isLoading} disabled={isLoading}>
                {isLoading ? 'Creating...' : 'Create User'}
              </Button>
            </div>
          </form>
        </Card.Content>
      </Card>
    </div>
  );
}
