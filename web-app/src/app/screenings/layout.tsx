"use client";

import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function ScreeningsLayout({ children }: { children: React.ReactNode }) {
  const { userProfile, isLoading } = useAuth();
  const router = useRouter();

  // Show loading state while checking permissions
  if (isLoading || !userProfile) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="animate-pulse flex space-x-4">
            <div className="flex-1 space-y-6 py-1">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6"></div>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Render children with the dashboard layout
  return <DashboardLayout>{children}</DashboardLayout>;
}
