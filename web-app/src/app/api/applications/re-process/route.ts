import {checkCronAuth} from '@/middleware/cronAuth';
import {applicationService} from '@/services/applicationService';
import {scoringService} from "@/services/scoringService";
import {SavedTypeFormApplication} from "@/types/application";
import {createClient} from "@supabase/supabase-js";
import {NextRequest, NextResponse} from 'next/server';


// Initialize Supabase client with service role for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * POST handler to try and re-process an application
 */
export async function POST(req: NextRequest) {
  // Use middleware for CRON_SECURE_KEY auth
  const authResult = checkCronAuth(req);
  if (authResult) return authResult;

  try {
    const applicationRequest: SavedTypeFormApplication = await req.json();

    // Check for existing application with this token
    const existingApplication = await applicationService.findApplicationByToken(applicationRequest.typeform_response_id);

    if (!existingApplication) {
      console.log(`No existing application found for token: ${applicationRequest.typeform_response_id}`);
      return NextResponse.json(
        {message: 'No existing application found'},
        {status: 404, statusText: 'No existing application found'}
      );
    }

    console.log(`Found existing application with ID: ${existingApplication.id} for token: ${applicationRequest.typeform_response_id}. Will continue processing.`);

    try {
      await applicationService.processAnswersForApplication(existingApplication);
      console.log(`Re-processed application ${applicationRequest.typeform_response_id} answers, now continuing with scoring.`);
    } catch (e) {
      console.error(`[Reprocess] processAnswers failed once, retrying...`, e);
      await new Promise(res => setTimeout(res, 1000));
      await applicationService.processAnswersForApplication(existingApplication);
      console.log(`[Reprocess] processAnswers retry succeeded.`);
    }

    let result;
    try {
      result = await scoringService.calculateApplicationScore(
        existingApplication.id
      );
    } catch (e) {
      console.error(`[Reprocess] calculateApplicationScore failed once, retrying...`, e);
      await new Promise(res => setTimeout(res, 1000));
      result = await scoringService.calculateApplicationScore(
        existingApplication.id
      );
      console.log(`[Reprocess] scoring retry succeeded.`);
    }

    const score = result.totalScore;
    // The application score and counts are already updated in calculateApplicationScore
    // No need to update again here
    console.log(`Application processed successfully. ID: ${existingApplication.id}, Score: ${score}`);

    try {
      await supabaseAdmin
        .from('processing_locks')
        .delete()
        .eq('lock_id', `typeform_${existingApplication.typeform_response_id}`);
    } catch (error) {
      console.error(`Error releasing processing lock: ${error}`);
      // Non-critical error, just log it
    }

    return NextResponse.json(
      { applicationId: existingApplication.id, score }
    );
  } catch (error) {
    console.error('Error checking for duplicate application:', error);
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'Unknown error'},
      {status: 500}
    );
  }
}
