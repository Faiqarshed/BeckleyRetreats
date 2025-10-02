'use client';

import { useAuth } from '@/context/AuthContext';
import { UserRole } from '@/types/user';
import Link from 'next/link';

export default function AdminDashboard() {
  const { userProfile } = useAuth();
  
  // Check if user has admin access
  const isAdmin = userProfile?.role === UserRole.PROGRAM_OPERATIONS_ADMINISTRATOR;
  const isManager = userProfile?.role === UserRole.PROGRAM_OPERATIONS_MANAGER;
  
  const adminModules = [
    {
      title: 'User Management',
      description: 'Manage user accounts and permissions',
      link: '/admin/users',
      icon: '👤',
      roles: [UserRole.PROGRAM_OPERATIONS_ADMINISTRATOR, UserRole.SCREENER_LEAD]
    },
    {
      title: 'Typeform Integration',
      description: 'Manage application forms and scoring configuration',
      link: '/admin/typeform',
      icon: '📋',
      roles: [UserRole.PROGRAM_OPERATIONS_ADMINISTRATOR, UserRole.PROGRAM_OPERATIONS_MANAGER]
    }
  ];
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {adminModules.map((module) => {
          // Check if user has access to this module
          const hasAccess = module.roles.includes(userProfile?.role as UserRole);
          
          return (
            <div 
              key={module.title} 
              className={`bg-white shadow-md rounded-lg overflow-hidden ${!hasAccess ? 'opacity-50' : ''}`}
            >
              <div className="p-6">
                <div className="flex items-center mb-4">
                  <span className="text-3xl mr-4">{module.icon}</span>
                  <h2 className="text-xl font-semibold">{module.title}</h2>
                </div>
                <p className="text-gray-600 mb-4">{module.description}</p>
                {hasAccess ? (
                  <Link 
                    href={module.link}
                    className="inline-block bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                  >
                    Access Module
                  </Link>
                ) : (
                  <span className="inline-block bg-gray-300 text-gray-600 font-bold py-2 px-4 rounded cursor-not-allowed">
                    No Access
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
