'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import { UserRole } from '@/types/user';

interface TypeformForm {
  id: string; // Form ID from Typeform
  db_id: string; // Database ID
  title: string;
  created_at: string;
  updated_at: string;
  _links: {
    display: string;
  };
}

export default function TypeformManagement() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const [forms, setForms] = useState<TypeformForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [syncingForm, setSyncingForm] = useState<string | null>(null);
  const [deletingForm, setDeletingForm] = useState<string | null>(null);
  const [formIdInput, setFormIdInput] = useState<string>(''); // Empty by default
  const [existingForm, setExistingForm] = useState<{id: string; title: string} | null>(null);
  
  // Check if user is an administrator
  const isAdmin = userProfile?.role === UserRole.PROGRAM_OPERATIONS_ADMINISTRATOR;
  
  // Temporary debugging
  useEffect(() => {
    if (userProfile) {
      console.log('Current user profile:', userProfile);
      console.log('Current user role:', userProfile.role);
      console.log('Is Admin?', isAdmin);
      console.log('Expected admin role:', UserRole.PROGRAM_OPERATIONS_ADMINISTRATOR);
    }
  }, [userProfile, isAdmin]);
  
  // Debug forms when they load
  useEffect(() => {
    if (forms.length > 0) {
      console.log('Forms loaded:', forms);
    }
  }, [forms]);

  // Fetch forms on component mount
  useEffect(() => {
    fetchForms();
  }, []);

  // Fetch forms from the API
  const fetchForms = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get('/api/typeform/forms');
      setForms(response.data.forms || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch forms');
      console.error('Error fetching forms:', err);
    } finally {
      setLoading(false);
    }
  };

  // Sync a form to the database
  const syncForm = async (formId: string) => {
    try {
      setSyncingForm(formId);
      setError(null);
      await axios.post(`/api/typeform/forms/${formId}/sync`);
      // Refetch forms to update the updated_at timestamp and any other changes
      await fetchForms();
      setMessage('Form synced successfully');
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to sync form');
      console.error('Error syncing form:', err);
      setTimeout(() => setError(null), 5000);
    } finally {
      setSyncingForm(null);
    }
  };

  // Check if a form already exists before adding it
  // If form doesn't exist, automatically trigger form creation
  const checkFormExists = async (formId: string) => {
    if (!formId) {
      setError('Form ID is required');
      setTimeout(() => setError(null), 5000);
      return false;
    }
    
    try {
      setChecking(true);
      setError(null);
      setExistingForm(null);
      
      const response = await axios.get(`/api/typeform/forms/check?formId=${formId}`);
      const { exists, form } = response.data;
      
      if (exists && form) {
        setExistingForm({
          id: form.form_id,
          title: form.form_title
        });
        return true;
      }
      
      // Form doesn't exist - automatically trigger form creation
      console.log(`Form ${formId} not found in database. Automatically triggering form creation...`);
      // Call addForm directly after finding form doesn't exist
      await createNewForm(formId);
      return false;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to check if form exists');
      console.error('Error checking form:', err);
      setTimeout(() => setError(null), 5000);
      return false;
    } finally {
      setChecking(false);
    }
  };
  
  // Create a new form with the given formId
  const createNewForm = async (formId: string) => {
    try {
      setLoading(true);
      setError(null);
      await axios.post('/api/typeform/forms', { formId });
      // Refetch forms after adding
      await fetchForms();
      // Clear input if this is the current input
      if (formId === formIdInput) {
        setFormIdInput('');
      }
      setMessage('Form added and synced successfully');
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add form');
      console.error('Error adding form:', err);
      setTimeout(() => setError(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  // Add a new form manually (when button is clicked)
  const addForm = async () => {
    if (!formIdInput) {
      setError('Form ID is required');
      setTimeout(() => setError(null), 5000);
      return;
    }

    // First, check if form already exists
    const exists = await checkFormExists(formIdInput);
    
    if (exists) {
      // If form exists, don't try to add it again
      return;
    }
    
    // Note: Form creation is now handled in checkFormExists
    // if the form doesn't exist, so we don't need to do anything here
  };
  
  // Handle input change and check if form exists on blur
  const handleFormIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormIdInput(e.target.value);
    setExistingForm(null); // Clear existing form when input changes
  };

  // Navigate to scoring configuration for a specific form
  const configureScoring = (formId: string) => {
    router.push(`/admin/typeform/scoring/${formId}`);
  };
  
  // Delete a form from the database (admin only)
  const deleteForm = async (formId: string) => {
    if (!isAdmin) {
      setError('Only administrators can delete forms');
      setTimeout(() => setError(null), 5000);
      return;
    }
    
    // Ask for confirmation
    if (!window.confirm(`Are you sure you want to delete this form? This will remove all related scoring rules.`)) {
      return;
    }
    
    try {
      setDeletingForm(formId);
      setError(null);
      await axios.delete(`/api/typeform/forms/${formId}/delete`);
      // Refetch forms to update the list
      await fetchForms();
      setMessage('Form deleted successfully');
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete form');
      console.error('Error deleting form:', err);
      setTimeout(() => setError(null), 5000);
    } finally {
      setDeletingForm(null);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Typeform Management</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4" role="alert">
          <p>{error}</p>
        </div>
      )}
      
      {message && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4" role="alert">
          <p>{message}</p>
        </div>
      )}
      
      {/* Add Form Form */}
      <div className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-6">
        <h2 className="text-xl font-semibold mb-4">Add New Typeform</h2>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-grow">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="formId">
              Typeform ID
              <span className="ml-1 text-xs font-normal text-gray-500">(from the form URL or settings)</span>
            </label>
            <div className="flex">
              <input
                id="formId"
                type="text"
                value={formIdInput}
                onChange={handleFormIdChange}
                onBlur={() => checkFormExists(formIdInput)}
                placeholder="e.g. cY2L1JML"
                className="shadow appearance-none border rounded-l w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              />
              <button
                onClick={addForm}
                disabled={loading || checking || existingForm !== null}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-r focus:outline-none focus:shadow-outline flex items-center disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Adding...
                  </>
                ) : checking ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Checking...
                  </>
                ) : existingForm ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Form Exists
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Add Form
                  </>
                )}
              </button>
            </div>
            {existingForm ? (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                <p className="text-sm text-yellow-700 mb-1">
                  <strong>Form already exists:</strong> "{existingForm.title}" (ID: {existingForm.id})
                </p>
                <div className="flex space-x-2 mt-1">
                  <button
                    onClick={() => syncForm(existingForm.id)}
                    disabled={syncingForm === existingForm.id}
                    className="bg-green-500 hover:bg-green-700 text-white text-xs font-medium py-1 px-2 rounded flex items-center"
                  >
                    {syncingForm === existingForm.id ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Syncing...
                      </>
                    ) : (
                      <>Sync Form</>
                    )}
                  </button>
                  <button
                    onClick={() => configureScoring(existingForm.id)}
                    className="bg-blue-500 hover:bg-blue-700 text-white text-xs font-medium py-1 px-2 rounded flex items-center"
                  >
                    Configure Scoring
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500 mt-2">
                Adding a form will automatically sync its structure to the database. You can then configure scoring rules for its fields.
              </p>
            )}
          </div>
        </div>
      </div>
      
      {/* Forms Table */}
      <div className="bg-white shadow-md rounded px-8 pt-6 pb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Typeforms in Database</h2>
          <button 
            onClick={fetchForms}
            disabled={loading}
            className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-1 px-3 rounded text-sm flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
        
        {loading && !syncingForm ? (
          <div className="py-8 text-center">
            <p className="text-gray-600">Loading forms...</p>
          </div>
        ) : forms.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-gray-600">No forms found. Add a form using the form above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white">
              <thead>
                <tr>
                  <th className="py-2 px-4 border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Form ID
                  </th>
                  <th className="py-2 px-4 border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="py-2 px-4 border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Last Synced
                  </th>
                  <th className="py-2 px-4 border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {forms.map((form) => {
                  // Format the updated_at date for display
                  const lastSynced = form.updated_at 
                    ? new Date(form.updated_at).toLocaleString() 
                    : 'Never';
                    
                  return (
                    <tr key={form.id}>
                      <td className="py-2 px-4 border-b border-gray-200">
                        <span className="font-mono text-sm">{form.id}</span>
                      </td>
                      <td className="py-2 px-4 border-b border-gray-200">
                        {form.title}
                      </td>
                      <td className="py-2 px-4 border-b border-gray-200 text-sm">
                        {lastSynced}
                      </td>
                      <td className="py-2 px-4 border-b border-gray-200">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => syncForm(form.id)}
                            disabled={syncingForm === form.id}
                            className="bg-green-500 hover:bg-green-700 text-white font-bold py-1 px-2 rounded text-xs flex items-center"
                          >
                            {syncingForm === form.id ? (
                              <>
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Syncing...
                              </>
                            ) : (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Sync
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => configureScoring(form.id)}
                            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-2 rounded text-xs flex items-center"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Scoring
                          </button>
                          {/* Always show delete button for testing */}
                            <button
                              onClick={() => deleteForm(form.id)}
                              disabled={deletingForm === form.id}
                              className="bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded text-xs flex items-center"
                            >
                              {deletingForm === form.id ? (
                                <>
                                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  Deleting...
                                </>
                              ) : (
                                <>
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  Delete
                                </>
                              )}
                            </button>
                          {form._links.display && form._links.display !== '#' && (
                            <a
                              href={form._links.display}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-1 px-2 rounded text-xs flex items-center"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              View
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
