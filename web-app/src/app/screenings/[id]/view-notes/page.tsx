'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Application } from '@/types/application';

export default function ViewScreeningNotesPage() {
  const params = useParams();
  const [screening, setScreening] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchScreening() {
      try {
        setLoading(true);
        console.log('Fetching screening data for ID:', params.id);
        
                 const response = await fetch(`/api/applications/${params.id}`, { cache: 'no-store' });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch screening details: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Received screening data:', data);
        // The API returns data wrapped in an 'application' object
        setScreening(data.application || data);
      } catch (err) {
        console.error('Error fetching screening:', err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    }
    
    if (params.id) {
      fetchScreening();
    }
  }, [params.id]);

  // Format date in a readable format
  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not scheduled';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Format status to Title Case
  const formatStatus = (status: string | undefined | null) => {
    if (!status) return 'Unknown Status';
    return status
      .split('_')
      .map(word => {
        if (word.toLowerCase() === 'ic') return 'IC';
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  };

  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <p className="text-gray-500">Loading screening notes...</p>
        </div>
      </div>
    );
  }

  if (error || !screening) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <p className="text-red-500">{error || 'Screening not found'}</p>
          <Link 
            href="/screenings"
            className="mt-4 inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            Back to Screenings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div className="sm:flex-auto">
          <h1 className="text-xl font-semibold text-gray-900">Screening Notes</h1>
          <p className="mt-2 text-sm text-gray-700">
            View screening notes for {screening.participants?.first_name || 'Unknown'} {screening.participants?.last_name || 'Participant'}
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none space-x-3">
          <Link
            href={`/screenings/${screening.id}`}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Edit Screening Notes
          </Link>
          <Link
            href="/screenings"
            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Back to Screenings
          </Link>
        </div>
      </div>

      {/* Score Display */}
      <div className="mt-6 flex justify-end">
        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            {screening.green_count ?? 0}
          </span>
          <span className="text-gray-400">/</span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            {screening.yellow_count ?? 0}
          </span>
          <span className="text-gray-400">/</span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            {screening.red_count ?? 0}
          </span>
        </div>
      </div>

      {/* Screening Notes Form */}
      <div className="mt-6 bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Screening Notes
          </h3>
        </div>
        <div className="border-t border-gray-200">
          <div className="px-4 py-5 sm:px-6">
                         {screening.initial_screening?.notes ? (
               <div className="space-y-6">
                 {/* Initial Screening Summary */}
                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-2">
                     Initial Screening Summary
                   </label>
                   <div className="bg-gray-50 border border-gray-200 rounded-md p-3 min-h-[100px]">
                     <p className="text-sm text-gray-900 whitespace-pre-wrap">
                       {screening.initial_screening.notes.initialScreeningSummary || 'No initial screening summary available'}
                     </p>
                   </div>
                 </div>

                 {/* Secondary Screening Summary */}
                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-2">
                     Secondary Screening Summary
                   </label>
                   <div className="bg-gray-50 border border-gray-200 rounded-md p-3 min-h-[100px]">
                     <p className="text-sm text-gray-900 whitespace-pre-wrap">
                       {screening.initial_screening.notes.secondaryScreeningSummary || 'No secondary screening summary available'}
                     </p>
                   </div>
                 </div>

                 {/* General Notes */}
                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-2">
                     Additional Information
                   </label>
                   <div className="bg-gray-50 border border-gray-200 rounded-md p-3 min-h-[100px]">
                     <p className="text-sm text-gray-900 whitespace-pre-wrap">
                       {screening.initial_screening.notes.generalNotes || 'No general notes available'}
                     </p>
                   </div>
                 </div>

                 {/* Desired Retreat */}
                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-2">
                     Desired Retreat
                   </label>
                   <div className="bg-gray-50 border border-gray-200 rounded-md p-3 min-h-[100px]">
                     <p className="text-sm text-gray-900 whitespace-pre-wrap">
                       {screening.initial_screening.notes.desiredRetreat || 'No desired retreat information available'}
                     </p>
                   </div>
                 </div>

                                   {/* Scholarship Needed */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Scholarship Needed
                    </label>
                    <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={screening.initial_screening.notes.scholarshipNeeded === true}
                          disabled
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-900">
                          {screening.initial_screening.notes.scholarshipNeeded === true
                            ? 'Yes, scholarship is needed'
                            : 'No scholarship needed'
                          }
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Meds/Health History */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Meds/Health History
                    </label>
                    <div className="bg-gray-50 border border-gray-200 rounded-md p-3 min-h-[100px]">
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">
                        {screening.initial_screening.notes.medsHealthHistory || 'No meds/health history available'}
                      </p>
                    </div>
                  </div>

                  {/* Support System */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Support System
                    </label>
                    <div className="bg-gray-50 border border-gray-200 rounded-md p-3 min-h-[100px]">
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">
                        {screening.initial_screening.notes.supportSystem || 'No support system information available'}
                      </p>
                    </div>
                  </div>

                  {/* Intention */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Intention
                    </label>
                    <div className="bg-gray-50 border border-gray-200 rounded-md p-3 min-h-[100px]">
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">
                        {screening.initial_screening.notes.intention || 'No intention information available'}
                      </p>
                    </div>
                  </div>

                  {/* Psych History */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Psych History
                    </label>
                    <div className="bg-gray-50 border border-gray-200 rounded-md p-3 min-h-[100px]">
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">
                        {screening.initial_screening.notes.psychHistory || 'No psych history available'}
                      </p>
                    </div>
                  </div>

                  {/* Psychological Observations & Background */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Psychological Observations & Background
                    </label>
                    <div className="bg-gray-50 border border-gray-200 rounded-md p-3 min-h-[100px]">
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">
                        {screening.initial_screening.notes.psychObservation || 'No Psychological Observations & Background available'}
                      </p>
                    </div>
                  </div>

                  {/* Psychedelic Experience */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Psychedelic Experience
                    </label>
                    <div className="bg-gray-50 border border-gray-200 rounded-md p-3 min-h-[100px]">
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">
                        {screening.initial_screening.notes.psychedelicExperience || 'No psychedelic experience information available'}
                      </p>
                    </div>
                  </div>

                                     {/* Supportive Habits */}
                   <div>
                     <label className="block text-sm font-medium text-gray-700 mb-2">
                       Supportive Habits
                     </label>
                     <div className="bg-gray-50 border border-gray-200 rounded-md p-3 min-h-[100px]">
                       <p className="text-sm text-gray-900 whitespace-pre-wrap">
                         {screening.initial_screening.notes.supportiveHabits || 'No supportive habits information available'}
                       </p>
                     </div>
                   </div>

                   {/* Action Logs - match editable page (full list, oldest first) */}
                   {screening.initial_screening?.notes?.actionLogs && screening.initial_screening.notes.actionLogs.length > 0 && (
                     <div className="mt-8 border-t border-gray-200 pt-4">
                       <h3 className="text-md font-semibold text-gray-800 mb-2">Action Log</h3>
                       <ul className="list-disc pl-5 space-y-1">
                         {screening.initial_screening.notes.actionLogs.map((log: string, idx: number) => (
                           <li key={idx} className="text-sm text-gray-600">{log}</li>
                         ))}
                       </ul>
                     </div>
                   )}
                 </div>
             ) : (
               <div className="text-center py-8">
                 <p className="text-gray-500">No screening notes available.</p>
                 <p className="text-sm text-gray-400 mt-2">
                   Click "Edit Screening Notes" to add notes for this screening.
                 </p>
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
