"use client";

import React, { useState } from 'react';
import UserMenu from '@/components/ui/UserMenu';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false); // For mobile view
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // For desktop view
  const pathname = usePathname();
  
  // Navigation items - these will vary based on user role in the real implementation
  const navigationItems = [
    { name: 'Screenings', href: '/screenings' },
    { name: 'Applications', href: '/applications' },
    { name: 'Participants', href: '/participants' },
    { name: 'Admin', href: '/admin', 
      subItems: [
        { name: 'Users', href: '/admin/users' },
        { name: 'Typeform', href: '/admin/typeform' }
      ] 
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 md:hidden"
          onClick={() => setSidebarOpen(false)} 
        />
      )}
      
      {/* Sidebar */}
      <div 
        className={`fixed inset-y-0 left-0 z-50 bg-white border-r border-gray-200 transform transition-all duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${
          sidebarCollapsed ? 'md:w-16' : 'md:w-64'
        } ${
          sidebarCollapsed ? 'md:translate-x-0' : 'md:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Sidebar header */}
          <div className="h-20 flex items-center border-b border-gray-200 pl-4">
            <div className={`relative h-16 ${sidebarCollapsed ? 'w-16' : 'w-64'} overflow-hidden transition-all duration-300 ease-in-out`}>
              <Image 
                src="/brand/beckley retreats logo black.png" 
                alt="Beckley Retreats Logo"
                fill
                style={{ objectFit: 'contain', objectPosition: 'left center' }}
                priority
                className={sidebarCollapsed ? 'scale-75 origin-left' : ''}
              />
            </div>
            <button 
              className="ml-auto md:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <span className="text-lg">✕</span>
            </button>
          </div>
          
          {/* Sidebar navigation */}
          <nav className={`flex-1 ${sidebarCollapsed ? 'px-2' : 'px-4'} py-4 space-y-1 overflow-y-auto`}>
            {navigationItems.map((item) => {
              // Check if this navigation item is active
              const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              const hasSubItems = item.subItems && item.subItems.length > 0;
              
              return (
                <div key={item.name}>
                  <Link
                    href={item.href}
                    className={`flex items-center ${sidebarCollapsed ? 'justify-center' : ''} px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive && !sidebarCollapsed
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                    title={sidebarCollapsed ? item.name : ''}
                  >
                    {/* Icon placeholder removed */}
                    {!sidebarCollapsed && (
                      <>
                        <span>{item.name}</span>
                        {hasSubItems && (
                          <span className="ml-auto text-sm">
                            {isActive ? '▼' : '▶'}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                  
                  {/* Render sub-items if this section is active and not collapsed */}
                  {hasSubItems && isActive && !sidebarCollapsed && (
                    <div className={`mt-1 ${sidebarCollapsed ? 'ml-0' : 'ml-6'} space-y-1`}>
                      {item.subItems.map((subItem) => {
                        const isSubItemActive = pathname === subItem.href || pathname?.startsWith(`${subItem.href}/`);
                        return (
                          <Link
                            key={subItem.name}
                            href={subItem.href}
                            className={`flex items-center ${sidebarCollapsed ? 'justify-center' : ''} px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                              isSubItemActive && !sidebarCollapsed
                                ? 'bg-blue-50 text-blue-700'
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                            title={sidebarCollapsed ? subItem.name : ''}
                          >
                            <span>{subItem.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
          
          {/* Sidebar collapse toggle button */}
          <div className="border-t border-gray-200 p-2 flex justify-center mt-auto">
            <button
              className="text-gray-500 hover:text-gray-700 rounded-full w-8 h-8 flex items-center justify-center"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <span className="text-xl">{sidebarCollapsed ? '→' : '←'}</span>
            </button>
          </div>
        </div>
      </div>
      
      {/* Main content */}
      <div className={`transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'md:pl-16' : 'md:pl-64'}`}>
        {/* Top header */}
        <header className="h-20 bg-white border-b border-gray-200 flex items-center px-4 md:px-6">
          <div className="flex items-center">
            {/* Mobile menu button */}
            <button 
              className="md:hidden text-gray-500 hover:text-gray-700 mr-4"
              onClick={() => setSidebarOpen(true)}
            >
              <span className="text-xl">☰</span>
            </button>
          </div>
          <div className="ml-auto flex items-center space-x-4">
            <button className="text-gray-500 hover:text-gray-700">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
              </svg>
            </button>
            {/* User menu in header - more visible */}
            <div className="ml-4">
              <UserMenu />
            </div>
          </div>
        </header>
        
        {/* Page content */}
        <main className="p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
