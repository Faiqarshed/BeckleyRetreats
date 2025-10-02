'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

// Component that uses searchParams wrapped in a Suspense boundary
function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  useEffect(() => {
    // Check if this is a password reset redirect from Supabase
    const token = searchParams.get('token');
    const type = searchParams.get('type');
    
    if (token && type === 'recovery') {
      // Redirect to our custom reset-password page with the token
      router.push(`/auth/reset-password?token=${token}&type=${type}`);
      return;
    }
    
    // Handle any other auth redirects
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    
    if (code || error) {
      router.push('/auth/login');
      return;
    }
    
    // For normal visits to the home page, redirect to dashboard if they're already logged in
    // or to login page if they're not
    if (!searchParams.has('token') && !searchParams.has('code') && !searchParams.has('error')) {
      router.push('/auth/login');
    }
  }, [router, searchParams]);
  
  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gray-50">
      <div className="p-8 bg-white rounded-lg shadow-md max-w-md w-full text-center">
        <h1 className="text-2xl font-bold mb-4">Beckley Retreats</h1>
        <p className="mb-4">Processing your request...</p>
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-sm text-gray-500">
          If you are not redirected in a few seconds,{' '}
          <Link href="/auth/login" className="text-blue-600 hover:underline">
            click here
          </Link>
        </p>
      </div>
    </div>
  );
}

// Loading fallback component
function HomeFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">Beckley Retreats</h1>
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto my-4"></div>
        <p className="text-gray-500">Loading...</p>
      </div>
    </div>
  );
}

// Main page component with suspense boundary
export default function HomePage() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeContent />
    </Suspense>
  );
}
