"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';

export default function ForgotPasswordPage() {
  const { forgotPassword, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    
    try {
      const { error } = await forgotPassword(email);
      if (error) {
        setError(error.message || 'Failed to send password reset email');
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error('Forgot password error:', err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gray-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
          Reset your password
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Enter your email to receive a password reset link
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
                We've sent a password reset link to your email. If you don't see it, check your spam folder. inbox.
              </div>
              <p className="mt-2 text-sm text-gray-600">
                Didn't receive an email? Check your spam folder or try again.
              </p>
              <Button
                variant="outline"
                onClick={() => setSuccess(false)}
                className="mt-4"
              >
                Try Again
              </Button>
              <div className="mt-4">
                <Link href="/auth/login" className="text-blue-600 hover:underline">
                  Return to login
                </Link>
              </div>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email address
                </label>
                <div className="mt-1">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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
                  {isLoading ? 'Sending...' : 'Send Reset Link'}
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
