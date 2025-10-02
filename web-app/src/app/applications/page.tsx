'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Application } from '@/types/application';
import Pagination from '@/components/Pagination';

const APPLICATIONS_FILTER_KEY = 'applications_status_filter';

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);
  const pageSize = 10;
  const searchParams = useSearchParams();
  const router = useRouter();
  const participantParam = searchParams.get('participant');
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(APPLICATIONS_FILTER_KEY);
      console.log('Applications: Loading saved filter state:', saved);
      if (saved) {
        try {
          const filterState = JSON.parse(saved);
          console.log('Applications: Parsed filter state:', filterState);
          return filterState.statusFilter || 'all';
        } catch (e) {
          console.warn('Failed to parse saved filter state:', e);
        }
      }
    }
    return 'all';
  });

  const [searchQuery, setSearchQuery] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(APPLICATIONS_FILTER_KEY);
      if (saved) {
        try {
          const filterState = JSON.parse(saved);
          return filterState.searchQuery || '';
        } catch {}
      }
    }
    return '';
  });

  const [screeningFrom, setScreeningFrom] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(APPLICATIONS_FILTER_KEY);
      if (saved) {
        try {
          const filterState = JSON.parse(saved);
          return filterState.screeningFrom || '';
        } catch {}
      }
    }
    return '';
  });

  const [screeningTo, setScreeningTo] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(APPLICATIONS_FILTER_KEY);
      if (saved) {
        try {
          const filterState = JSON.parse(saved);
          return filterState.screeningTo || '';
        } catch {}
      }
    }
    return '';
  });

  const [submissionFrom, setSubmissionFrom] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(APPLICATIONS_FILTER_KEY);
      if (saved) {
        try {
          const filterState = JSON.parse(saved);
          return filterState.submissionFrom || '';
        } catch {}
      }
    }
    return '';
  });

  const [submissionTo, setSubmissionTo] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(APPLICATIONS_FILTER_KEY);
      if (saved) {
        try {
          const filterState = JSON.parse(saved);
          return filterState.submissionTo || '';
        } catch {}
      }
    }
    return '';
  });

  // Save filter state to localStorage
  const saveFilterState = (newStatusFilter: string) => {
    if (typeof window !== 'undefined') {
      const filterState = {
        statusFilter: newStatusFilter,
        searchQuery,
        screeningFrom,
        screeningTo,
        submissionFrom,
        submissionTo,
        timestamp: Date.now()
      };
      console.log('Applications: Saving filter state:', filterState);
      localStorage.setItem(APPLICATIONS_FILTER_KEY, JSON.stringify(filterState));
    }
  };

  // Removed result caching; we only persist filters now

  // Clear filter state from localStorage
  const clearLocalStorage = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(APPLICATIONS_FILTER_KEY);
    }
  };
  
  useEffect(() => {
    async function fetchApplications() {
      try {
        setLoading(true);
        
        // Build query parameters based on filters
        const queryParams = new URLSearchParams();
        // Always delegate status filtering to the API (DB truth)
        if (statusFilter !== 'all') {
          if (statusFilter.startsWith('closed:')) {
            queryParams.append('status', 'closed');
            const reason = statusFilter.split(':')[1];
            if (reason) queryParams.append('closed_reason', reason);
          } else {
            queryParams.append('status', statusFilter);
          }
        }
        if (participantParam) queryParams.append('participant', participantParam);
        if (screeningFrom) queryParams.append('screeningFrom', screeningFrom);
        if (screeningTo) queryParams.append('screeningTo', screeningTo);
        if (submissionFrom) queryParams.append('submissionFrom', submissionFrom);
        if (submissionTo) queryParams.append('submissionTo', submissionTo);
        queryParams.append('page', String(page));
        queryParams.append('pageSize', String(pageSize));
        if (searchQuery.trim()) queryParams.append('search', searchQuery.trim());
        const response = await fetch(`/api/applications?${queryParams.toString()}`, { cache: 'no-store' });
        
        if (!response.ok) {
          throw new Error('Failed to fetch applications');
        }
        
        const data = await response.json();
        const applicationsData = data.applications || [];
        setApplications(applicationsData);
        setTotal(data.total || 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        console.error('Error fetching applications:', err);
      } finally {
        setLoading(false);
      }
    }
    
    fetchApplications();
  }, [statusFilter, page, searchQuery, screeningFrom, screeningTo, submissionFrom, submissionTo, participantParam]);

  // Persist when non-status filters change
  useEffect(() => {
    saveFilterState(statusFilter);
    // Reset to first page when any non-status filter changes
    setPage(1);
  }, [searchQuery, screeningFrom, screeningTo, submissionFrom, submissionTo]);

  // Save filter state whenever status changes
  useEffect(() => {
    saveFilterState(statusFilter);
    // Reset to first page when status changes
    setPage(1);
  }, [statusFilter]);

  // Derived list: if participant filter is present in URL, restrict list client-side, then apply search/screening date filters
  const displayApplications = (() => {
    return applications;
  })();
  
  const handleStatusFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
    setPage(1);
  };
  
  // Score filter removed
  
  const clearFilters = () => {
    setStatusFilter('all');
    setSearchQuery('');
    setScreeningFrom('');
    setScreeningTo('');
    setSubmissionFrom('');
    setSubmissionTo('');
    setPage(1);
    clearLocalStorage(); // Clear localStorage when filters are cleared
    // If a participant filter is present in the URL, remove it so all applications show
    if (participantParam) {
      router.replace('/applications');
    }
  };
  
  
  
  // Get button label for application actions - always 'View Application' except for approved status
  const getNextActionLabel = (status: string): string | null => {
    // No button for approved status
    if (status === 'approved') {
      return null;
    }
    // All other statuses use 'View Application'
    return 'View Application';
  };
  
  // Determine badge color based on status
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'new':
        return 'bg-gray-100 text-gray-800';
      case 'in_review':
        return 'bg-blue-100 text-blue-800';
      case 'screening_scheduled':
        return 'bg-indigo-100 text-indigo-800';
      case 'screening_no_show':
        return 'bg-red-100 text-red-800';
      case 'invited_to_reschedule':
        return 'bg-yellow-100 text-yellow-800';
      case 'secondary_screening':
        return 'bg-purple-100 text-purple-800';
      case 'medical_review_required':
        return 'bg-orange-100 text-orange-800';
      case 'pending_medical_review':
        return 'bg-amber-100 text-amber-800';
      case 'pending_medication_change':
        return 'bg-blue-100 text-blue-800';
      case 'pending_ic':
        return 'bg-teal-100 text-teal-800';
      case 'conditionally_approved':
        return 'bg-green-100 text-green-800';
      case 'screening_in_process':
        return 'bg-green-100 text-green-800';
      case 'closed':
        return 'bg-gray-300 text-gray-900';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  
  // Format date in a readable format
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };
  
  // Format status to Title Case (each word capitalized)
  const formatStatus = (status: string) => {
    if (status === 'screening_in_process') return 'Screening';
    return status
      .split('_')
      .map(word => {
        // Special case for 'ic' to become 'IC'
        if (word.toLowerCase() === 'ic') return 'IC';
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-xl font-semibold text-gray-900">Applications</h1>
          <p className="mt-2 pb-2 text-sm text-gray-700">
            A list of all participant applications with their status and score.
          </p>
        </div>
      </div>
      
      {/* Filters */}
      <div className="mt-2">
        {/* Labels row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 sm:gap-6 mb-0">
          <div className="text-xs font-medium text-gray-700 leading-none mb-0">Status</div>
          <div className="text-xs font-medium text-gray-700 leading-none mb-0">Search (name or email)</div>
          <div className="text-xs font-medium text-gray-700 leading-none md:col-span-2 mb-0">Screening Date</div>
          <div className="text-xs font-medium text-gray-700 leading-none md:col-span-2 mb-0">Submission Date</div>
          <div className="text-xs font-medium text-gray-700 leading-none md:text-right mb-0">&nbsp;</div>
        </div>
        {/* Inputs row */}
        <div className="-mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 sm:gap-6 items-end">
          <div>
            <label htmlFor="status-filter" className="sr-only">Status</label>
            <select
              id="status-filter"
              name="status-filter"
              className="block w-full h-9 pl-2 pr-8 py-1 text-sm border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md"
              value={statusFilter}
              onChange={handleStatusFilterChange}
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="new">New</option>
              <option value="in_review">In Review</option>
              <option value="screening_scheduled">Screening Scheduled</option>
              <option value="screening_no_show">Screening No Show</option>
              <option value="invited_to_reschedule">Invited to Reschedule</option>
              <option value="secondary_screening">Secondary Screening</option>
              <option value="medical_review_required">Medical Review Required</option>
              <option value="pending_medical_review">Pending Medical Review</option>
              <option value="pending_medication_change">Pending Medication Change</option>
              <option value="pending_ic">Pending IC</option>
              <option value="conditionally_approved">Conditionally Approved</option>
              <option value="screening_in_process">Screening</option>
              <option value="screening_completed">Screening Completed</option>
              <option value="closed">Closed</option>
              <option value="closed:Approved">Closed – Approved</option>
              <option value="closed:Rejected">Closed – Rejected</option>
              <option value="closed:Unresponsive">Closed – Unresponsive</option>
            </select>
          </div>

          <div>
            <label htmlFor="applications-search" className="sr-only">Search (name or email)</label>
            <input
              type="text"
              id="applications-search"
              className="block w-full h-9 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm px-3"
              placeholder="Search by name or email"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            />
          </div>

          <div className="md:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                className="block h-9 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm px-2 flex-1 min-w-[160px] md:min-w-[140px]"
                value={screeningFrom}
                onChange={(e) => { setScreeningFrom(e.target.value); setPage(1); }}
                aria-label="Screening from date"
              />
              <span className="hidden md:inline text-gray-500">–</span>
              <input
                type="date"
                className="block h-9 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm px-2 flex-1 min-w-[160px] md:min-w-[140px]"
                value={screeningTo}
                onChange={(e) => { setScreeningTo(e.target.value); setPage(1); }}
                aria-label="Screening to date"
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                className="block h-9 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm px-2 flex-1 min-w-[160px] md:min-w-[140px]"
                value={submissionFrom}
                onChange={(e) => { setSubmissionFrom(e.target.value); setPage(1); }}
                aria-label="Submission from date"
              />
              <span className="hidden md:inline text-gray-500">–</span>
              <input
                type="date"
                className="block h-9 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm px-2 flex-1 min-w-[160px] md:min-w-[140px]"
                value={submissionTo}
                onChange={(e) => { setSubmissionTo(e.target.value); setPage(1); }}
                aria-label="Submission to date"
              />
            </div>
          </div>

          <div className="col-span-1 md:col-span-6 flex justify-end">
            <button
              onClick={clearFilters}
              className="inline-flex items-center h-9 px-3 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>
      
      {/* Loading and error states */}
      {loading && (
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="mt-2 text-sm text-gray-500">Loading applications...</p>
        </div>
      )}
      
      {error && !loading && (
        <div className="rounded-md bg-red-50 p-4 mt-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error loading applications</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Applications table */}
      {!loading && !error && displayApplications.length === 0 && (
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No applications found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {statusFilter !== 'all' ? 'Try changing your filters to see more results.' : 'No applications have been received yet.'}
          </p>
        </div>
      )}
      
      {!loading && !error && displayApplications.length > 0 && (
        <div className="mt-8 flex flex-col">
          <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
            <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
              <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                <table className="min-w-full divide-y divide-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                        Participant
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Submission Date
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Status
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Score (R/Y/G)
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Screener
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Screening Date
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        View Application
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {displayApplications.map((application) => (
                      <tr key={application.id}>
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6">
                          <div className="font-medium text-gray-900">
                            <Link href={`/applications/${application.id}`} className="text-indigo-600 hover:text-indigo-900">
                              {application.participants?.first_name || 'Unknown'} {application.participants?.last_name || ''}
                            </Link>
                          </div>
                          <div className="text-gray-500">{application.participants?.email || 'No email'}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {formatDate(application.submission_date)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm">
                          {(() => {
                            // Derive display status: if database status is "pending" but answers/score exist, show as "New"
                            const hasAnyAnswers = (application.field_responses && application.field_responses.length > 0) || (!!application.calculated_score || application.calculated_score === 0);
                            const displayStatus = application.status === 'pending' && hasAnyAnswers ? 'new' : application.status;
                            return (
                              <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${getStatusBadgeColor(displayStatus)}`}>
                                {application.closed_reason === 'Rejected'
                                  ? `${formatStatus(displayStatus)} – ${application.closed_reason}${application.rejected_type ? ' – ' + application.rejected_type : ''}`
                                  : application.closed_reason
                                    ? `${formatStatus(displayStatus)} – ${application.closed_reason}`
                                    : formatStatus(displayStatus)}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm">
                          <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-md bg-gray-50">
                            <span className="text-red-600 font-semibold">{application.red_count ?? 0}</span>
                            <span className="text-gray-400">/</span>
                            <span className="text-yellow-600 font-semibold">{application.yellow_count ?? 0}</span>
                            <span className="text-gray-400">/</span>
                            <span className="text-green-600 font-semibold">{application.green_count ?? 0}</span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {(() => {
                            if (typeof application.screener === 'string') {
                              return application.screener;
                            } else if (application.screener && application.screener.first_name && application.screener.last_name) {
                              return `${application.screener.first_name} ${application.screener.last_name}`;
                            } else if (application.screener && application.screener.first_name) {
                              return application.screener.first_name;
                            } else {
                              return 'Unassigned';
                            }
                          })()}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {application.screening_meeting?.event_start ? formatDate(application.screening_meeting.event_start) : ''}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm">
                          {getNextActionLabel(application.status) && (
                            <Link 
                              href={`/applications/${application.id}`}
                              className="inline-block bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-medium py-1 px-3 rounded text-sm transition-colors duration-150"
                            >
                              {getNextActionLabel(application.status)}
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          </div>
        </div>
      )}
      {!loading && !error && (
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
      )}
    </div>
  );
}
