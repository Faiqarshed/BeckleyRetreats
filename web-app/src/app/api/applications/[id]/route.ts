import { NextRequest, NextResponse } from 'next/server';
import { applicationService } from '@/services/applicationService';
import HubSpotService from '@/services/hubspotService';
import { createAdminClient } from '@/lib/server-auth';
import { validateAdminRole } from '@/lib/server-auth';
import { ApplicationStatus } from '@/types/application';

/**
 * GET handler to retrieve a single application by ID
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Validate admin or screener access
    const authResult = await validateAdminRole();
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the ID from params (awaiting the params Promise)
    const { id } = await params;

    // Get application details
    const application = await applicationService.getApplicationById(id);

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }
    
    // Add some debugging statistics for field responses
    const responseStats = {
      totalResponses: application.field_responses?.length || 0,
      responsesWithField: application.field_responses?.filter((r: any) => r.field && r.field.field_title).length || 0,
      responsesWithDisplay: application.field_responses?.filter((r: any) => r.display_value !== r.response_value).length || 0
    };
    console.log('Application response stats:', responseStats);

    return NextResponse.json({ application });
  } catch (error) {
    console.error(`Error getting application:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH handler to update application status
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    console.log('PATCH request received for application status update');
    
    // Validate admin or screener access
    const authResult = await validateAdminRole();
    if (!authResult.success) {
      console.log('Authorization failed for status update');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the ID from params (awaiting the params Promise)
    const { id } = await params;
    
    // Parse request body
    const data = await req.json();
    // Normalize screener assignment field from client
    const normalizedAssignedTo = data.assigned_screener_id || data.assignedTo || undefined;
    
    // Add timestamp and detailed logging for status updates
    console.log(`[${new Date().toISOString()}] PATCH REQUEST: Updating application ${id} with data:`, JSON.stringify(data, null, 2));
  
    // Validate required fields
    if (!data.status) {
      console.log('Status field missing in update request');
      return NextResponse.json(
        { error: 'Status is required' },
        { status: 400 }
      );
    }

    // Validate status value
    const validStatuses: ApplicationStatus[] = [
      'pending',
      'new',
      'screening_scheduled',
      'screening_no_show',
      'invited_to_reschedule',
      'secondary_screening',
      'medical_review_required',
      'conditionally_approved',
      'screening_in_process',
      'closed'
    ];
    
    console.log(`Validating status value: "${data.status}"`);
    console.log(`Valid statuses:`, validStatuses);
    
    // Convert to string to ensure proper comparison if status is coming as a different type
    const statusString = String(data.status);
    
    if (!validStatuses.includes(statusString as ApplicationStatus)) {
      console.error(`[${new Date().toISOString()}] ERROR: Invalid status value: ${statusString}`);
      return NextResponse.json(
        { error: `Invalid status value: ${statusString}` },
        { status: 400 }
      );
    }
    
    console.log(`Status validation passed: "${statusString}" is valid`);

    try {
      // Update application status
      console.log(`Calling applicationService.updateApplicationStatus with status: ${statusString}`);
      // If closing, include closed_reason
      if (statusString === 'closed' && data.closed_reason) {
        await applicationService.updateApplicationStatus(
          id,
          statusString as ApplicationStatus,
          normalizedAssignedTo,
          data.closed_reason,
          data.rejected_type
        );
      } else {
        await applicationService.updateApplicationStatus(
          id,
          statusString as ApplicationStatus,
          normalizedAssignedTo
        );
      }
      console.log('Application status updated successfully in database');

      // Synchronous (awaited) HubSpot sync with short timeout for Vercel reliability
      try {
        const hubspotTask = (async () => {
          const admin = createAdminClient();
          const { data: appRow } = await admin
            .from('applications')
            .select('participant_id, status, closed_reason, rejected_type')
            .eq('id', id)
            .maybeSingle();
          if (!appRow?.participant_id) return;
          const { data: participant } = await admin
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
          console.log('[HubSpot] Merged application_status (status change):', mergedStatus, 'from DB fields:', {
            status: appRow.status,
            closed_reason: appRow.closed_reason,
            rejected_type: appRow.rejected_type,
          });
          if (mergedStatus) {
            try {
              await HubSpotService.updateApplicationProperties(dealId, { status: mergedStatus });
            } catch (e: any) {
              if (e?.status === 403) console.warn('HubSpot status update skipped (missing scopes).'); else throw e;
            }
          }
          const stage = HubSpotService.getStageForStatus(appRow.status, appRow.closed_reason, appRow.rejected_type);
          console.log('[HubSpot] Computed stage for status change:', stage, 'from DB fields:', {
            status: appRow.status,
            closed_reason: appRow.closed_reason,
            rejected_type: appRow.rejected_type,
          });
          if (stage) {
            try {
              console.log('[HubSpot] Updating deal stage (status change):', stage, 'for dealId:', dealId);
              await HubSpotService.updateDealStage(dealId, stage.pipeline, stage.stage);
              console.log('[HubSpot] Deal stage update successful');
            } catch (e: any) {
              console.error('[HubSpot] Deal stage update failed:', e);
              if (e?.status === 403) console.warn('HubSpot stage update skipped (missing scopes).'); else throw e;
            }
          } else {
            console.log('[HubSpot] No stage mapping found for status:', appRow.status);
          }
        })();
        // Cap the HubSpot sync to ~4 seconds to keep API snappy
        const timeout = new Promise<void>((resolve) => setTimeout(resolve, 4000));
        await Promise.race([hubspotTask, timeout]);
      } catch (e) {
        console.warn('HubSpot sync (status change) encountered an error:', e);
      }

      return NextResponse.json({ success: true, status: statusString });
    } catch (updateError) {
      console.error('Error in applicationService.updateApplicationStatus:', updateError);
      return NextResponse.json(
        { error: updateError instanceof Error ? updateError.message : 'Error updating application status in database' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error(`Error updating application:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
