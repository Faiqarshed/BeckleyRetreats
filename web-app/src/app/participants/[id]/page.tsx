'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Participant } from '@/types/application';

export default function ParticipantDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const participantId = params.id as string;
  
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    async function fetchParticipantDetails() {
      try {
        setLoading(true);
        
        const response = await fetch(`/api/participants/${participantId}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Participant not found');
          }
          throw new Error('Failed to fetch participant details');
        }
        
        const data = await response.json();
        setParticipant(data.participant);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        console.error('Error fetching participant details:', err);
      } finally {
        setLoading(false);
      }
    }
    
    if (participantId) {
      fetchParticipantDetails();
    }
  }, [participantId]);
  
  // Format date in a readable format
  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not available';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };
  
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8">
      {/* Header with back button */}
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          <svg className="mr-1 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Back to participants
        </button>
      </div>
      
      {/* Content area */}
      <div className="max-w-4xl mx-auto">
        {loading ? (
          <div className="animate-pulse space-y-8">
            <div className="h-12 bg-gray-200 rounded w-1/3"></div>
            <div className="space-y-4">
              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error loading participant details</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{error}</p>
                </div>
                <div className="mt-4">
                  <button
                    type="button"
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    onClick={() => router.push('/participants')}
                  >
                    Go back to participants list
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : participant ? (
          <div>
            {/* Participant header */}
            <div className="pb-5 border-b border-gray-200">
              <h1 className="text-2xl font-bold text-gray-900">
                {participant.first_name} {participant.last_name}
              </h1>
              <div className="mt-1 flex items-center">
                <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                  participant.is_active 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {participant.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
            
            {/* Participant details */}
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <div className="px-4 py-5 sm:px-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    Contact Information
                  </h3>
                </div>
                <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
                  <dl className="sm:divide-y sm:divide-gray-200">
                    <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Email</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        <a href={`mailto:${participant.email}`} className="text-indigo-600 hover:text-indigo-500">
                          {participant.email}
                        </a>
                      </dd>
                    </div>
                    <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Phone</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {participant.phone ? (
                          <a href={`tel:${participant.phone}`} className="text-indigo-600 hover:text-indigo-500">
                            {participant.phone}
                          </a>
                        ) : (
                          <span className="text-gray-400">Not provided</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
              
              <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <div className="px-4 py-5 sm:px-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    System Information
                  </h3>
                </div>
                <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
                  <dl className="sm:divide-y sm:divide-gray-200">
                    <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Participant ID</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {participant.id}
                      </dd>
                    </div>
                    {participant.hubspot_contact_id && (
                      <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                        <dt className="text-sm font-medium text-gray-500">HubSpot ID</dt>
                        <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                          {participant.hubspot_contact_id}
                        </dd>
                      </div>
                    )}
                    <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Created</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {formatDate(participant.created_at)}
                      </dd>
                    </div>
                    <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {formatDate(participant.updated_at)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
            
            {/* Actions */}
            <div className="mt-8 flex flex-col sm:flex-row sm:space-x-4">
              <button
                type="button"
                className="mb-3 sm:mb-0 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                onClick={() => router.push(`/participants/${participantId}/edit`)}
              >
                Edit Participant
              </button>
              <Link 
                href={`/applications?participant=${participantId}`}
                className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                View Applications
              </Link>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">Participant not found</h3>
            <p className="mt-1 text-sm text-gray-500">
              The participant you&apos;re looking for doesn&apos;t exist or has been removed.
            </p>
            <div className="mt-6">
              <button
                type="button"
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                onClick={() => router.push('/participants')}
              >
                Go back to participants
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
