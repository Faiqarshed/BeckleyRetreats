"use client";

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';

// Component with search params wrapped in Suspense
function ResetPasswordContent() {
  const { resetPassword, isLoading } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [hasToken, setHasToken] = useState<boolean>(false);
  
  // Get token from URL if present
  const searchParams = useSearchParams();
  
  useEffect(() => {
    // Check if we have a token in the URL
    const token = searchParams.get('token') || searchParams.get('type');
    if (token) {
      setHasToken(true);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    // Validate password strength
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    
    try {
      const { error } = await resetPassword(password);
      if (error) {
        setError(error.message || 'Failed to reset password');
      } else {
        setSuccess(true);
        setPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gray-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
          Set New Password
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Create a new password for your account
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md border border-red-200">
              {error}
            </div>
          )}
          
          {success ? (
            <div className="text-center">
              <div className="p-3 bg-green-50 text-green-700 rounded-md border border-green-200 mb-4">
                Password successfully reset!
              </div>
              <p className="mt-2 text-sm text-gray-600 mb-4">
                Your password has been updated. You can now log in with your new password.
              </p>
              <Link href="/auth/login" className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md inline-block">
                Go to Login
              </Link>
            </div>
          ) : !hasToken ? (
            <div className="text-center">
              <div className="p-3 bg-yellow-50 text-yellow-700 rounded-md border border-yellow-200 mb-4">
                No reset token found
              </div>
              <p className="mt-2 text-sm text-gray-600 mb-4">
                Please use the reset link sent to your email, or request a new password reset.
              </p>
              <Link href="/auth/forgot-password" className="text-blue-600 hover:underline">
                Request Password Reset
              </Link>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                New Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm h-12 px-3"
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                Confirm New Password
              </label>
              <div className="mt-1">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm h-12 px-3"
                />
              </div>
            </div>

            <div>
              <Button
                type="submit"
                fullWidth
                isLoading={isLoading}
                disabled={isLoading}
                className="flex justify-center py-2 px-4"
              >
                {isLoading ? 'Updating...' : 'Reset Password'}
              </Button>
            </div>

            <div className="text-center mt-4">
              <Link href="/auth/login" className="text-blue-600 hover:underline text-sm">
                Back to login
              </Link>
            </div>
          </form>
          )}
        </div>
      </div>
    </div>
  );
}

// Loading fallback component
function ResetPasswordFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">Loading...</h2>
        <p className="text-gray-500">Please wait</p>
      </div>
    </div>
  );
}

// Main page component with suspense boundary for useSearchParams
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
