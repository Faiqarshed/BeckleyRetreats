import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "./supabaseAdmin";
import { applicationService } from "@/services/applicationService";

// POST /api/webhooks/calendly
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    console.log(
      "[Calendly Webhook] Payload received:",
      JSON.stringify(payload, null, 2)
    );

    // 1. Filter for event types with scheduled_event.name containing 'Application Screening'
    const eventType = payload.event;
    // Support both: Calendly V1 (top-level) and V2 (under payload)
    const eventData = payload.payload || payload;
    const scheduledEvent = eventData?.scheduled_event;
    const invitee = eventData?.invitee;
    const eventName = scheduledEvent?.name || "";

    // Robust extraction for both payload formats
    const inviteeEmail = invitee?.email || eventData?.email || null;
    const inviteeName = invitee?.name || eventData?.name || null;

    if (!eventName.includes("Application Screening")) {
      console.log(
        "[Calendly Webhook] Ignored event, not an Application Screening:",
        eventName
      );
      return NextResponse.json({ ignored: true });
    }

    // 2. Extract invitee email
    if (!inviteeEmail) {
      console.warn("[Calendly Webhook] No invitee email found, skipping.");
      return NextResponse.json({ error: "No invitee email" }, { status: 400 });
    }

    // Extract booking created time for timestamp matching
    const bookingCreatedAt = payload.created_at 
      ? new Date(payload.created_at)
      : eventData?.created_at 
        ? new Date(eventData.created_at)
        : new Date(); // Fallback to current time

    // 3. Look up participant by email
    const participantId = await getParticipantIdWithRetry(
      inviteeEmail,
      40,
      500
    );

    // 4. Look up most recent application for that participant
    let applicationId = null;
    if (participantId) {
      // Try multiple strategies to find the right application
      applicationId = await findMatchingApplication(
        participantId, 
        inviteeEmail,
        bookingCreatedAt,
        60, // Increased retries for better reliability
        500
      );
    }

    // If participant/application not ready, return 500 so Calendly retries
    if (!participantId || !applicationId) {
      console.warn(
        "[Calendly Webhook] Participant or application not ready, will retry later."
      );
      return NextResponse.json(
        { error: "Participant or application not ready" },
        { status: 500 }
      );
    }

    // 5. Prepare insert data and log mapping
    // Extract screener (host) from multiple possible locations across Calendly payload variants
    let userName: string | null = null;
    let userEmail: string | null = null;
    const extractMembership = (m: any) => {
      if (!m) return;
      if (!userName) userName = (m.user_name || m.name || null) as string | null;
      if (!userEmail) userEmail = (m.user_email || m.email || null) as string | null;
    };
    // a) V2 scheduled_event.event_memberships
    if (Array.isArray(scheduledEvent?.event_memberships)) {
      extractMembership(scheduledEvent.event_memberships.find((m: any) => m?.user_email) || scheduledEvent.event_memberships[0]);
    }
    // b) Some payloads nest under payload.event.event_memberships
    if ((!userEmail || !userName) && Array.isArray(eventData?.event?.event_memberships)) {
      extractMembership(eventData.event.event_memberships.find((m: any) => m?.user_email) || eventData.event.event_memberships[0]);
    }
    // c) Some payloads include hosts array or location details with host info
    if ((!userEmail || !userName) && Array.isArray(scheduledEvent?.hosts)) {
      extractMembership(scheduledEvent.hosts.find((h: any) => h?.email) || scheduledEvent.hosts[0]);
    }
    // d) Fallback: derive from owner/created_by fields if present (rare)
    if ((!userEmail || !userName) && scheduledEvent?.created_by) {
      const createdBy = scheduledEvent.created_by;
      if (typeof createdBy === 'object') {
        extractMembership(createdBy);
      }
    }

    const insertData = {
      calendly_event_type: eventType,
      calendly_payload: payload,
      application_id: applicationId,
      participant_id: participantId,
      invitee_email: inviteeEmail,
      invitee_name: inviteeName,
      event_start: scheduledEvent?.start_time
        ? new Date(scheduledEvent.start_time).toISOString()
        : null,
      event_end: scheduledEvent?.end_time
        ? new Date(scheduledEvent.end_time).toISOString()
        : null,
      join_url:
        eventData?.event?.location?.join_url ||
        scheduledEvent?.location?.join_url ||
        null,
      user_name: userName,
      user_email: userEmail,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    console.log("[Calendly Webhook] DB field mapping:", {
      calendly_event_type: insertData.calendly_event_type,
      application_id: insertData.application_id,
      participant_id: insertData.participant_id,
      invitee_email: insertData.invitee_email,
      invitee_name: insertData.invitee_name,
      event_start: insertData.event_start,
      event_end: insertData.event_end,
      join_url: insertData.join_url,
      user_name: insertData.user_name,
      user_email: insertData.user_email,
      created_at: insertData.created_at,
      updated_at: insertData.updated_at,
    });
    
    const { error: insertError } = await supabaseAdmin
      .from("calendly_screening_meetings")
      .insert([insertData]);
      
    if (insertError) {
      console.error("[Calendly Webhook] Error inserting meeting:", insertError);
      return NextResponse.json({ error: "DB insert error" }, { status: 500 });
    }

    // 6. Update application status to screening_scheduled so it appears in Screenings list
    try {
      await applicationService.updateApplicationStatus(applicationId, "screening_scheduled");
      console.log(`[Calendly Webhook] Updated application ${applicationId} status to screening_scheduled`);
      
      // Store HubSpot hints so post-scoring HubSpot sync can mirror UI immediately
      try {
        const { data: current } = await supabaseAdmin
          .from('applications')
          .select('application_data')
          .eq('id', applicationId)
          .maybeSingle();
          
        const appData = (current?.application_data || {}) as any;
        const screenerHint = (userName || '').trim() || null;
        const newData = { 
          ...appData, 
          hubspot_status_hint: 'screening_scheduled',
          ...(screenerHint ? { hubspot_screener_hint: screenerHint } : {})
        };
        
        await supabaseAdmin
          .from('applications')
          .update({ application_data: newData, updated_at: new Date().toISOString() })
          .eq('id', applicationId);
          
        console.log('[Calendly Webhook] Saved hubspot_status_hint=screening_scheduled', screenerHint ? 'and hubspot_screener_hint' : '');
      } catch (hintErr) {
        console.warn('[Calendly Webhook] Non-blocking: failed saving hubspot_status_hint:', hintErr);
      }
    } catch (statusError) {
      console.error(`[Calendly Webhook] Failed to update application status:`, statusError);
      // Don't fail the webhook if status update fails - the meeting was still created
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Calendly Webhook] Error processing payload:", error);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
}

// Helper function to find the matching application using multiple strategies
async function findMatchingApplication(
  participantId: string,
  email: string,
  bookingCreatedAt: Date,
  retries: number,
  delay: number
): Promise<string | null> {
  for (let i = 0; i < retries; i++) {
    console.log(`[Calendly] Attempt ${i + 1}/${retries}: Looking for application...`);

    // Strategy 1: Find application without a screening meeting (most reliable)
    const appWithoutMeeting = await getApplicationWithoutMeeting(participantId);
    if (appWithoutMeeting) {
      console.log(`[Calendly] ✓ Found application ${appWithoutMeeting} without existing meeting`);
      return appWithoutMeeting;
    }

    // Strategy 2: Find application created around the same time as booking (within 10 minutes)
    const appByTimestamp = await getApplicationByTimestamp(participantId, bookingCreatedAt);
    if (appByTimestamp) {
      console.log(`[Calendly] ✓ Found application ${appByTimestamp} by timestamp matching`);
      return appByTimestamp;
    }

    // Strategy 3: Get the most recent application as fallback
    const latestApp = await getLatestApplication(participantId);
    if (latestApp) {
      console.log(`[Calendly] ✓ Using most recent application ${latestApp} as fallback`);
      return latestApp;
    }

    // Wait before next retry
    if (i < retries - 1) {
      console.log(`[Calendly] No application found, waiting ${delay}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  console.warn(
    `[Calendly] ✗ Application not found after ${retries} retries for participant: ${participantId}`
  );
  return null;
}

// Get application that doesn't have a screening meeting yet
async function getApplicationWithoutMeeting(
  participantId: string
): Promise<string | null> {
  try {
    // Get recent applications
    const { data: apps, error } = await supabaseAdmin
      .from("applications")
      .select("id, created_at")
      .eq("participant_id", participantId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      console.error("[Calendly] Error fetching applications:", error);
      return null;
    }

    if (!apps || apps.length === 0) {
      return null;
    }

    // Check each application for existing screening meetings
    for (const app of apps) {
      const { data: meetings, error: meetingError } = await supabaseAdmin
        .from("calendly_screening_meetings")
        .select("id")
        .eq("application_id", app.id)
        .limit(1);

      if (meetingError) {
        console.error("[Calendly] Error checking meetings:", meetingError);
        continue;
      }

      // If no meeting exists for this application, use it
      if (!meetings || meetings.length === 0) {
        return app.id;
      }
    }

    return null;
  } catch (error) {
    console.error("[Calendly] Error in getApplicationWithoutMeeting:", error);
    return null;
  }
}

// Get application created around the same time as the booking
async function getApplicationByTimestamp(
  participantId: string,
  bookingCreatedAt: Date
): Promise<string | null> {
  try {
    const { data: apps, error } = await supabaseAdmin
      .from("applications")
      .select("id, created_at")
      .eq("participant_id", participantId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error || !apps || apps.length === 0) {
      return null;
    }

    // Find app created within 10 minutes of booking
    const tenMinutesMs = 10 * 60 * 1000;
    const bookingMs = bookingCreatedAt.getTime();

    const matchingApp = apps.find(app => {
      const appMs = new Date(app.created_at).getTime();
      const diff = Math.abs(appMs - bookingMs);
      return diff < tenMinutesMs;
    });

    return matchingApp ? matchingApp.id : null;
  } catch (error) {
    console.error("[Calendly] Error in getApplicationByTimestamp:", error);
    return null;
  }
}

// Get the most recent application (fallback)
async function getLatestApplication(
  participantId: string
): Promise<string | null> {
  try {
    const { data: app, error } = await supabaseAdmin
      .from("applications")
      .select("id")
      .eq("participant_id", participantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[Calendly] Error fetching latest application:", error);
      return null;
    }

    return app?.id || null;
  } catch (error) {
    console.error("[Calendly] Error in getLatestApplication:", error);
    return null;
  }
}

// Get participant ID with retry logic
async function getParticipantIdWithRetry(
  email: string,
  retries: number,
  delay: number
): Promise<string | null> {
  for (let i = 0; i < retries; i++) {
    const { data: participant, error } = await supabaseAdmin
      .from("participants")
      .select("id")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(`[Calendly] Error fetching participant (attempt ${i + 1}):`, error);
    }

    if (participant) {
      console.log(`[Calendly] ✓ Found participant ${participant.id} for email ${email}`);
      return participant.id;
    }

    if (i < retries - 1) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  console.warn(
    `[Calendly] ✗ Participant not found after ${retries} retries for email: ${email}`
  );
  return null;
}