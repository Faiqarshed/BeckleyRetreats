'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ApplicationStatus, ScoreValue } from '@/types/application';
import ClosedReasonModal, { ClosedReason } from '@/components/ui/ClosedReasonModal';

// Score badge component
const ScoreBadge = ({ score }: { score: ScoreValue | undefined }) => {
  if (!score) return null;
  
  const badgeColors = {
    'red': 'bg-red-100 text-red-800',
    'yellow': 'bg-yellow-100 text-yellow-800',
    'green': 'bg-green-100 text-green-800',
    'na': 'bg-gray-100 text-gray-800'
  };
  
  return (
    <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${badgeColors[score]}`}>
      {score.toUpperCase()}
    </span>
  );
};

// Status badge component
const StatusBadge = ({ status }: { status: ApplicationStatus }) => {
const badgeColors: Record<ApplicationStatus, string> = {
  pending: 'bg-gray-100 text-gray-800',
  new: 'bg-blue-100 text-blue-800',
  screening_scheduled: 'bg-fuchsia-100 text-fuchsia-800',
  screening_no_show: 'bg-pink-100 text-pink-800',
  invited_to_reschedule: 'bg-yellow-100 text-yellow-800',
  secondary_screening: 'bg-purple-100 text-purple-800',
  medical_review_required: 'bg-orange-100 text-orange-800',
  pending_medical_review: 'bg-amber-100 text-amber-800',
  pending_medication_change: 'bg-blue-100 text-blue-800',
  pending_ic: 'bg-teal-100 text-teal-800',
  conditionally_approved: 'bg-emerald-100 text-emerald-800',
  screening_in_process: 'bg-green-100 text-green-800',
  screening_completed: 'bg-green-100 text-green-800',
  closed: 'bg-gray-300 text-gray-900'
};
  
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${badgeColors[status] || 'bg-gray-100 text-gray-800'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
};



export default function ApplicationDetailPage({ params }: { params: { id: string } }) {
  // Unwrap params Promise for future Next.js compatibility
  // Cast params to the correct type for React.use()
  const unwrappedParams = React.use(params as any) as { id: string };
  const id = unwrappedParams.id;
  const router = useRouter();
  const [application, setApplication] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<ApplicationStatus | ''>('');
  const [closedReasonModalOpen, setClosedReasonModalOpen] = useState(false);
  const [pendingClosedReason, setPendingClosedReason] = useState<ClosedReason | ''>('');
  const [pendingStatus, setPendingStatus] = useState<ApplicationStatus | null>(null);
  
  // Fetch application data
  useEffect(() => {
    async function fetchApplicationDetail() {
      try {
        setLoading(true);
        const response = await fetch(`/api/applications/${id}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch application details');
        }
        
        const data = await response.json();
        // Log the first response to debug field structure
        if (data.application.field_responses && data.application.field_responses.length > 0) {
          console.log('Sample field response structure:', JSON.stringify(data.application.field_responses[0], null, 2));
        }
        
        setApplication(data.application);
        setSelectedStatus(data.application.status);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        console.error('Error fetching application details:', err);
      } finally {
        setLoading(false);
      }
    }
    
    if (id) {
      fetchApplicationDetail();
    }
  }, [id]);

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
        <p className="mt-2 text-sm text-gray-500">Loading application details...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error loading application</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => router.push('/applications')}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Return to Applications
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  if (!application) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-gray-500">Application not found</p>
        <button
          type="button"
          onClick={() => router.push('/applications')}
          className="mt-4 inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Return to Applications
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8">
      {/* Back link */}
      <div className="mb-6">
        <button
          onClick={() => router.push('/applications')}
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          <svg className="h-5 w-5 mr-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Back to Applications
        </button>
      </div>
      
      {/* Application header */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
        <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Application Details
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Submission from {application.participants.first_name} {application.participants.last_name}
            </p>
          </div>
          <div className="flex items-start space-x-4">
            <div className="flex items-center space-x-3">
              {updating && (
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-solid border-indigo-500 border-r-transparent align-[-0.125em]" />
              )}
              {(() => { const displayedStatus = selectedStatus === 'screening_completed' ? 'closed' : selectedStatus; return (
              <select
                id="status"
                name="status"
                className={`pl-3 pr-10 py-1.5 text-sm border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md ${updating ? 'opacity-75' : ''}`}
                value={displayedStatus}
                disabled={updating}
                onChange={async (e) => {
                  const newStatus = e.target.value as ApplicationStatus;
                  const effectiveCurrent = application.status === 'screening_completed' ? 'closed' as ApplicationStatus : application.status;
                  if (newStatus === effectiveCurrent) {
                    return;
                  }
                  if (newStatus === 'closed') {
                    setPendingStatus(newStatus);
                    setClosedReasonModalOpen(true);
                    return;
                  }
                  setSelectedStatus(newStatus);
                  setUpdating(true);
                  try {
                    const response = await fetch(`/api/applications/${application.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: newStatus }),
                    });
                    const result = await response.json();
                    if (!response.ok) {
                      throw new Error(`Error: ${result.error || 'Unknown'}`);
                    }
                    setApplication({
                      ...application,
                      status: result.status || newStatus,
                    });
                    setSelectedStatus(result.status || newStatus);
                    
                    // Create action log for status change (same pattern as closed status)
                    const statusLabels: Record<string, string> = {
                      'new': 'New',
                      'pending': 'Pending',
                      'screening_scheduled': 'Screening Scheduled',
                      'screening_no_show': 'Screening No Show',
                      'invited_to_reschedule': 'Invited to Reschedule',
                      'secondary_screening': 'Secondary Screening',
                      'medical_review_required': 'Medical Review Required',
                      'conditionally_approved': 'Conditionally Approved',
                      'screening_in_process': 'Screening',
                      'closed': 'Closed'
                    };
                    
                    const statusLabel = statusLabels[newStatus] || newStatus;
                    const actionLogResp = await fetch(`/api/screenings/${application.id}/notes`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        action_log_message: `marked applicant as "${statusLabel}"`,
                        application_status: result.status || newStatus
                      })
                    });
                    
                    // Don't need to update UI since applications page doesn't show action logs
                    
                  } catch (error) {
                    console.error(`Error updating status: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    setError(error instanceof Error ? error.message : 'An error occurred updating the status');
                  } finally {
                    setUpdating(false);
                  }
                }}
              >
                <option value="new">New</option>
                <option value="screening_scheduled">Screening Scheduled</option>
                <option value="screening_no_show">Screening No Show</option>
                <option value="invited_to_reschedule">Invited to Reschedule</option>
                <option value="secondary_screening">Secondary Screening</option>
                <option value="medical_review_required">Medical Review Required</option>
                <option value="conditionally_approved">Conditionally Approved</option>
                  <option value="screening_in_process">Screening</option>
                <option value="closed">Closed</option>
              </select>
              ); })()}
              {(selectedStatus === 'screening_completed' || selectedStatus === 'closed') && (
                <div className="flex items-center space-x-2">
                  <span className="text-xs sm:text-sm text-gray-500">
                    Reason: {(() => {
                      const reason = application.closed_reason || 'N/A';
                      const rejectedType = (application as any).rejected_type;
                      if (reason === 'Rejected' && rejectedType) {
                        return `${reason} (${rejectedType})`;
                      }
                      return reason;
                    })()}
                  </span>
                  <button
                    type="button"
                    className="text-xs sm:text-sm text-indigo-600 hover:text-indigo-800 underline"
                    onClick={() => {
                      // Open the closed reason modal to edit reason
                      setPendingStatus('closed');
                      setClosedReasonModalOpen(true);
                    }}
                  >
                    Edit Reason
                  </button>
                </div>
              )}
            </div>

            {/* Debug panel removed */}
          </div>
        </div>
        
        {/* Participant info */}
        <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
            {/* Left column: participant name, email, phone */}
            <div className="sm:col-span-1">
              <dt className="text-sm font-medium text-gray-500">Participant Name</dt>
              <dd className="mt-1 text-sm text-gray-900">{application.participants.first_name} {application.participants.last_name}</dd>
            </div>
            <div className="sm:col-span-1">
              <dt className="text-sm font-medium text-gray-500">Application Score</dt>
              <dd className="mt-1 text-sm text-gray-900">
                <span className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-md bg-gray-50">
                  <span className="text-red-600 font-semibold">{application.red_count ?? 0}</span>
                  <span className="text-gray-400">/</span>
                  <span className="text-yellow-600 font-semibold">{application.yellow_count ?? 0}</span>
                  <span className="text-gray-400">/</span>
                  <span className="text-green-600 font-semibold">{application.green_count ?? 0}</span>
                </span>
              </dd>
            </div>
            <div className="sm:col-span-1">
              <dt className="text-sm font-medium text-gray-500">Email</dt>
              <dd className="mt-1 text-sm text-gray-900">{application.participants.email}</dd>
            </div>
            <div className="sm:col-span-1">
              <dt className="text-sm font-medium text-gray-500">Submission Date</dt>
              <dd className="mt-1 text-sm text-gray-900">{formatDate(application.submission_date)}</dd>
            </div>
            <div className="sm:col-span-1">
              <dt className="text-sm font-medium text-gray-500">Phone</dt>
              <dd className="mt-1 text-sm text-gray-900">{application.participants.phone || 'Not provided'}</dd>
            </div>
          </dl>
        </div>
      </div>
      
      {/* No duplicate debug panel needed here */}
      
      {/* Application responses */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Application Responses
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Answers provided by the applicant with their scores.
          </p>
        </div>
        <div className="border-t border-gray-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="w-[15%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Field Type
                  </th>
                  <th scope="col" className="w-[35%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Question (Field Title)
                  </th>
                  <th scope="col" className="w-[35%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Answer
                  </th>
                  <th scope="col" className="w-[15%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {application.field_responses && application.field_responses.length > 0 ? (
                    application.field_responses.map((response: any, index: number) => {
                      // Skip rendering placeholder rows if they don't have children with actual responses
                      if (response.isPlaceholder && !application.field_responses.some((r: any) => 
                        r.field?.parent_field_version_id === response.field_version_id && !r.isPlaceholder
                      )) {
                        return null;
                      }
                      
                      const fieldType = response.field?.field_type || 'Unknown Type';
                      const fieldTitle = response.field?.field_title || 'Unknown Field';
                      const hierarchyLevel = response.field?.hierarchy_level || 0;
                      
                      // Convert field type to more readable format
                      const displayFieldType = fieldType
                        .replace(/_/g, ' ')
                        .split(' ')
                        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(' ');
                      
                      // Calculate indentation level for hierarchical display (match scoring config table)
                      const indentationPadding = hierarchyLevel > 0 ? `${hierarchyLevel * 20}px` : '0';
                      
                      // Set background shade based on hierarchy level for better visual grouping
                      const getBgColorClass = () => {
                        if (response.isPlaceholder) return 'bg-gray-50';
                        if (hierarchyLevel === 0) return '';
                        return hierarchyLevel % 2 === 1 ? 'bg-gray-50' : '';
                      };
                      
                      // Determine if this is a group/section header
                      const isGroupHeader = fieldType === 'group' || fieldType === 'statement';
                      
                      // Special styling for placeholder rows (structural elements without responses)
                      if (response.isPlaceholder) {
                        return (
                          <tr key={response.id} className="bg-gray-50">
                            <td className="px-6 py-3 whitespace-normal text-sm text-gray-500">
                              {displayFieldType}
                            </td>
                            <td 
                              className={`px-6 py-3 whitespace-normal text-sm font-medium text-gray-500`}
                              style={{ paddingLeft: indentationPadding }}
                            >
                              {fieldTitle}
                            </td>

                            <td className="px-6 py-3 whitespace-normal text-sm text-gray-400">
                              -
                            </td>
                            <td className="px-6 py-3 whitespace-nowrap text-sm">
                              <ScoreBadge score="na" />
                            </td>
                          </tr>
                        );
                      }
                                           
                      // We no longer need special handling for multiple choice responses
                      // Instead, we'll use response_value or display_value directly for all field types
                      // This approach is simpler and more robust
                      
                      // Special styling for group headers to match the scoring configuration style
                      if (isGroupHeader) {
                        return (
                          <tr 
                            key={response.id} 
                            className={`${hierarchyLevel === 0 ? 'bg-gray-50 font-medium' : getBgColorClass()}`}
                          >
                            <td className="px-6 py-3 whitespace-normal text-sm text-gray-900">
                              {displayFieldType}
                            </td>
                            <td 
                              className={`px-6 py-3 whitespace-normal text-sm ${hierarchyLevel === 0 ? 'font-medium' : ''}`}
                              style={{ paddingLeft: indentationPadding }}
                            >
                              {fieldTitle}
                            </td>

                            <td className="px-6 py-3 whitespace-normal text-sm text-gray-500 max-w-sm break-words">
                              {response.display_value || response.response_value || '-'}
                            </td>
                            <td className="px-6 py-3 whitespace-nowrap text-sm">
                              <ScoreBadge score={response.score as ScoreValue} />
                            </td>
                          </tr>
                        );
                      }
                      
                      // Regular single-response row
                      return (
                        <tr key={response.id} className={getBgColorClass()}>
                          <td className="px-6 py-3 whitespace-normal text-sm text-gray-900">
                            {displayFieldType}
                          </td>
                          <td 
                            className="px-6 py-3 whitespace-normal text-sm text-gray-900"
                            style={{ paddingLeft: indentationPadding }}
                          >
                            {fieldTitle}
                          </td>

                          <td className="px-6 py-3 whitespace-normal text-sm text-gray-500 max-w-sm break-words">
                            {/* Use display_value, fallback to response_value, or fallback to empty */}
                            {response.display_value || response.response_value || '-'}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm">
                            <ScoreBadge score={response.score as ScoreValue} />
                          </td>
                        </tr>
                      );
                    }).filter(Boolean) // Filter out nulls from the skipped placeholders
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                      No responses available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    {/* Closed Reason Modal */}
    <ClosedReasonModal
      isOpen={closedReasonModalOpen}
      onClose={() => {
        setClosedReasonModalOpen(false);
        setPendingStatus(null);
        setPendingClosedReason('');
      }}
      onSubmit={async (reason, rejectedType) => {
        setClosedReasonModalOpen(false);
        setPendingClosedReason(reason);
        setUpdating(true);
        try {
          const body: Record<string, any> = { status: 'closed', closed_reason: reason };
          if (reason === 'Rejected' && rejectedType) {
            body.rejected_type = rejectedType;
          }
          const response = await fetch(`/api/applications/${application.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const result = await response.json();
          if (!response.ok) {
            throw new Error(`Error: ${result.error || 'Unknown'}`);
          }
          setApplication({
            ...application,
            status: result.status || 'closed',
            closed_reason: reason,
            ...(body.rejected_type ? { rejected_type: body.rejected_type } : {}),
          });
          setSelectedStatus(result.status || 'closed');

          // Add action log entry for Closed status from Applications page
          try {
            const reasonLabel = reason === 'Rejected' && body.rejected_type ? `${reason} (${body.rejected_type})` : reason;
            await fetch(`/api/screenings/${application.id}/notes`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action_log_message: `marked applicant as "${reasonLabel}"`,
                application_status: 'closed'
              })
            });
          } catch {}
        } catch (error) {
          setError(error instanceof Error ? error.message : 'An error occurred updating the status');
        } finally {
          setUpdating(false);
          setPendingStatus(null);
          setPendingClosedReason('');
        }
      }}
    />
  </div>
  );
}

