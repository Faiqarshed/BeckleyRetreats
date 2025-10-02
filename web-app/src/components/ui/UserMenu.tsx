"use client";

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { UserRole } from '@/types/user';

// Function to get role display name
const getRoleDisplayName = (role: UserRole): string => {
  switch (role) {
    case 'SCREENER_LEAD':
      return 'Screener Lead';
    case 'SCREENER':
      return 'Screener';
    case 'FACILITATOR':
      return 'Facilitator';
    case 'PROGRAM_OPERATIONS_MANAGER':
      return 'Program Operations Manager';
    case 'PROGRAM_OPERATIONS_ADMINISTRATOR':
      return 'Administrator';
    default:
      return role;
  }
};

export const UserMenu: React.FC = () => {
  const { userProfile, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuRef]);

  const handleSignOut = async () => {
    try {
      // First close the menu
      setIsOpen(false);
      // Then initiate sign out
      await signOut();
    } catch (error) {
      console.error('Error in UserMenu during sign out:', error);
    }
  };

  if (!userProfile) {
    return null;
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        className="flex items-center space-x-2 focus:outline-none hover:bg-gray-100 p-1.5 rounded-md transition-colors"
        onClick={() => setIsOpen(!isOpen)}
        title="Open user menu (contains logout option)"
      >
        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
          <span className="text-sm font-medium text-blue-700">
            {userProfile.firstName.charAt(0)}{userProfile.lastName.charAt(0)}
          </span>
        </div>
        <span className="hidden md:block text-sm font-medium">
          {userProfile.firstName} {userProfile.lastName}
        </span>
        <svg
          className="h-5 w-5 text-gray-400"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50">
          <div className="py-1" role="menu" aria-orientation="vertical">
            <div className="px-4 py-2 border-b">
              <p className="text-sm font-medium text-gray-900">{userProfile.firstName} {userProfile.lastName}</p>
              <p className="text-xs text-gray-500">{userProfile.email}</p>
              <p className="text-xs text-gray-500 mt-1">
                Role: {getRoleDisplayName(userProfile.role)}
              </p>
            </div>
            <Link
              href="/profile"
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              role="menuitem"
              onClick={() => setIsOpen(false)}
            >
              Your Profile
            </Link>
            <button
              className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 font-medium mt-1 border-t border-gray-100"
              role="menuitem"
              onClick={handleSignOut}
            >
              <span className="inline-flex items-center">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                </svg>
                Sign Out
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
