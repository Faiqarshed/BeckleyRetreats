"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DashboardLayout from '@/components/layout/DashboardLayout';

export default function ProfilePage() {
  const { userProfile, updateUserProfile, isLoading } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPasswordChangeVisible, setIsPasswordChangeVisible] = useState(false);

  useEffect(() => {
    if (userProfile) {
      setFirstName(userProfile.firstName || '');
      setLastName(userProfile.lastName || '');
      setEmail(userProfile.email || '');
    }
  }, [userProfile]);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    try {
      const { error } = await updateUserProfile({
        firstName,
        lastName,
      });
      
      if (error) {
        setError(error.message || 'Failed to update profile');
      } else {
        setSuccess('Profile updated successfully');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    // Validate password
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    
    try {
      // Proper implementation will be added in a future update
      setError('Password change functionality coming soon');
    } catch (err) {
      setError('An unexpected error occurred');
    }
  };

  if (!userProfile) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-2xl font-semibold text-gray-900 mb-6">Your Profile</h1>
            <div className="animate-pulse">
              <Card>
                <Card.Header>
                  <div className="h-6 bg-gray-200 rounded w-1/4"></div>
                </Card.Header>
                <Card.Content>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
                        <div className="h-12 bg-gray-200 rounded w-full"></div>
                      </div>
                      <div>
                        <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
                        <div className="h-12 bg-gray-200 rounded w-full"></div>
                      </div>
                    </div>
                    <div>
                      <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                      <div className="h-12 bg-gray-200 rounded w-full"></div>
                      <div className="h-3 bg-gray-100 rounded w-2/3 mt-1"></div>
                    </div>
                    <div className="pt-3">
                      <div className="h-10 bg-gray-200 rounded w-32"></div>
                    </div>
                  </div>
                </Card.Content>
              </Card>
              
              <div className="mt-6">
                <Card>
                  <Card.Header>
                    <div className="h-6 bg-gray-200 rounded w-1/5"></div>
                  </Card.Header>
                  <Card.Content>
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
                    <div className="h-10 bg-gray-200 rounded w-40"></div>
                  </Card.Content>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-semibold text-gray-900 mb-6">Your Profile</h1>
          
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
          
          <Card>
            <Card.Header>
              <h2 className="text-lg font-medium">Personal Information</h2>
            </Card.Header>
            <Card.Content>
              <form onSubmit={handleProfileUpdate} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                      First Name
                    </label>
                    <input
                      id="firstName"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm h-12 px-3"
                    />
                  </div>
                  <div>
                    <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name
                    </label>
                    <input
                      id="lastName"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm h-12 px-3"
                    />
                  </div>
                </div>
                
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    readOnly
                    className="block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm h-12 px-3"
                  />
                  <p className="mt-1 text-xs text-gray-500">Email cannot be changed. Contact an administrator for assistance.</p>
                </div>
                
                <div className="pt-3">
                  <Button
                    type="submit"
                    isLoading={isLoading}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </Card.Content>
          </Card>
          
          <div className="mt-6">
            <Card>
              <Card.Header>
                <h2 className="text-lg font-medium">Security</h2>
              </Card.Header>
              <Card.Content>
                {!isPasswordChangeVisible ? (
                  <div>
                    <p className="text-sm text-gray-600 mb-4">
                      Change your password to keep your account secure.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setIsPasswordChangeVisible(true)}
                    >
                      Change Password
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handlePasswordChange} className="space-y-4">
                    <div>
                      <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
                        Current Password
                      </label>
                      <input
                        id="currentPassword"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm h-12 px-3"
                        required
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                        New Password
                      </label>
                      <input
                        id="newPassword"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm h-12 px-3"
                        required
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                        Confirm New Password
                      </label>
                      <input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm h-12 px-3"
                        required
                      />
                    </div>
                    
                    <div className="pt-3 flex space-x-3">
                      <Button
                        type="submit"
                        isLoading={isLoading}
                        disabled={isLoading}
                      >
                        {isLoading ? 'Updating...' : 'Update Password'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsPasswordChangeVisible(false);
                          setCurrentPassword('');
                          setNewPassword('');
                          setConfirmPassword('');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}
              </Card.Content>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
