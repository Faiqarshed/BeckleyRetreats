'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Application } from '@/types/application';
import { getAllUsers } from '@/services/userService';
import Pagination from '@/components/Pagination';
import { UserRole } from '@/types/user';

// Local storage key (filters only)
const SCREENINGS_FILTER_KEY = 'screenings_filter_state';

export default function ScreeningsPage() {
  const [screenings, setScreenings] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [screenerOptions, setScreenerOptions] = useState<string[]>([]);
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);
  const pageSize = 10;
  
  // Filter states - initialize from localStorage
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SCREENINGS_FILTER_KEY);
      if (saved) {
        try {
          const filterState = JSON.parse(saved);
          return filterState.statusFilter || 'all';
        } catch (e) {
          console.warn('Failed to parse saved filter state:', e);
        }
      }
    }
    return 'all';
  });

  // Additional filters
  const [searchQuery, setSearchQuery] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SCREENINGS_FILTER_KEY);
      if (saved) {
        try {
          const filterState = JSON.parse(saved);
          return filterState.searchQuery || '';
        } catch {}
      }
    }
    return '';
  });

  const [scheduledFrom, setScheduledFrom] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SCREENINGS_FILTER_KEY);
      if (saved) {
        try {
          const filterState = JSON.parse(saved);
          return filterState.scheduledFrom || '';
        } catch {}
      }
    }
    return '';
  });

  const [scheduledTo, setScheduledTo] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SCREENINGS_FILTER_KEY);
      if (saved) {
        try {
          const filterState = JSON.parse(saved);
          return filterState.scheduledTo || '';
        } catch {}
      }
    }
    return '';
  });

  const [screenerFilter, setScreenerFilter] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SCREENINGS_FILTER_KEY);
      if (saved) {
        try {
          const filterState = JSON.parse(saved);
          return filterState.screenerFilter || 'all';
        } catch {}
      }
    }
    return 'all';
  });

  // Save filter state to localStorage
  const saveFilterState = (newStatusFilter: string) => {
    if (typeof window !== 'undefined') {
      const filterState = {
        statusFilter: newStatusFilter,
        searchQuery,
        scheduledFrom,
        scheduledTo,
        screenerFilter,
        timestamp: Date.now()
      };
      localStorage.setItem(SCREENINGS_FILTER_KEY, JSON.stringify(filterState));
    }
  };

  // Removed result caching; only filters persist

  // Clear filter state only
  const clearLocalStorage = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(SCREENINGS_FILTER_KEY);
    }
  };
  
  useEffect(() => {
    async function fetchScreenings() {
      try {
        setLoading(true);
        
        // Build query parameters based on filters
        const queryParams = new URLSearchParams();
        if (statusFilter !== 'all') {
          if (statusFilter.startsWith('closed:')) {
            queryParams.append('status', 'closed');
            const reason = statusFilter.split(':')[1];
            if (reason) queryParams.append('closed_reason', reason);
          } else {
            queryParams.append('status', statusFilter);
          }
        }
        
        // Always include screening-related statuses
        queryParams.append('screening', 'true');
        queryParams.append('page', String(page));
        queryParams.append('pageSize', String(pageSize));
        if (searchQuery.trim()) queryParams.append('search', searchQuery.trim());
        if (scheduledFrom) queryParams.append('screeningFrom', scheduledFrom);
        if (scheduledTo) queryParams.append('screeningTo', scheduledTo);
        if (screenerFilter && screenerFilter !== 'all') queryParams.append('screener', screenerFilter);
        const response = await fetch(`/api/applications?${queryParams.toString()}`, { cache: 'no-store' });
        
        if (!response.ok) {
          throw new Error('Failed to fetch screenings');
        }
        
        const data = await response.json();
        const screeningsData = data.applications || [];
        setScreenings(screeningsData);
        setTotal(data.total || 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        console.error('Error fetching screenings:', err);
      } finally {
        setLoading(false);
      }
    }
    
    fetchScreenings();
  }, [statusFilter, page, searchQuery, scheduledFrom, scheduledTo, screenerFilter]);

  // Load screeners from Users (Admin) list
  useEffect(() => {
    async function loadScreeners() {
      try {
        const { data, error } = await getAllUsers();
        if (error || !data) return;
        const names = data
          .filter((u: any) => u.is_active && (u.role === UserRole.SCREENER || u.role === UserRole.SCREENER_LEAD))
          .map((u: any) => `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim())
          .filter((n: string) => n.length > 0);
        const uniqueNames = Array.from(new Set(names)).sort() as string[];
        setScreenerOptions(uniqueNames);
      } catch (e) {
        // silently ignore
      }
    }
    loadScreeners();
  }, []);

  // Save filter state whenever it changes
  useEffect(() => {
    saveFilterState(statusFilter);
    // Reset page on any filter changes relevant to server-side fetching
    setPage(1);
  }, [statusFilter, searchQuery, scheduledFrom, scheduledTo, screenerFilter]);

  // Persist when other filters change
  useEffect(() => {
    saveFilterState(statusFilter);
  }, [searchQuery, scheduledFrom, scheduledTo, screenerFilter]);
  
  const handleStatusFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
  };
  
  const clearFilters = () => {
    setStatusFilter('all');
    setSearchQuery('');
    setScheduledFrom('');
    setScheduledTo('');
    setScreenerFilter('all');
    clearLocalStorage();
  };
  
  // Helper: determine if the initial screening notes have any meaningful content
  const hasNonEmptyNotes = (notes: any): boolean => {
    if (!notes) return false;
    try {
      // Exclude actionLogs from the check - we only want to check actual screening note content
      const { actionLogs, ...screeningNotes } = notes;
      
      return Object.values(screeningNotes).some((value) => {
        if (typeof value === 'boolean') return value === true;
        if (typeof value === 'string') return value.trim().length > 0;
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === 'object' && value !== null) return Object.keys(value).length > 0;
        return value !== null && value !== undefined;
      });
    } catch {
      return false;
    }
  };

  // Get the Next Action button label based on screening status
  const getNextActionLabel = (status: string): string | null => {
    switch (status) {
      case 'screening_scheduled': return 'Screening Notes';
      case 'secondary_screening': return 'Screening Notes';
      case 'medical_review_required': return 'Screening Notes';
      case 'screening_no_show': return 'Screening Notes';
      case 'invited_to_reschedule': return 'Screening Notes';
      case 'pending_medical_review': return 'Screening Notes';
      case 'pending_medication_change': return 'Screening Notes';
      case 'pending_ic': return 'Screening Notes';
      case 'conditionally_approved': return 'Screening Notes';
      case 'screening_in_process': return 'Screening Notes';
      case 'screening_completed': return 'Screening Notes';
      case 'closed': return 'Screening Notes';
      default: return 'View Screening';
    }
  };

  // Determine if the status should show a pending indicator instead of an action button
  const shouldShowPending = (status: string): boolean => {
    // No longer showing pending indicators, all have Review Screening Log links now
    return false;
  };
  
  // Get the appropriate URL for the next action
  const getActionUrl = (screening: Application): string => {
    switch (screening.status) {
      case 'medical_review_required':
        // If notes exist, go to view; otherwise go to edit
        return hasNonEmptyNotes((screening as any).initial_screening?.notes)
          ? `/screenings/${screening.id}/notes`
          : `/screenings/${screening.id}`;
      case 'screening_scheduled':
      case 'secondary_screening':
        // If notes exist, go to view; otherwise go to edit
        return hasNonEmptyNotes((screening as any).initial_screening?.notes)
          ? `/screenings/${screening.id}/notes`
          : `/screenings/${screening.id}`;
      case 'screening_in_process':
      case 'screening_completed':
      case 'closed':
        // Always show View Screening Notes; route to view if notes exist
        return hasNonEmptyNotes((screening as any).initial_screening?.notes)
          ? `/screenings/${screening.id}/notes`
          : `/screenings/${screening.id}`;
      case 'screening_no_show':
      case 'invited_to_reschedule':
        // Match View Screening Notes behavior: route to view if notes exist
        return hasNonEmptyNotes((screening as any).initial_screening?.notes)
          ? `/screenings/${screening.id}/notes`
          : `/screenings/${screening.id}`;
      case 'pending_medical_review':
      case 'pending_medication_change':
      case 'pending_ic':
        // All review actions link directly to the screening record
        return `/screenings/${screening.id}`;
      case 'conditionally_approved':
        // Match behavior: go to view if notes exist, else edit
        return hasNonEmptyNotes((screening as any).initial_screening?.notes)
          ? `/screenings/${screening.id}/notes`
          : `/screenings/${screening.id}`;
      default:
        return `/screenings/${screening.id}`;
    }
  };
  
  // Get the appropriate button style based on status
  const getButtonStyle = (status: string): string => {
    switch (status) {
      case 'medical_review_required':
        // Use the default button styling like other actions
        return 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700';
      case 'screening_no_show':
        // Match standard View Screening Notes button style
        return 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700';
      case 'invited_to_reschedule':
        return 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700';

      case 'pending_medical_review':
        return 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700';
      case 'pending_medication_change':
        return 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700';
      case 'pending_ic':
        return 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700';
      case 'conditionally_approved':
        return 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700';
      default:
        return 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700';
    }
  };
  
  // Determine badge color based on status
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
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
        return 'bg-teal-100 text-teal-700';
      case 'conditionally_approved':
        return 'bg-green-100 text-green-800';
      case 'screening_in_process':
        return 'bg-green-100 text-green-800';
      case 'screening_completed':
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

  // Derived filtered list
  const filteredScreenings = (() => {
    const toDateOnly = (iso?: string) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
    const q = searchQuery?.trim().toLowerCase() || '';
    return screenings.filter((s) => {
      // name/email search
      const first = (s.participants?.first_name || '').toLowerCase();
      const last = (s.participants?.last_name || '').toLowerCase();
      const email = (s.participants?.email || '').toLowerCase();
      const matchesSearch = q === '' || first.includes(q) || last.includes(q) || `${first} ${last}`.includes(q) || email.includes(q);

      // scheduled date
      const sched = toDateOnly(s.screening_meeting?.event_start as any);
      const withinFrom = !scheduledFrom || (sched && sched >= scheduledFrom);
      const withinTo = !scheduledTo || (sched && sched <= scheduledTo);

      // screener filter
      const screenerName = (() => {
        if (typeof s.screener === 'string') return s.screener;
        if (s.screener && s.screener.first_name && s.screener.last_name) return `${s.screener.first_name} ${s.screener.last_name}`;
        if (s.screener && s.screener.first_name) return s.screener.first_name;
        return 'Unassigned';
      })();
      const matchesScreener = screenerFilter === 'all' || screenerName === screenerFilter;

      return matchesSearch && withinFrom && withinTo && matchesScreener;
    });
  })();

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-xl font-semibold text-gray-900">Screenings</h1>
          <p className="mt-2 text-sm text-gray-700">
            A list of all screenings in the system, including their status, assigned screener, and scheduled date.
          </p>
        </div>
      </div>
      
      {/* Filters */}
      <div className="mt-4">
                 <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 sm:gap-6">
           <div className="text-xs font-medium text-gray-700 text-left">Status</div>
           <div className="text-xs font-medium text-gray-700 text-left">Search (name or email)</div>
           <div className="text-xs font-medium text-gray-700 text-left">Screener</div>
           <div className="text-xs font-medium text-gray-700 text-left">Scheduled Date</div>
           <div className="text-xs font-medium text-gray-700 text-right">&nbsp;</div>
         </div>
         <div className="mt-2 grid grid-cols-1 sm:grid-cols-5 gap-3 sm:gap-6 items-end">
                     <div>
             <label htmlFor="status-filter" className="sr-only">Status</label>
             <select
               id="status-filter"
               value={statusFilter}
               onChange={handleStatusFilterChange}
               className="block w-full h-9 pl-2 pr-8 py-1 text-sm border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md"
             >
               <option value="all">All Statuses</option>
               <option value="pending">Pending</option>
               <option value="screening_scheduled">Scheduled</option>
               <option value="screening_no_show">No Show</option>
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
             <label htmlFor="screenings-search" className="sr-only">Search</label>
             <input
               id="screenings-search"
               type="text"
               className="block w-full h-9 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm px-3"
               placeholder="Search by name or email"
               value={searchQuery}
               onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
             />
           </div>

           <div>
             <label htmlFor="screener-filter" className="sr-only">Screener</label>
             <select
               id="screener-filter"
               value={screenerFilter}
               onChange={(e) => setScreenerFilter(e.target.value)}
               className="block w-full h-9 pl-2 pr-8 py-1 text-sm border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md"
             >
               <option value="all">All Screeners</option>
               {screenerOptions.map((name) => (
                 <option key={name} value={name}>{name}</option>
               ))}
             </select>
           </div>

           <div>
             <div className="flex items-center space-x-3">
               <input
                 type="date"
                 className="block sm:w-[100px] md:w-[120px] h-9 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm px-2"
                 value={scheduledFrom}
                 onChange={(e) => { setScheduledFrom(e.target.value); setPage(1); }}
                 aria-label="Scheduled from date"
               />
               <span className="text-gray-500">–</span>
               <input
                 type="date"
                 className="block sm:w-[100px] md:w-[120px] h-9 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm px-2"
                 value={scheduledTo}
                 onChange={(e) => { setScheduledTo(e.target.value); setPage(1); }}
                 aria-label="Scheduled to date"
               />
             </div>
           </div>

           <div className="text-right">
             <button
               type="button"
               onClick={clearFilters}
               className="inline-flex items-center h-9 px-3 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500"
             >
               Clear Filters
             </button>
           </div>
        </div>
      </div>
      
      {/* Screenings Table */}
      {loading ? (
        <div className="mt-6 text-center">
          <p className="text-gray-500">Loading screenings...</p>
        </div>
      ) : error ? (
        <div className="mt-6 text-center">
          <p className="text-red-500">{error}</p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col">
          <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
            <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
              <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                <table className="min-w-full divide-y divide-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                        Participant Name
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
                        Scheduled Date
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Next Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {filteredScreenings.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-4 text-center text-sm text-gray-500">
                          No screenings found
                        </td>
                      </tr>
                    ) : (
                      filteredScreenings.map((screening) => (
                        <tr key={screening.id}>
                          <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                            {screening.participants?.first_name} {screening.participants?.last_name}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeColor(screening.status)}`}>
                              {screening.status === 'screening_completed' ? (
                                screening.closed_reason === 'Rejected'
                                  ? `Screening Completed – ${screening.closed_reason}${screening.rejected_type ? ' – ' + screening.rejected_type : ''}`
                                  : screening.closed_reason
                                    ? `Screening Completed – ${screening.closed_reason}`
                                    : 'Screening Completed'
                              ) : screening.closed_reason === 'Rejected' ? (
                                `${formatStatus(screening.status)} – ${screening.closed_reason}${screening.rejected_type ? ' – ' + screening.rejected_type : ''}`
                              ) : screening.closed_reason ? (
                                `${formatStatus(screening.status)} – ${screening.closed_reason}`
                              ) : (
                                formatStatus(screening.status)
                              )}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-md bg-gray-50">
                              <span className="text-red-600 font-semibold">{screening.red_count ?? 0}</span>
                              <span className="text-gray-400">/</span>
                              <span className="text-yellow-600 font-semibold">{screening.yellow_count ?? 0}</span>
                              <span className="text-gray-400">/</span>
                              <span className="text-green-600 font-semibold">{screening.green_count ?? 0}</span>
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {(() => {
                              if (typeof screening.screener === 'string') {
                                return screening.screener;
                              } else if (screening.screener && screening.screener.first_name && screening.screener.last_name) {
                                return `${screening.screener.first_name} ${screening.screener.last_name}`;
                              } else if (screening.screener && screening.screener.first_name) {
                                return screening.screener.first_name;
                              } else {
                                return 'Unassigned';
                              }
                            })()}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {screening.screening_meeting?.event_start ? formatDate(screening.screening_meeting.event_start) : ''}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm">
                            {shouldShowPending(screening.status) ? (
                              <span className="text-gray-500 italic">
                                [ Pending ]
                              </span>
                            ) : getNextActionLabel(screening.status) ? (
                              <Link 
                                href={getActionUrl(screening)}
                                className={`inline-block ${getButtonStyle(screening.status)} font-medium py-1 px-3 rounded text-sm transition-colors duration-150`}
                              >
                                {getNextActionLabel(screening.status)}
                              </Link>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    )}
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
