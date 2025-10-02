'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Application, ApplicationStatus, ScoreValue } from '@/types/application';
import ClosedReasonModal from '@/components/ui/ClosedReasonModal';
import { useAuth } from '@/context/AuthContext';

export default function ScreeningDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { userProfile } = useAuth();
  const searchParams = useSearchParams();
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<ApplicationStatus | ''>('');
  const [originalStatus, setOriginalStatus] = useState<ApplicationStatus | ''>('');
  const [updating, setUpdating] = useState(false);
  const [closedReasonModalOpen, setClosedReasonModalOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<ApplicationStatus | null>(null);
  const [pendingClosedReason, setPendingClosedReason] = useState('');
  const [pendingSubmitAfterReason, setPendingSubmitAfterReason] = useState(false);
  const [responseFilter, setResponseFilter] = useState<string>('all');
  const [screeningNotes, setScreeningNotes] = useState({
    initialScreeningSummary: '',
    secondaryScreeningSummary: '',
    generalNotes: '',
    desiredRetreat: '',
    scholarshipNeeded: false, // Changed from scholarshipNeeds (text) to scholarshipNeeded (boolean)
    medsHealthHistory: '',
    supportSystem: '',
    intention: '',
    psychHistory: '',
    psychObservation: '',
    psychedelicExperience: '',
    supportiveHabits: ''
  });
  const emptyNotesDefaults = {
    initialScreeningSummary: '',
    secondaryScreeningSummary: '',
    generalNotes: '',
    desiredRetreat: '',
    scholarshipNeeded: false,
    medsHealthHistory: '',
    supportSystem: '',
    intention: '',
    psychHistory: '',
    psychObservation: '',
    psychedelicExperience: '',
    supportiveHabits: ''
  };

  const [actionLogs, setActionLogs] = useState<string[]>([]);
  const [initialNotesSnapshot, setInitialNotesSnapshot] = useState<any>(null);
  const [notesAtPageLoad, setNotesAtPageLoad] = useState<any>(null);
  const [noteRole, setNoteRole] = useState<string>('');

  useEffect(() => {
    async function fetchScreeningDetails() {
      if (!params.id) return;

      try {
        setLoading(true);
        const response = await fetch(`/api/applications/${params.id}`, { cache: 'no-store' });

        if (!response.ok) {
          throw new Error('Failed to fetch screening details');
        }

        const data = await response.json();
        setApplication(data.application);
        setSelectedStatus(data.application.status);
        setOriginalStatus(data.application.status);
        
        // If the application has existing initial screening data with notes, load them
        if (data.application.initial_screening && data.application.initial_screening.notes) {
          const notes = data.application.initial_screening.notes as any;
          // Support deep link via ?noteKey=ROLE:userId
          const noteKeyParam = (searchParams?.get('noteKey') || '').toString().trim();
          // Prefer user-scoped role notes first: ROLE:userId
          const baseRole = ((noteRole || (userProfile as any)?.role || '') as string).toString().trim();
          const userId = (userProfile as any)?.id || '';
          const compositeKey = noteKeyParam || (baseRole && userId ? `${baseRole}:${userId}` : '');
          const userScoped = compositeKey && notes?.roles && typeof notes.roles === 'object' ? notes.roles[compositeKey] : undefined;
          // Fallback to generic role key if user-scoped not found
          const roleGenericKey = baseRole;
          const roleGeneric = roleGenericKey && notes?.roles && typeof notes.roles === 'object' ? notes.roles[roleGenericKey] : undefined;

          const source = (userScoped && typeof userScoped === 'object')
            ? userScoped
            : (roleGeneric && typeof roleGeneric === 'object')
              ? roleGeneric
              : {};

          // Handle transition from scholarshipNeeds (text) to scholarshipNeeded (boolean)
          let scholarshipNeeded = false;
          if (typeof source.scholarshipNeeded === 'boolean') {
            scholarshipNeeded = source.scholarshipNeeded;
          } else if (source.scholarshipNeeds && String(source.scholarshipNeeds).trim() !== '') {
            scholarshipNeeded = true;
          }

          const loadedNotes = {
            ...emptyNotesDefaults, // force fresh defaults to avoid leaking other roles' values
            ...source,
            scholarshipNeeded
          } as typeof emptyNotesDefaults;

          setScreeningNotes(loadedNotes);

          // Capture the initial state for comparison when submit is pressed
          setNotesAtPageLoad({
            ...loadedNotes
          });

          // Capture a normalized snapshot for change detection
          setInitialNotesSnapshot({
            ...notes,
            scholarshipNeeded
          });

          const existingLogs = Array.isArray(notes.actionLogs) ? notes.actionLogs : [];
          const appLogs = Array.isArray((data.application.application_data as any)?.actionLogs) ? (data.application.application_data as any).actionLogs : [];
          const mergedSet = new Set<string>([...appLogs, ...existingLogs]);
          const merged = Array.from(mergedSet);
          const sorted = sortActionLogsByTimestamp(merged);
          setActionLogs(sorted);
        } else {
          // No existing notes; snapshot the initial empty state
          setNotesAtPageLoad({ ...emptyNotesDefaults });
          setInitialNotesSnapshot({ ...emptyNotesDefaults });
          // Show any early logs stored on application_data
          const appLogs = Array.isArray((data.application.application_data as any)?.actionLogs) ? (data.application.application_data as any).actionLogs : [];
          if (appLogs.length > 0) {
            const deduped = Array.from(new Set<string>(appLogs));
            const sorted = sortActionLogsByTimestamp(deduped);
            setActionLogs(sorted);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        console.error('Error fetching screening details:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchScreeningDetails();
  }, [params.id, userProfile, searchParams]);

  useEffect(() => {
    if (!noteRole) {
      const defaultRole = ((userProfile as any)?.role || '').toString().trim();
      if (defaultRole) setNoteRole(defaultRole);
    }
  }, [userProfile, noteRole]);

  // Helper to sort action logs by the embedded ET timestamp in the string
  const sortActionLogsByTimestamp = (logs: string[]): string[] => {
    const monthIndex: Record<string, number> = {
      January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
      July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
    };
    const parseLogDate = (log: string): number => {
      // Example: "... at 5:10:23pm ET - 08 July 2025" (with seconds)
      const match = log.match(/ at (\d{1,2}):(\d{2})(?::(\d{2}))?(am|pm) ET - (\d{2}) ([A-Za-z]+) (\d{4})$/i);
      if (!match) return 0;
      let [ , hh, mm, ssOpt, ampm, dd, mon, yyyy ] = match;
      let hour = parseInt(hh, 10);
      const minute = parseInt(mm, 10);
      const second = ssOpt ? parseInt(ssOpt, 10) : 0;
      const day = parseInt(dd, 10);
      const year = parseInt(yyyy, 10);
      const month = monthIndex[mon] ?? 0;
      if (ampm.toLowerCase() === 'pm' && hour !== 12) hour += 12;
      if (ampm.toLowerCase() === 'am' && hour === 12) hour = 0;
      const d = new Date(year, month, day, hour, minute, second, 0);
      return d.getTime();
    };
    return [...logs].sort((a, b) => parseLogDate(a) - parseLogDate(b));
  };
  
  // Handler for saving screening notes
  const handleSaveNotes = async () => {
    if (!application) return;
    
    try {
      setSaving(true);
      
      const response = await fetch(`/api/screenings/${params.id}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          screening_notes: screeningNotes,
          submitted: false,
          note_role: (noteRole || '').trim() || undefined
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save screening notes');
      }
      
      setSaveSuccess(true);
      // Hide success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save screening notes');
      console.error('Error saving screening notes:', err);
    } finally {
      setSaving(false);
    }
  };
  
  // Handler for submitting screening notes
  const handleSubmitNotes = async () => {
    if (!application) return;
    // If closing, require closed reason modal
    if (selectedStatus === 'closed') {
      setPendingStatus('closed');
      setPendingSubmitAfterReason(true);
      setClosedReasonModalOpen(true);
      return;
    }

    // Otherwise, persist status change (if any) and submit notes directly
    try {
      setSaving(true);
      // Check if status changed and notes have changed
      // We need to check against the original status to see if status was changed in this session
      const statusChanged = selectedStatus && selectedStatus !== originalStatus;
      const notesHaveChanged = (() => {
        try {
          const current = screeningNotes || {};
          const base = notesAtPageLoad || {};
          return JSON.stringify(current) !== JSON.stringify(base);
        } catch {
          return true;
        }
      })();

      // If status changed, we need to check if there was a recent status change action log
      // to avoid creating duplicate action logs
      let shouldCreateCombinedMessage = false;
      if (statusChanged && notesHaveChanged) {
        shouldCreateCombinedMessage = true;
      }

      // Update status if it changed
      if (statusChanged) {
        const statusResp = await fetch(`/api/applications/${application.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: selectedStatus })
        });
        const statusJson = await statusResp.json().catch(() => ({}));
        if (!statusResp.ok) {
          throw new Error(statusJson.error || 'Failed to update application status');
        }
        setApplication({ ...application, status: statusJson.status || selectedStatus });
      }

      // Create combined action log message (same pattern as closed status)
      let actionLogMessage = '';
      if (statusChanged) {
        // Status was changed in this session
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
        
        const statusLabel = statusLabels[selectedStatus] || selectedStatus;
        if (notesHaveChanged) {
          actionLogMessage = `marked applicant as "${statusLabel}" and edited screening notes`;
        } else {
          actionLogMessage = `marked applicant as "${statusLabel}" and submitted screening notes`;
        }
      } else if (notesHaveChanged) {
        // Only notes are being submitted (status wasn't changed in this session)
        actionLogMessage = 'edited screening notes';
      } else {
        // No changes to notes, just submitting
        actionLogMessage = 'submitted screening notes';
      }

      const response = await fetch(`/api/screenings/${params.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          screening_notes: screeningNotes, 
          submitted: true, 
          note_role: (noteRole || '').trim() || undefined,
          application_status: selectedStatus, 
          action_log_message: actionLogMessage 
        })
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to submit screening notes');
      }
      router.push('/screenings');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred submitting the screening notes');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Determine badge color based on status - matching the listing page style
  const getStatusBadgeColor = (status: string | undefined) => {
    if (!status) return 'bg-gray-100 text-gray-700';
    switch (status.toLowerCase()) { // Normalize to lowercase for safety
      case 'screening_scheduled':
      case 'scheduled': // from ScreeningStatus
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
        return 'bg-yellow-100 text-yellow-800';
      case 'pending_medication_change':
        return 'bg-yellow-100 text-yellow-800';
      case 'pending_ic':
        return 'bg-yellow-100 text-yellow-800';
      case 'conditionally_approved':
        return 'bg-teal-100 text-teal-800';
      case 'screening_in_process':
        return 'bg-green-100 text-green-800';
      case 'closed':
        return 'bg-gray-100 text-gray-500';
      case 'new':
        return 'bg-blue-100 text-blue-800';
      case 'in_review':
      case 'pending': // from ScreeningStatus
        return 'bg-yellow-100 text-yellow-800';
      case 'screening_completed':
      case 'completed': // from ScreeningStatus
        return 'bg-green-100 text-green-800';
      case 'cancelled': // from ScreeningStatus
        return 'bg-pink-100 text-pink-800';
      default:
        return 'bg-gray-100 text-gray-700';
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
    <div className="p-4">
      <div className="mb-6">
        <button 
          onClick={() => router.back()} 
          className="text-indigo-600 hover:text-indigo-900"
        >
          ← Back to Screenings
        </button>
      </div>

      <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-white">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              {application.participants?.first_name} {application.participants?.last_name}
            </h1>
            <p className="text-sm text-gray-500">Application ID: {params.id}</p>
          </div>
          <div className="mt-3 sm:mt-0 text-left sm:text-right">
            <div className="flex items-center justify-start sm:justify-end space-x-2 mb-1">
              <span className="text-sm font-medium text-gray-600">Status:</span>
              <div className="flex items-center space-x-3">
                {updating && (
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-solid border-indigo-500 border-r-transparent align-[-0.125em]" />
                )}
                {/** Map screening_completed to display as Closed in the dropdown */}
                {(() => { const displayedStatus = selectedStatus === 'screening_completed' ? 'closed' : selectedStatus; return (
                <select
                  id="status"
                  name="status"
                  className={`pl-3 pr-10 py-1.5 text-sm border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md ${updating ? 'opacity-75' : ''}`}
                  value={displayedStatus}
                  disabled={updating || saving}
                  onChange={async (e) => {
                    const newStatus = e.target.value as ApplicationStatus;
                    // If app is currently screening_completed, we display 'closed' but underlying is different.
                    // Prevent no-op check from blocking when mapping is in effect
                    const effectiveCurrent = application.status === 'screening_completed' ? 'closed' as ApplicationStatus : application.status;
                    if (newStatus === effectiveCurrent) {
                      return;
                    }
                    
                    // If closing, open Closed Reason modal and defer update
                    if (newStatus === 'closed') {
                      setPendingStatus('closed');
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
                      // Optimistically add a local action log entry so it shows immediately
                      try {
                        const now = new Date();
                        const etTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'America/New_York' })
                          .toLowerCase()
                          .replace(' ', '');
                        const etDate = now.toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/New_York' });
                        const displayName = [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' ') || 'Unknown User';
                        const optimisticLine = `${displayName} marked applicant as "${statusLabel}" at ${etTime} ET - ${etDate}`;
                        setActionLogs((prev) => Array.isArray(prev) ? [...prev, optimisticLine] : [optimisticLine]);
                      } catch {}

                      const actionLogResp = await fetch(`/api/screenings/${params.id}/notes`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                          screening_notes: {},
                          action_log_message: `marked applicant as "${statusLabel}"`,
                          application_status: result.status || newStatus
                        })
                      });
                      
                      if (actionLogResp.ok) {
                        try {
                          const respJson = await actionLogResp.json();
                          const serverNotes = respJson?.data?.notes;
                          if (serverNotes && Array.isArray(serverNotes.actionLogs)) {
                            setActionLogs(serverNotes.actionLogs);
                          }
                          // Ensure local state has initial_screening so refresh shows logs
                          if (respJson?.data) {
                            setApplication((prev) => prev ? { ...prev, initial_screening: respJson.data } as any : prev);
                          }
                        } catch {}
                      }
                      
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
            </div>
            <p className="text-sm text-gray-500">
              Screener: {application.screening_meeting?.user_name || application.initial_screening?.screener_id || 'N/A'}
            </p>
            <p className="text-sm text-gray-500">
              {application.initial_screening?.completed_at ? 'Screening Completed: ' : 'Screening Scheduled: '}
              {application.initial_screening?.completed_at 
                ? formatDate(application.initial_screening.completed_at) 
                : (application.screening_meeting?.event_start ? formatDate(application.screening_meeting.event_start) : 'N/A')}
            </p>
          </div>
        </div>
      </div>

            {/* Screening Score */}
            <div className="flex flex-col items-end">
              <div className="text-sm font-medium text-gray-500">Screening Score</div>
              <div className="flex items-center space-x-2 mt-1">
                <span className="px-2 py-1 text-red-600 font-semibold">
                  {application.red_count || 0}
                </span>
                <span className="text-gray-400">/</span>
                <span className="px-2 py-1 text-yellow-600 font-semibold">
                  {application.yellow_count || 0}
                </span>
                <span className="text-gray-400">/</span>
                <span className="px-2 py-1 text-green-600 font-semibold">
                  {application.green_count || 0}
                </span>
              </div>
              {/* Screening date removed from here as it's already shown in the participant info section */}
            </div>
      {/* Two-column layout for Application Responses and Screening Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Application Responses */}
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Application Responses</h2>
            <div className="mt-1">
              <select 
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                value={responseFilter}
                onChange={(e) => setResponseFilter(e.target.value)}
              >
                <option value="all">All Responses</option>
                <option value="red">Red Flags Only</option>
                <option value="yellow">Yellow Flags Only</option>
                <option value="flagged">All Flagged (Red + Yellow)</option>
              </select>
            </div>
          </div>
          <div className="px-4 py-5 sm:p-6 overflow-y-auto max-h-[80vh]">
            {application.field_responses && application.field_responses.length > 0 ? (
              <div className="space-y-6">
                {application.field_responses
                  // Filter out placeholders and sort by original sequence
                  .filter((response: any) => {
                    // Keep responses that are not placeholders and have field data
                    const hasValidData = !response.isPlaceholder && response.field && response.field.field_title;
                    
                    // Apply additional filtering based on user selection
                    if (!hasValidData) return false;
                    
                    if (responseFilter === 'all') return true;
                    if (responseFilter === 'red' && response.score === 'red') return true;
                    if (responseFilter === 'yellow' && response.score === 'yellow') return true;
                    if (responseFilter === 'flagged' && (response.score === 'red' || response.score === 'yellow')) return true;
                    
                    return false;
                  })
                  .sort((a: any, b: any) => {
                    // Preserve original form sequence
                    const aOrder = a.field?.sequence_number || 0;
                    const bOrder = b.field?.sequence_number || 0;
                    return aOrder - bOrder;
                  })
                  .map((response: any, index: number) => {
                    const fieldTitle = response.field?.field_title || 'Unknown Field';
                    const responseValue = response.display_value || response.response_value || '-';
                    const score = response.score as ScoreValue;
                    const fieldType = response.field?.field_type || 'Unknown Type';
                    const hierarchyLevel = response.field?.hierarchy_level || 0;
                    
                    // Skip certain field types that don't need to be displayed
                    if (fieldType === 'statement' || fieldType === 'group') {
                      return null;
                    }
                    
                    // Apply indent based on hierarchy level
                    const indentClass = hierarchyLevel > 0 ? `pl-${Math.min(hierarchyLevel * 2, 6)}` : '';
                    
                    // Determine background color based on score
                    let bgColorClass = '';
                    if (score === 'yellow') {
                      bgColorClass = 'bg-yellow-50';
                    } else if (score === 'red') {
                      bgColorClass = 'bg-red-50';
                    }
                    
                    return (
                      <div 
                        key={response.id || index} 
                        className={`p-3 rounded-md ${bgColorClass} ${indentClass}`}
                      >
                        <p className="text-sm font-bold text-gray-700 mb-1">{fieldTitle}</p>
                        <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{responseValue}</p>
                        {score && (
                          <div className="mt-1">
                            <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 
                              ${score === 'red' ? 'bg-red-100 text-red-800' : 
                                score === 'yellow' ? 'bg-yellow-100 text-yellow-800' : 
                                  score === 'green' ? 'bg-green-100 text-green-800' : 
                                    'bg-gray-100 text-gray-800'}`}
                            >
                              {score.toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })
                  .filter(Boolean) // Remove null entries
                }
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">
                No application responses available.
              </p>
            )}
          </div>
        </div>

        {/* Right Column - Screening Notes */}
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-gray-900">Screening Notes</h2>
              {/* Screener Name placeholder removed */}
            </div>
          </div>
          <div className="px-4 py-5 sm:p-6">
            <form className="space-y-6">
              {/* Initial Screening Summary */}
              <div className="mt-4">
                <label htmlFor="initialScreeningSummary" className="block text-sm font-medium text-gray-700">
                  Initial Screening Summary
                </label>
                <div className="mt-1">
                  <textarea
                    id="initialScreeningSummary"
                    name="initialScreeningSummary"
                    rows={3}
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border border-gray-300 rounded-md p-2"
                    value={screeningNotes.initialScreeningSummary}
                    onChange={(e) => setScreeningNotes({...screeningNotes, initialScreeningSummary: e.target.value})}
                  />
                </div>
              </div>
              
              {/* Secondary Screening Summary */}
              <div className="mt-4">
                <label htmlFor="secondaryScreeningSummary" className="block text-sm font-medium text-gray-700">
                  Secondary Screening Summary
                </label>
                <div className="mt-1">
                  <textarea
                    id="secondaryScreeningSummary"
                    name="secondaryScreeningSummary"
                    rows={3}
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border border-gray-300 rounded-md p-2"
                    value={screeningNotes.secondaryScreeningSummary}
                    onChange={(e) => setScreeningNotes({...screeningNotes, secondaryScreeningSummary: e.target.value})}
                  />
                </div>
              </div>
              
              {/* General Notes */}
              <div className="mt-4">
                <label htmlFor="generalNotes" className="block text-sm font-medium text-gray-700">
                  Additional Information
                </label>
                <div className="mt-1">
                  <textarea
                    id="generalNotes"
                    name="generalNotes"
                    rows={4}
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border border-gray-300 rounded-md p-2"
                    value={screeningNotes.generalNotes}
                    onChange={(e) => setScreeningNotes({...screeningNotes, generalNotes: e.target.value})}
                  />
                </div>
              </div>
              
              {/* Desired Retreat */}
              <div>
                <label htmlFor="desiredRetreat" className="block text-sm font-medium text-gray-700">
                  Desired Retreat
                </label>
                <div className="mt-1">
                  <textarea
                    id="desiredRetreat"
                    name="desiredRetreat"
                    rows={4}
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2"
                    value={screeningNotes.desiredRetreat}
                    onChange={(e) => setScreeningNotes({...screeningNotes, desiredRetreat: e.target.value})}
                  />
                </div>
              </div>
              
              {/* Scholarship Needed Checkbox */}
              <div className="mt-4">
                <div className="flex items-center">
                  <input
                    id="scholarshipNeeded"
                    name="scholarshipNeeded"
                    type="checkbox"
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    checked={screeningNotes.scholarshipNeeded}
                    onChange={(e) => setScreeningNotes({...screeningNotes, scholarshipNeeded: e.target.checked})}
                  />
                  <label htmlFor="scholarshipNeeded" className="ml-2 block text-sm font-medium text-gray-700">
                    Scholarship Needed
                  </label>
                </div>
              </div>
              
              {/* Meds/Health History */}
              <div>
                <label htmlFor="medsHealthHistory" className="block text-sm font-medium text-gray-700">
                  Meds/Health History
                </label>
                <div className="mt-1">
                  <textarea
                    id="medsHealthHistory"
                    name="medsHealthHistory"
                    rows={4}
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2"
                    value={screeningNotes.medsHealthHistory}
                    onChange={(e) => setScreeningNotes({...screeningNotes, medsHealthHistory: e.target.value})}
                  />
                </div>
              </div>
              
              {/* Support System */}
              <div className="mt-4">
                <label htmlFor="supportSystem" className="block text-sm font-medium text-gray-700">
                  Support System
                </label>
                <div className="mt-1">
                  <textarea
                    id="supportSystem"
                    name="supportSystem"
                    rows={3}
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border border-gray-300 rounded-md p-2"
                    value={screeningNotes.supportSystem}
                    onChange={(e) => setScreeningNotes({...screeningNotes, supportSystem: e.target.value})}
                  />
                </div>
              </div>
              
              {/* Intention */}
              <div className="mt-4">
                <label htmlFor="intention" className="block text-sm font-medium text-gray-700">
                  Intention
                </label>
                <div className="mt-1">
                  <textarea
                    id="intention"
                    name="intention"
                    rows={3}
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border border-gray-300 rounded-md p-2"
                    value={screeningNotes.intention}
                    onChange={(e) => setScreeningNotes({...screeningNotes, intention: e.target.value})}
                  />
                </div>
              </div>
              
              {/* Psych History */}
              <div className="mt-4">
                <label htmlFor="psychHistory" className="block text-sm font-medium text-gray-700">
                  Psych History
                </label>
                <div className="mt-1">
                  <textarea
                    id="psychHistory"
                    name="psychHistory"
                    rows={3}
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border border-gray-300 rounded-md p-2"
                    value={screeningNotes.psychHistory}
                    onChange={(e) => setScreeningNotes({...screeningNotes, psychHistory: e.target.value})}
                  />
                </div>
              </div>

               {/* Psychological Observations & Background */}
              <div className="mt-4">
                <label htmlFor="psychObservation" className="block text-sm font-medium text-gray-700">
                  Psychological Observations & Background
                </label>
                <div className="mt-1">
                  <textarea
                    id="psychObservation"
                    name="psychObservation"
                    rows={3}
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border border-gray-300 rounded-md p-2"
                    value={screeningNotes.psychObservation}
                    onChange={(e) => setScreeningNotes({...screeningNotes, psychObservation: e.target.value})}
                  />
                </div>
              </div>
              
              {/* Psychedelic Experience */}
              <div>
                <label htmlFor="psychedelicExperience" className="block text-sm font-medium text-gray-700">
                  Psychedelic Experience
                </label>
                <div className="mt-1">
                  <textarea
                    id="psychedelicExperience"
                    name="psychedelicExperience"
                    rows={4}
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2"
                    value={screeningNotes.psychedelicExperience}
                    onChange={(e) => setScreeningNotes({...screeningNotes, psychedelicExperience: e.target.value})}
                  />
                </div>
              </div>
              
              {/* Supportive Habits */}
              <div>
                <label htmlFor="supportiveHabits" className="block text-sm font-medium text-gray-700">
                  Supportive Habits
                </label>
                <div className="mt-1">
                  <textarea
                    id="supportiveHabits"
                    name="supportiveHabits"
                    rows={4}
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2"
                    value={screeningNotes.supportiveHabits}
                    onChange={(e) => setScreeningNotes({...screeningNotes, supportiveHabits: e.target.value})}
                  />
                </div>
              </div>
            </form>

            {/* Action Logs */}
            <div className="mt-8 border-t border-gray-200 pt-4">
              <h3 className="text-md font-semibold text-gray-800 mb-2">Action Log</h3>
              {actionLogs && actionLogs.length > 0 ? (
                <ul className="list-disc pl-5 space-y-1">
                  {actionLogs.map((log, idx) => (
                    <li key={idx} className="text-sm text-gray-600">{log}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500 italic">No actions recorded yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-6 flex items-center justify-end space-x-4">
        {saveSuccess && (
          <div className="mr-auto px-4 py-2 bg-green-50 text-green-700 rounded-md">
            Screening notes saved successfully!
          </div>
        )}
        <button 
          onClick={handleSaveNotes} 
          disabled={saving}
          className="px-4 py-2 border border-blue-500 text-blue-500 rounded-md hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Screening Notes'}
        </button>
        <button 
          onClick={handleSubmitNotes} 
          disabled={saving}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Submitting...' : 'Submit Screening Notes'}
        </button>
      </div>

      {/* Closed Reason Modal */}
      <ClosedReasonModal
        isOpen={closedReasonModalOpen}
        onClose={() => {
          setClosedReasonModalOpen(false);
          setPendingStatus(null);
          setPendingClosedReason('');
          setPendingSubmitAfterReason(false);
          // Revert status selection back to current application status when cancelling
          setSelectedStatus(application.status);
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
            
            // Build reason label once
            const reasonLabel = reason === 'Rejected' && body.rejected_type ? `${reason} (${body.rejected_type})` : reason;

            // Determine if notes have changed vs snapshot
            const notesHaveChanged = (() => {
              try {
                const current = screeningNotes || {};
                const base = notesAtPageLoad || {};
                return JSON.stringify(current) !== JSON.stringify(base);
              } catch {
                return true;
              }
            })();

            // If the modal was opened from Submit flow
            if (pendingSubmitAfterReason) {
              setSaving(true);
              // Build a single combined action log when status changed and notes were updated
              const combinedMessage = notesHaveChanged 
                ? `marked applicant as "${reasonLabel}" and edited screening notes`
                : `marked applicant as "${reasonLabel}" and submitted screening notes`;

              const notesResp = await fetch(`/api/screenings/${params.id}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Send application_status='closed'; server converts to 'screening_in_process' on submit
                body: JSON.stringify({ screening_notes: screeningNotes, submitted: true, action_log_message: combinedMessage, application_status: 'closed', note_role: (noteRole || '').trim() || undefined }),
              });
              if (!notesResp.ok) {
                const errJson = await notesResp.json().catch(() => ({}));
                throw new Error(errJson.error || 'Failed to submit screening notes');
              }
              
              // Refresh action logs from server response if provided
              try {
                const respJson = await notesResp.json();
                const serverNotes = respJson?.data?.notes;
                if (serverNotes && Array.isArray(serverNotes.actionLogs)) {
                  setActionLogs(serverNotes.actionLogs);
                }
                // Update UI status with application_status returned by the API (should be 'screening_in_process')
                const newAppStatus = (respJson?.application_status || '').toString() || 'screening_in_process';
                setApplication((prev) => prev ? { ...prev, status: newAppStatus } as any : prev);
                setSelectedStatus(newAppStatus as any);
              } catch {}

              // Update the snapshot to the newly submitted notes
              setInitialNotesSnapshot({ ...screeningNotes });

              router.push('/screenings');
            } else {
              // If not submitting notes now, just add a simple close log
              const closeLogResp = await fetch(`/api/screenings/${params.id}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action_log_message: `marked applicant as "${reasonLabel}"` })
              });
              if (closeLogResp.ok) {
                try {
                  const respJson = await closeLogResp.json();
                  const serverNotes = respJson?.data?.notes;
                  if (serverNotes && Array.isArray(serverNotes.actionLogs)) {
                    setActionLogs(serverNotes.actionLogs);
                  }
                } catch {}
              }
            }
          } catch (error) {
            setError(error instanceof Error ? error.message : 'An error occurred updating the status');
          } finally {
            setUpdating(false);
            setPendingStatus(null);
            setPendingClosedReason('');
            setPendingSubmitAfterReason(false);
            setSaving(false);
          }
        }}
      />
    </div>
  );
}
