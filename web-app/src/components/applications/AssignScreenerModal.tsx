'use client';

import React, { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
}

interface AssignScreenerModalProps {
  isOpen: boolean;
  onClose: () => void;
  applicationId: string;
  onAssignSuccess: () => void;
}

export default function AssignScreenerModal({ 
  isOpen, 
  onClose, 
  applicationId, 
  onAssignSuccess 
}: AssignScreenerModalProps) {
  const [screeners, setScreeners] = useState<User[]>([]);
  const [selectedScreenerId, setSelectedScreenerId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingScreeners, setLoadingScreeners] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch screeners on mount
  useEffect(() => {
    if (isOpen) {
      fetchScreeners();
    }
  }, [isOpen]);

  const fetchScreeners = async () => {
    try {
      setLoadingScreeners(true);
      setError(null);
      
      const response = await fetch('/api/users?role=screener');
      
      if (!response.ok) {
        throw new Error('Failed to fetch screeners');
      }
      
      const data = await response.json();
      setScreeners(data.users || []);
    } catch (err) {
      setError('Error loading screeners. Please try again.');
      console.error('Error fetching screeners:', err);
    } finally {
      setLoadingScreeners(false);
    }
  };

  const handleAssignScreener = async () => {
    if (!selectedScreenerId) {
      setError('Please select a screener to assign');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/applications/${applicationId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          status: 'screener_assigned',
          assigned_screener_id: selectedScreenerId 
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to assign screener');
      }
      
      // Call the success callback
      onAssignSuccess();
      
      // Close the modal
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred assigning the screener');
      console.error('Error assigning screener:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Assign Screener" size="md">
      <div className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
            {error}
          </div>
        )}
        
        {loadingScreeners ? (
          <div className="flex justify-center py-4">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-solid border-indigo-500 border-r-transparent align-[-0.125em]" />
          </div>
        ) : screeners.length === 0 ? (
          <div className="text-center py-4 text-gray-500">
            No screeners available. Please add users with the screener role.
          </div>
        ) : (
          <div className="py-2">
            <label htmlFor="screener" className="block text-sm font-medium text-gray-700 mb-1">
              Select Screener
            </label>
            <select
              id="screener"
              name="screener"
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
              value={selectedScreenerId}
              onChange={(e) => setSelectedScreenerId(e.target.value)}
              disabled={loading}
            >
              <option value="">-- Select a screener --</option>
              {screeners.map((screener) => (
                <option key={screener.id} value={screener.id}>
                  {screener.first_name} {screener.last_name}
                </option>
              ))}
            </select>
          </div>
        )}
        
        <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
          <button
            type="button"
            className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:col-start-2"
            onClick={handleAssignScreener}
            disabled={loading || loadingScreeners || screeners.length === 0}
          >
            {loading ? (
              <span className="flex items-center">
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent align-[-0.125em]" />
                Assigning...
              </span>
            ) : (
              'Assign Screener'
            )}
          </button>
          <button
            type="button"
            className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:col-start-1 sm:mt-0"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
