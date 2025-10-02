"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import { UserRole } from '@/types/user';

type AuthContextType = {
  user: User | null;
  userProfile: UserProfile | null;
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{
    error: Error | null;
    data: Session | null;
  }>;
  signOut: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ error: any | null }>;
  resetPassword: (newPassword: string) => Promise<{ error: any | null }>;
  updateUserProfile: (data: { firstName: string; lastName: string }) => Promise<{ error: any | null }>;
};

// Interface for extended user profile information
export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();

  // Initialize session from Supabase
  useEffect(() => {
    const initializeAuth = async () => {
      // Check for existing session
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      
      if (initialSession) {
        setSession(initialSession);
        setUser(initialSession.user);
        await fetchUserProfile(initialSession.user.id);
      }

      // Listen for auth changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        
        // Handle different auth events
        if (event === 'SIGNED_IN' && currentSession) {
          await fetchUserProfile(currentSession.user.id);
          // Update last login time
          if (userProfile) {
            await supabase
              .from('user_profiles')
              .update({ last_login_at: new Date().toISOString() })
              .eq('id', currentSession.user.id);
          }
        } else if (event === 'SIGNED_OUT') {
          setUserProfile(null);
          router.push('/auth/login');
        }
      });

      setIsLoading(false);
      
      // Cleanup subscription
      return () => {
        subscription.unsubscribe();
      };
    };

    initializeAuth();
  }, [router]);

  // Fetch user profile data
  const fetchUserProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
      // First check if the user profile exists
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      // If profile exists, use it
      if (data && !error) {
        // Create the user profile object
        const profileData: UserProfile = {
          id: data.id,
          firstName: data.first_name || '',
          lastName: data.last_name || '',
          email: data.email || '',
          role: data.role as UserRole || UserRole.SCREENER,
          isActive: data.is_active ?? true,
          lastLoginAt: data.last_login_at ? new Date(data.last_login_at) : undefined,
          createdAt: new Date(data.created_at || new Date().toISOString()),
          updatedAt: new Date(data.updated_at || new Date().toISOString())
        };
        // Update the state
        setUserProfile(profileData);
        // Return the profile data
        return profileData;
      }

      // Handle case when profile not found
      if (error && (error.code === 'PGRST116' || error.code === '42P17')) { // Record not found or infinite recursion error
        // Don't try to do a redirect from inside fetchUserProfile, just clear the auth state
        console.warn('User profile not found');
        await supabase.auth.signOut();
        setUserProfile(null);
        setUser(null);
        setSession(null);
        return null;
      } else if (error) {
        // Other database errors should just clear auth state too
        console.warn('Error fetching user profile:', error);
        await supabase.auth.signOut();
        setUserProfile(null);
        setUser(null);
        setSession(null);
        return null;
      }
    } catch (err) {
      // Handle unexpected errors silently
      console.error('Unexpected error fetching user profile:', err);
      return null;
    }
    // Ensure we always have a return value
    return null;
  };

  // Sign in with email and password
  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    setIsLoading(false);
    
    if (!error && data?.session) {
      // After successful sign-in, verify profile exists before redirecting
      const userProfile = await fetchUserProfile(data.session.user.id);
      if (userProfile === null) {
        // Profile doesn't exist - already logged out by fetchUserProfile
        return { data: null, error: new Error('Your account does not have a profile. Please contact an administrator.') };
      }
      
      // Check if the user's account is inactive
      if (!userProfile.isActive) {
        // Sign out the user since they're inactive
        await supabase.auth.signOut();
        setUserProfile(null);
        setUser(null);
        setSession(null);
        
        // Return an error with the appropriate message
        return { 
          data: null, 
          error: new Error('Your account is inactive. Contact a system administrator to reactivate your account and regain access.') 
        };
      }
      
      router.push('/screenings');
    }
    
    return { data: data?.session, error };
  };

  // Sign out
  const signOut = async () => {
    try {
      setIsLoading(true);
      
      // Sign out from Supabase Auth
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('Error during sign out:', error);
        throw error;
      }
      
      // Clear local state
      setUserProfile(null);
      setUser(null);
      setSession(null);
      
      // Explicitly navigate to login page
      router.push('/auth/login');
    } catch (err) {
      console.error('Unexpected error during sign out:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Forgot password
  const forgotPassword = async (email: string) => {
    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setIsLoading(false);
    return { error };
  };

  // Reset password
  const resetPassword = async (newPassword: string) => {
    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setIsLoading(false);
    
    if (!error) {
      router.push('/screenings');
    }
    
    return { error };
  };

  // Update user profile 
  const updateUserProfile = async ({ firstName, lastName }: { firstName: string; lastName: string }) => {
    setIsLoading(true);
    let error = null;
    
    try {
      // First, check if session exists
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        return { error: { message: 'No active session' } };
      }
      
      // Update user_profiles table
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          first_name: firstName,
          last_name: lastName,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionData.session.user.id);
      
      if (updateError) {
        error = updateError;
      } else {
        // Update the local state
        if (userProfile) {
          setUserProfile({
            ...userProfile,
            firstName,
            lastName,
            updatedAt: new Date(),
          });
        }
      }
    } catch (err) {
      // Handle error silently
      error = { message: 'Failed to update profile' };
    } finally {
      setIsLoading(false);
    }
    
    return { error };
  };

  const value = {
    user,
    userProfile,
    session,
    isLoading,
    signIn,
    signOut,
    forgotPassword,
    resetPassword,
    updateUserProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Hook to use the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
