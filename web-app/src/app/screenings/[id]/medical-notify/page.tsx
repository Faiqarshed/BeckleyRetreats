'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Application } from '@/types/application';

export default function MedicalNotifyPage() {
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

  const handleNotifyMedical = async () => {
    if (!application) return;
    
    try {
      setIsSubmitting(true);
      
      // This would be a real API call in production
      // Simulating API call with setTimeout
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // In a real implementation, this would update the application status
      // to 'pending_medical_review' via the API
      
      setSuccess(true);
      
      // Redirect back to the screening page after a short delay
      setTimeout(() => {
        router.push(`/screenings/${params.id}`);
      }, 2000);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to notify medical team');
      console.error('Error notifying medical team:', err);
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
            Medical Notification
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Notify the medical team about this participant.
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
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                {application.status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
              </span>
            </div>
          </div>
          
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  <strong>Note:</strong> This is a placeholder page. In the full implementation, this would trigger an automated notification to the medical team and update the application status to "Pending Medical Review".
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end">
            <button
              onClick={handleNotifyMedical}
              disabled={isSubmitting || success}
              className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
                isSubmitting || success
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500'
              }`}
            >
              {isSubmitting ? 'Notifying...' : success ? 'Notified!' : 'Notify Medical Team'}
            </button>
          </div>
          
          {success && (
            <div className="mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
              <p>Success! Medical team has been notified and the status has been updated to "Pending Medical Review".</p>
            </div>
          )}
        </div>
      </div>
      
      <div className="bg-gray-50 p-4 rounded-md text-center text-gray-500 text-sm italic">
        Notifying Medical automation to come
      </div>
    </div>
  );
}
