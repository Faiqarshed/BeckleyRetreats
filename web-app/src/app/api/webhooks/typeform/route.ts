import {applicationService} from '@/services/applicationService';
import {scoringService} from '@/services/scoringService';
import HubSpotService from '@/services/hubspotService';
import {Application, TypeformWebhook} from '@/types/application';
import {createClient} from '@supabase/supabase-js';
import crypto from 'crypto';
import {NextRequest, NextResponse} from 'next/server';


// Initialize Supabase client with service role for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * Verify Typeform webhook signature for authentication
 * @param request The incoming request
 * @returns Boolean indicating if the signature is valid
 */
const verifyTypeformWebhook = (request: NextRequest): boolean => {
  try {
    // For initial implementation, validation is simplified
    // In production, implement proper signature verification with your webhook secret
    // https://developer.typeform.com/webhooks/secure-your-webhooks/

    const signature = request.headers.get('typeform-signature');

    // If signature validation is not set up yet, accept the webhook
    if (!process.env.TYPEFORM_WEBHOOK_SECRET || !signature) {
      console.warn('Typeform webhook signature verification not configured');
      return true;
    }

    // Implementation would validate the signature against the request body
    // using HMAC SHA256 and the webhook secret

    return true; // Todo: implement actual verification
  } catch (error) {
    console.error('Error verifying Typeform webhook signature:', error);
    return false;
  }
}

// Removed processAnswersAndScoreAsync; we will process inline below

/**
 * Typeform webhook endpoint to receive form submissions
 */
export async function POST(req: NextRequest) {
  try {
    // Verify webhook authenticity
    if (!verifyTypeformWebhook(req)) {
      console.error('Invalid Typeform webhook signature');
      return NextResponse.json(
        {error: 'Invalid webhook signature'},
        {status: 401}
      );
    }

    // Generate a unique tracking ID for this processing instance this is used for locking intents alone.
    const processTrackingId = crypto.randomUUID();

    // Parse the webhook data
    const data: TypeformWebhook = await req.json();

    const token = data.form_response.token;
    const lockId = `typeform_${token}`;

    // Request Validations to ensure smoother processing.
    if (!token) {
      console.error(`Webhook ${processTrackingId} missing token, cannot process`);
      return;
    }

    // Log the webhook receipt (excluding full data for brevity)
    console.log(`Received Typeform webhook: event_type=${data.event_type}`);
    if (data.form_response) {
      console.log(`Form ID: ${data.form_response.form_id}, Response Token: ${data.form_response.token}`);
    }

    // Only process form_response events
    if (data.event_type !== 'form_response') {
      return NextResponse.json({
        status: 'ignored',
        message: 'Event type is not form_response'
      });
    }

    // Validate form_response data
    if (!data.form_response || !data.form_response.form_id) {
      console.error('Invalid webhook data: missing form_response or form_id');
      return NextResponse.json(
        {error: 'Invalid webhook data: missing required fields'},
        {status: 400}
      );
    }

    // Check if this submission was already processed to prevent duplicates
    try {
      // Don't call our own API, check for duplicates directly with Supabase
      console.log(`Checking for duplicate submission with token: ${token}`);

      // Query applications table directly to check for duplicates
      const {data: existingApp, error} = await supabaseAdmin
        .from('applications')
        .select('id')
        .eq('typeform_response_id', token)
        .single();

      if (existingApp && !error) {
        console.log(`Duplicate submission detected for token ${token}, application ID ${existingApp.id}. Continuing to scoring and HubSpot sync.`);
      }
    } catch (checkError) {
      // If error checking for duplicates, continue processing but log the error
      console.warn(`Error checking for duplicate submission: ${checkError}`);
    }

    // Process the webhook data
    let lockAcquired = false;
    try {
      console.log(`Starting processing of webhook ${processTrackingId} for form response ${token}`);
      // Calculate processing time for monitoring
      const processingStartTime = Date.now();
      const {isDuplicate, application} = await applicationService.createApplicationFromWebhookData(data);
      const processingTimeMs = Date.now() - processingStartTime;

      if (isDuplicate) {
        console.log(`Duplicate application detected for token ${token}, application ID: ${application.id}`);
        // The notification has already been created by the applicationService
      } else {
        console.log(`Successfully ingested webhook ${processTrackingId}, application ID: ${application.id}, Typeform Response ID: ${application.typeform_response_id} in ${processingTimeMs}ms`);
      }


      // If this is a duplicate and already fully processed and scored, short-circuit and exit early
      try {
        if (isDuplicate) {
          const { data: processedRow } = await supabaseAdmin
            .from('applications')
            .select('application_data, calculated_score')
            .eq('id', application.id)
            .maybeSingle();
          const answersProcessed = !!processedRow?.application_data?.answers_processed;
          const hasScore = processedRow?.calculated_score != null;
          if (answersProcessed && hasScore) {
            console.log(`[Typeform Webhook] Duplicate and already processed/scored. Skipping reprocessing for application ${application.id}.`);
            return NextResponse.json({
              status: 'ignored',
              message: 'Application already processed and scored',
              tracking_id: processTrackingId,
              application_id: application.id,
            }, { status: 202 });
          }
        }
      } catch (e) {
        console.warn(`[Typeform Webhook] Failed to evaluate already-processed state for ${application.id}. Proceeding.`, e);
      }

      // Create a processing lock in the database
      lockAcquired = await acquireProcessingLock(lockId, processTrackingId);
      if (!lockAcquired) {
        console.warn(`Webhook ${processTrackingId} for token ${token}: lock not acquired (already processing). Skipping processing.`);
        return NextResponse.json({
          status: 'ignored',
          message: 'Another worker is processing this submission',
          tracking_id: processTrackingId,
          token
        }, { status: 202 });
      }

      // Decide whether to process answers (skip if field responses already exist)
      let shouldProcessAnswers = true;
      try {
        const { count: existingResponses } = await supabaseAdmin
          .from('application_field_responses')
          .select('id', { count: 'exact', head: true })
          .eq('application_id', application.id);
        if ((existingResponses || 0) > 0) {
          shouldProcessAnswers = false;
          console.log(`[Typeform Webhook] Detected ${existingResponses} existing field responses for application ${application.id}. Skipping re-processing.`);
        }
      } catch (e) {
        console.warn(`[Typeform Webhook] Failed to check existing field responses for ${application.id}. Will attempt processing once.`, e);
      }

      if (shouldProcessAnswers) {
        // Process answers inline (reliable) with a retry
        try {
          await applicationService.processAnswersForApplication(application);
          console.log(`[Typeform Webhook] Answers processed for application ${application.id}, proceeding to scoring.`);
        } catch (e) {
          console.error(`[Typeform Webhook] processAnswers failed once for ${application.id}, retrying...`, e);
          await new Promise(res => setTimeout(res, 750));
          await applicationService.processAnswersForApplication(application);
          console.log(`[Typeform Webhook] processAnswers retry succeeded for ${application.id}.`);
        }
      } else {
        console.log(`[Typeform Webhook] Skipping answers processing and proceeding directly to scoring for application ${application.id}.`);
      }

      // Score inline with a retry
      let scoreResult: { totalScore: number } = { totalScore: 0 };
      let shouldScore = true;
      try {
        // If we did not process answers just now, check if a score already exists; if yes, skip scoring
        if (!shouldProcessAnswers) {
          const { data: scoreRow } = await supabaseAdmin
            .from('applications')
            .select('calculated_score')
            .eq('id', application.id)
            .maybeSingle();
          if (scoreRow?.calculated_score != null) {
            shouldScore = false;
            console.log(`[Typeform Webhook] Existing score detected for application ${application.id}. Skipping scoring.`);
          }
        }
      } catch (e) {
        console.warn(`[Typeform Webhook] Failed to check existing score for ${application.id}. Will attempt scoring.`, e);
      }

      if (shouldScore) {
        try {
          scoreResult = await scoringService.calculateApplicationScore(application.id);
        } catch (e) {
          console.error(`[Typeform Webhook] calculateApplicationScore failed once for ${application.id}, retrying...`, e);
          await new Promise(res => setTimeout(res, 750));
          scoreResult = await scoringService.calculateApplicationScore(application.id);
          console.log(`[Typeform Webhook] scoring retry succeeded for ${application.id}.`);
        }
      } else {
        console.log(`[Typeform Webhook] Using existing score; no scoring performed for application ${application.id}.`);
      }

      console.log(`[Typeform Webhook] Completed processing and scoring. Application ${application.id}, Score: ${scoreResult.totalScore}`);

      // Return success response (after HubSpot sync)
      return NextResponse.json({
        status: 'success',
        message: 'Webhook processed successfully',
        tracking_id: processTrackingId,
        application_id: application.id,
        score: scoreResult.totalScore,
      });

    } catch (error) {
      // Log errors but don't propagate them to the response
      console.error(`Error in async processing of webhook ${processTrackingId}:`, error);
    } finally {
      // Always release the processing lock when done, regardless of success or failure
      try {
        if (lockAcquired) {
          await supabaseAdmin
            .from('processing_locks')
            .delete()
            .eq('lock_id', lockId);
        }
      } catch (err) {
        console.warn(`Error releasing processing lock ${lockId}:`, err);
      }
    }
  } catch (error) {
    // Log and return error
    console.error('Error processing Typeform webhook:', error);

    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      {status: 500}
    );
  }
}


/**
 * Acquire a processing lock to prevent duplicate webhook processing
 */
async function acquireProcessingLock(lockId: string, trackingId: string): Promise<boolean> {
  try {
    // Check if a lock already exists
    const {data: existingLock} = await supabaseAdmin
      .from('processing_locks')
      .select('*')
      .eq('lock_id', lockId)
      .single();

    if (existingLock) {
      // Lock exists, check if it's stale (older than 5 minutes)
      const lockTimestamp = new Date(existingLock.created_at).getTime();
      const now = Date.now();
      const lockAgeMs = now - lockTimestamp;

      // If lock is older than 5 minutes, consider it stale and override
      if (lockAgeMs > 5 * 60 * 1000) {
        console.warn(`Found stale lock for ${lockId}, overriding`);
        await supabaseAdmin
          .from('processing_locks')
          .update({
            tracking_id: trackingId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('lock_id', lockId);

        return true;
      }

      // Lock is still valid, cannot acquire
      return false;
    }

    // No existing lock, create a new one
    const {error} = await supabaseAdmin
      .from('processing_locks')
      .insert({
        lock_id: lockId,
        tracking_id: trackingId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (error) {
      // If we get a unique constraint error, another process just created the lock
      if (error.code === '23505') { // PostgreSQL unique violation error
        return false;
      }

      console.error(`Error creating processing lock: ${error.message}`);
      // In case of other errors, proceed with processing (fail open)
      return true;
    }

    return true;
  } catch (error) {
    console.error(`Error acquiring processing lock: ${error}`);
    // In case of errors, proceed with processing (fail open)
    return true;
  }
}
//
// /**
//  * Release a processing lock after completion
//  */
// async function releaseProcessingLock(lockId: string): Promise<void> {
//   try {
//     await supabaseAdmin
//       .from('processing_locks')
//       .delete()
//       .eq('lock_id', lockId);
//   } catch (error) {
//     console.error(`Error releasing processing lock: ${error}`);
//     // Non-critical error, just log it
//   }
//
// }
