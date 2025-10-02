'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Application } from '@/types/application';

export default function MedicationChangePage() {
  const params = useParams();
  const router = useRouter();
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function fetchScreeningDetails() {
      if (!params.id) return;

      try {
        setLoading(true);
        const response = await fetch(`/api/applications/${params.id}`);

        if (!response.ok) {
          throw new Error('Failed to fetch screening details');
        }

        const data = await response.json();
        setApplication(data.application);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        console.error('Error fetching screening details:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchScreeningDetails();
  }, [params.id]);

  const handleReviewMedication = async () => {
    if (!application) return;
    
    try {
      setIsSubmitting(true);
      
      // This would be a real API call in production
      // Simulating API call with setTimeout
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // In a real implementation, this would update the application status via the API
      
      setSuccess(true);
      
      // Redirect back to the screening page after a short delay
      setTimeout(() => {
        router.push(`/screenings/${params.id}`);
      }, 2000);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to review medication change');
      console.error('Error reviewing medication change:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <p className="text-gray-500">Loading screening details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          <p>Error: {error}</p>
        </div>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="p-8">
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded">
          <p>No screening details found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <button 
          onClick={() => router.back()} 
          className="text-indigo-600 hover:text-indigo-900"
        >
          ← Back to Screening
        </button>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg mb-6">
        <div className="px-4 py-5 sm:px-6">
          <h2 className="text-lg leading-6 font-medium text-gray-900">
            Medication Change Review
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Review and document the participant's medication change.
          </p>
        </div>
        
        <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
          <div className="mb-4">
            <h3 className="text-md font-medium text-gray-900">Participant Information</h3>
            <p className="text-sm text-gray-600 mt-1">
              {application.participants?.first_name} {application.participants?.last_name}
            </p>
          </div>
          
          <div className="mb-6">
            <h3 className="text-md font-medium text-gray-900">Current Status</h3>
            <div className="mt-1">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {application.status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
              </span>
            </div>
          </div>
          
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-700">
                  <strong>Note:</strong> This is a placeholder page. In the full implementation, this would provide a form to document medication changes and update the application status.
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end">
            <button
              onClick={handleReviewMedication}
              disabled={isSubmitting || success}
              className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
                isSubmitting || success
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
              }`}
            >
              {isSubmitting ? 'Processing...' : success ? 'Completed!' : 'Review Medication Change'}
            </button>
          </div>
          
          {success && (
            <div className="mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
              <p>Success! Medication change has been reviewed and documented.</p>
            </div>
          )}
        </div>
      </div>
      
      <div className="bg-gray-50 p-4 rounded-md text-center text-gray-500 text-sm italic">
        Pending Medication Change automation to come
      </div>
    </div>
  );
}
