import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { ScreeningNoteValues } from '@/types/application';
import HubSpotService from '@/services/hubspotService';

export async function POST(req: Request, context: { params: { id: string } }): Promise<NextResponse> {
  // Extract application ID by properly awaiting params
  const { id: applicationId } = await context.params;
  
  // Get cookie store - must be awaited for Next.js App Router
  const cookieStore = await cookies();
  
  // Initialize Supabase with direct cookie handling for user authentication
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.delete({ name, ...options });
        },
      },
    }
  );
  
  // Create admin client with service role for bypassing RLS
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('Error authenticating user:', authError);
      return NextResponse.json(
        { error: 'Authentication failed. Please log in.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { screening_notes, submitted, action_log_message, application_status, note_role } = (body || {}) as {
      screening_notes?: ScreeningNoteValues;
      submitted?: boolean;
      action_log_message?: string;
      application_status?: string;
      note_role?: string;
    };

    if (!applicationId) {
      return NextResponse.json(
        { error: 'Application ID is required.' },
        { status: 400 }
      );
    }

    if (!screening_notes && !action_log_message && !submitted) {
      return NextResponse.json(
        { error: 'Nothing to update. Provide screening_notes, submitted, or action_log_message.' },
        { status: 400 }
      );
    }

    // Fetch the participant_id from the applications table using admin client to bypass RLS
    const { data: applicationData, error: appFetchError } = await supabaseAdmin
      .from('applications')
      .select('participant_id, status')
      .eq('id', applicationId)
      .maybeSingle();

    if (appFetchError && appFetchError.code !== 'PGRST116') {
      console.error(`Error fetching application ${applicationId}:`, appFetchError);
      return NextResponse.json(
        { error: `Failed to fetch application data: ${appFetchError.message}` },
        { status: 500 }
      );
    }

    if (!applicationData) {
      console.error(`Application with ID ${applicationId} not found.`);
      return NextResponse.json(
        { error: `Application with ID ${applicationId} not found in the database.` },
        { status: 404 }
      );
    }

    const participantId = applicationData.participant_id;
    let currentApplicationStatus = applicationData.status;

    // Prepare data for upsert into screenings table
    console.log('Preparing screening data for upsert with applicationId:', applicationId, 'participant:', participantId, 'submitted:', submitted);
    
    // Fetch existing screening (to merge notes/action logs)
    const { data: existingScreeningRecord, error: existingScreeningError } = await supabaseAdmin
      .from('screenings')
      .select('id, created_at, notes, status')
      .eq('application_id', applicationId)
      .eq('screening_type', 'initial')
      .maybeSingle();

    if (existingScreeningError && existingScreeningError.code !== 'PGRST116') {
      console.error('Error checking for existing screening:', existingScreeningError);
    }

    const existingNotes = (existingScreeningRecord?.notes as any) || {};

    // Build merged notes
    let mergedNotes: any = { ...(existingNotes || {}) };
    const providedRole = (typeof note_role === 'string' && note_role.trim()) ? note_role.trim() : undefined;
    // Build a composite role key so multiple users in the same role don't overwrite each other
    // Example: SCREENER:uuid, ADMIN:uuid, FACILITATOR:uuid
    const roleKey = (() => {
      const baseRole = providedRole || (user.user_metadata?.role || '').toString().trim() || 'SCREENER';
      const userId = user.id;
      return `${baseRole}:${userId}`;
    })();
    if (screening_notes && typeof screening_notes === 'object') {
      // Sanitize incoming notes to avoid circular references (strip nested roles if present)
      const { roles: _ignoredRoles, ...flatNotes } = screening_notes as any;
      // Backward-compatible: keep flattened fields without nested roles
      mergedNotes = { ...mergedNotes, ...flatNotes };
      // Role-based storage under notes.roles[role]
      if (roleKey) {
        const roles = (mergedNotes.roles && typeof mergedNotes.roles === 'object') ? mergedNotes.roles : {};
        // Only create/update draft if user actually entered content
        const hasAnyContent = Object.values(flatNotes || {}).some((v: any) => (typeof v === 'string' && v.trim().length > 0)) || (!!(flatNotes as any)?.scholarshipNeeded === true);
        if (hasAnyContent || submitted) {
          roles[roleKey] = {
            ...flatNotes,
            submitted: !!submitted,
            updated_at: new Date().toISOString(),
            submitted_by: user.id,
          };
        }
        // Prune other draft entries by the same user to avoid duplicate drafts
        try {
          for (const k of Object.keys(roles)) {
            if (k !== roleKey) {
              const entry = roles[k];
              if (entry && entry.submitted !== true && entry.submitted_by === user.id) {
                delete roles[k];
              }
            }
          }
        } catch {}
        mergedNotes.roles = roles;
      }
    }
    const notesChanged = JSON.stringify(existingNotes || {}) !== JSON.stringify(mergedNotes || {});

    // Append or merge action log if requested
    if (action_log_message && typeof action_log_message === 'string' && action_log_message.trim().length > 0) {
      // Fetch screener name
      let screenerDisplayName = 'Unknown User';
      const { data: profile, error: profileErr } = await supabaseAdmin
        .from('user_profiles')
        .select('first_name, last_name')
        .eq('id', user.id)
        .maybeSingle();
      if (!profileErr && profile) {
        const first = (profile.first_name || '').trim();
        const last = (profile.last_name || '').trim();
        screenerDisplayName = [first, last].filter(Boolean).join(' ') || screenerDisplayName;
      }

      // Build ET timestamp like 5:10pm ET - 08 July 2025
      const now = new Date();
      const etTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'America/New_York' })
        .toLowerCase()
        .replace(' ', '') // e.g., 5:10pm
      ;
      const etDate = now.toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/New_York' });
      const actionLine = `${screenerDisplayName} ${action_log_message} at ${etTime} ET - ${etDate}`;

      const currentLogs: string[] = Array.isArray(mergedNotes.actionLogs) ? mergedNotes.actionLogs : [];
      const isSubmitOrEditOnly = /^(submitted|edited) screening notes$/i.test(action_log_message.trim());
      const lastLog = currentLogs.length > 0 ? currentLogs[currentLogs.length - 1] : undefined;
      const lastLooksLikeStatusChange = !!lastLog && lastLog.includes(' marked applicant as "') && !/ (submitted|edited) screening notes /i.test(lastLog);

      if (isSubmitOrEditOnly && lastLooksLikeStatusChange) {
        const atIdx = lastLog.toLowerCase().lastIndexOf(' at ');
        const base = atIdx > -1 ? lastLog.substring(0, atIdx) : lastLog;
        const mergedLine = `${base} and ${action_log_message} at ${etTime} ET - ${etDate}`;
        mergedNotes.actionLogs = [...currentLogs.slice(0, -1), mergedLine];
      } else {
        mergedNotes.actionLogs = [...currentLogs, actionLine];
      }

      // Mirror to applications.application_data.actionLogs ONLY for initial, non-submitted logs
      if (!submitted) {
        try {
          // If there's no existing screening record or no existing notes logs, treat as initial
          const isInitial = !existingScreeningRecord?.id || currentLogs.length === 0;
          if (isInitial) {
            const { data: appDataRow, error: appDataErr } = await supabaseAdmin
              .from('applications')
              .select('application_data')
              .eq('id', applicationId)
              .maybeSingle();
            if (!appDataErr && appDataRow) {
              const appData = (appDataRow.application_data || {}) as any;
              const appLogs: string[] = Array.isArray(appData.actionLogs) ? appData.actionLogs : [];
              // Deduplicate
              const newLogs = appLogs.includes(actionLine) ? appLogs : [...appLogs, actionLine];
              const newAppData = { ...appData, actionLogs: newLogs };
              await supabaseAdmin
                .from('applications')
                .update({ application_data: newAppData, updated_at: new Date().toISOString() })
                .eq('id', applicationId);
            }
          }
        } catch (logCopyErr) {
          console.warn('Non-blocking: failed to mirror action log to application_data:', logCopyErr);
        }
      }
    }
    
    // Only use fields that definitely exist in the database schema
    // Base screening data to upsert
    const screeningDataToUpsert: any = {
      application_id: applicationId,
      participant_id: participantId,
      screener_id: user.id,
      notes: mergedNotes,
      screening_type: 'initial',
      // Ensure NOT NULL status: keep existing; else use application status for drafts; use screening_in_process on submit
      status: existingScreeningRecord?.status ?? (submitted ? 'screening_in_process' : (currentApplicationStatus || 'new')),
      updated_at: new Date().toISOString()
    };
    
    // Only update status if we're submitting the form
    if (submitted) {
      screeningDataToUpsert.status = 'screening_in_process';
    }
    // When just saving (not submitting), leave the status as is
    
    let screeningUpsertData;
    let screeningUpsertError;
    
    // Use update if record exists, insert if it doesn't
    if (existingScreeningRecord?.id) {
      console.log('Updating existing screening record with ID:', existingScreeningRecord.id);
      const { data, error } = await supabaseAdmin
        .from('screenings')
        .update(screeningDataToUpsert)
        .eq('id', existingScreeningRecord.id)
        .select()
        .single();
        
      screeningUpsertData = data;
      screeningUpsertError = error;
    } else {
      console.log('Creating new screening record');
      // Add created_at for new records
      screeningDataToUpsert.created_at = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from('screenings')
        .insert(screeningDataToUpsert)
        .select()
        .single();
        
      screeningUpsertData = data;
      screeningUpsertError = error;
    }

    if (screeningUpsertError) {
      console.error('Error upserting screening notes:', screeningUpsertError);
      return NextResponse.json(
        { error: `Failed to save screening notes: ${screeningUpsertError.message}` },
        { status: 500 }
      );
    }

    // If submitting, merge any mirrored app_data.actionLogs into notes and clear them to avoid duplicates
    if (submitted) {
      try {
        const { data: appDataRow } = await supabaseAdmin
          .from('applications')
          .select('application_data')
          .eq('id', applicationId)
          .maybeSingle();
        const appLogs: string[] = Array.isArray((appDataRow?.application_data as any)?.actionLogs)
          ? (appDataRow!.application_data as any).actionLogs
          : [];
        if (appLogs.length > 0) {
          // Merge app logs with existing notes logs and sort by embedded timestamp
          const notesLogs: string[] = Array.isArray((screeningUpsertData?.notes as any)?.actionLogs)
            ? (screeningUpsertData.notes as any).actionLogs
            : [];
          const allLogs = [...notesLogs, ...appLogs];
          const parseLogDate = (log: string): number => {
            const match = log.match(/ at (\d{1,2}):(\d{2})(?::(\d{2}))?(am|pm) ET - (\d{2}) ([A-Za-z]+) (\d{4})$/i);
            if (!match) return 0;
            let [, hh, mm, ssOpt, ampm, dd, mon, yyyy] = match;
            const monthIndex: Record<string, number> = { January:0, February:1, March:2, April:3, May:4, June:5, July:6, August:7, September:8, October:9, November:10, December:11 };
            let hour = parseInt(hh, 10);
            const minute = parseInt(mm, 10);
            const second = ssOpt ? parseInt(ssOpt, 10) : 0;
            const day = parseInt(dd, 10);
            const year = parseInt(yyyy, 10);
            const month = monthIndex[mon] ?? 0;
            if (ampm.toLowerCase() === 'pm' && hour !== 12) hour += 12;
            if (ampm.toLowerCase() === 'am' && hour === 12) hour = 0;
            return new Date(year, month, day, hour, minute, second, 0).getTime();
          };
          const mergedArr = allLogs
            .slice()
            .sort((a, b) => parseLogDate(a) - parseLogDate(b))
            .filter((log, idx, arr) => arr.indexOf(log) === idx);
          const { data: upd, error: updErr } = await supabaseAdmin
            .from('screenings')
            .update({ notes: { ...(screeningUpsertData?.notes || {}), actionLogs: mergedArr }, updated_at: new Date().toISOString() })
            .eq('id', screeningUpsertData.id)
            .select()
            .single();
          if (!updErr) {
            screeningUpsertData = upd;
          }
          // Clear mirrored app logs
          const newAppData = { ...((appDataRow?.application_data as any) || {}), actionLogs: [] };
          await supabaseAdmin
            .from('applications')
            .update({ application_data: newAppData, updated_at: new Date().toISOString() })
            .eq('id', applicationId);
        }
      } catch (mergeErr) {
        console.warn('Non-blocking: failed to merge mirrored app logs on submit:', mergeErr);
      }
    }

    // (moved) HubSpot sync will run after DB status persistence below so it sees latest status

    // Persist application status on submit
    try {
      if (submitted) {
        // On submit, set DB status to 'screening_in_process' regardless of UI 'closed'
        const { error: appStatusError } = await supabaseAdmin
          .from('applications')
          .update({ status: 'screening_in_process', updated_at: new Date().toISOString() })
          .eq('id', applicationId);
        if (appStatusError) {
          console.error('Failed to persist screening_in_process status from notes submit:', appStatusError);
        } else {
          currentApplicationStatus = 'screening_in_process';
        }
      } else if (application_status && typeof application_status === 'string') {
        // Non-submit flows can still propagate an explicit application_status
        const { error: appStatusError } = await supabaseAdmin
          .from('applications')
          .update({ status: application_status, updated_at: new Date().toISOString() })
          .eq('id', applicationId);
        if (appStatusError) {
          console.error('Failed to persist application_status from notes save:', appStatusError);
        } else {
          currentApplicationStatus = application_status;
        }
      }
    } catch (e) {
      console.error('Unexpected error updating application_status from notes route:', e);
    }

    // Only perform HubSpot sync on submit (not drafts)
    if (submitted) try {
      const hubspotTask = (async () => {
        const { data: appRow } = await supabaseAdmin
          .from('applications')
          .select('participant_id, status, closed_reason, rejected_type, red_count, yellow_count, green_count')
          .eq('id', applicationId)
          .maybeSingle();
        if (!appRow?.participant_id) return;
        const { data: participant } = await supabaseAdmin
          .from('participants')
          .select('email')
          .eq('id', appRow.participant_id)
          .maybeSingle();
        const email = participant?.email;
        if (!email) return;
        const contactId = await HubSpotService.findContactIdByEmail(email);
        if (!contactId) return;
        const dealId = await HubSpotService.findMostRecentDealIdForContact(contactId);
        if (!dealId) return;

        const mergedStatus = HubSpotService.mapStatusToClosedApplicationStatusProperty(
          appRow.status,
          appRow.closed_reason,
          appRow.rejected_type
        );

        // Curate screener notes if submitting and changed
        let curatedNotes: string | null = null;
        if (submitted && notesChanged) {
          try {
            const n = (screeningUpsertData?.notes || {}) as any;
            const textSections: Array<{ label: string; value: any }> = [
              { label: 'Initial Screening Summary', value: n.initialScreeningSummary },
              { label: 'Secondary Screening Summary', value: n.secondaryScreeningSummary },
              { label: 'Additional Information', value: n.generalNotes },
              { label: 'Desired Retreat', value: n.desiredRetreat },
              { label: 'Meds / Health History', value: n.medsHealthHistory },
              { label: 'Support System', value: n.supportSystem },
              { label: 'Intention', value: n.intention },
              { label: 'Psych History', value: n.psychHistory },
              { label: 'Psychedelic Experience', value: n.psychedelicExperience },
              { label: 'Psych Observations & Background', value: n.psychObservation },
              { label: 'Supportive Habits', value: n.supportiveHabits },
            ];
            const hasAnyText = textSections.some(s => s.value != null && String(s.value).trim().length > 0);
            const scholarshipValue = typeof n.scholarshipNeeded === 'boolean' ? (n.scholarshipNeeded ? 'Yes' : 'No') : undefined;
            if (!hasAnyText && scholarshipValue === 'No') {
              curatedNotes = 'No screener notes available yet.';
            } else {
              const parts: string[] = [];
              for (const s of textSections) {
                if (s.value != null && String(s.value).trim().length > 0) {
                  parts.push(`${s.label}:\n${String(s.value).trim()}`);
                }
              }
              if (scholarshipValue && (scholarshipValue === 'Yes' || parts.length > 0)) {
                parts.push(`Scholarship Needed:\n${scholarshipValue}`);
              }
              curatedNotes = parts.length > 0 ? parts.join('\n\n') : 'No screener notes available yet.';
            }
          } catch {}
        }

        // Update status and notes
        try {
          const props: any = {};
          if (mergedStatus) props.status = mergedStatus;
          if (submitted && notesChanged) props.notes = curatedNotes;
          if (Object.keys(props).length > 0) {
            await HubSpotService.updateApplicationProperties(dealId, props);
          }
        } catch (e: any) {
          if (e?.status === 403) console.warn('HubSpot submit update skipped (missing scopes).'); else throw e;
        }

        // Update deal stage
        const stage = HubSpotService.getStageForStatus(appRow.status, appRow.closed_reason, appRow.rejected_type);
        if (stage) {
          try {
            await HubSpotService.updateDealStage(dealId, stage.pipeline, stage.stage);
          } catch (e: any) {
            if (e?.status === 403) console.warn('HubSpot stage update skipped (missing scopes).'); else throw e;
          }
        }
      })();
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, 4000));
      await Promise.race([hubspotTask, timeout]);
    } catch (e) {
      console.warn('HubSpot sync after submit failed:', e);
    }

    return NextResponse.json({
      message: 'Screening notes processed successfully.',
      data: screeningUpsertData,
      application_status: currentApplicationStatus,
    }, { status: 200 });

  } catch (error: any) {
    console.error('Unexpected error in POST /api/screenings/[id]/notes:', error);
    return NextResponse.json(
      { error: `An unexpected error occurred: ${error.message}` },
      { status: 500 }
    );
  }
}