import {applicationService} from '@/services/applicationService';
import {SavedTypeFormApplication} from "@/types/application";
import {NextResponse} from 'next/server';

const PROCESS_APPLICATION_ENDPOINT = `${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/applications/re-process`;

export async function GET() {
  // Find applications with a lock older than 3 minutes and unprocessed answers
  const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  let applications: Array<SavedTypeFormApplication> = [];
  try {
    // You may want to adjust this query logic as per your schema
    applications = await applicationService.getUnprocessedApplications(threeMinutesAgo);
  } catch (err) {
    return NextResponse.json({
      error: 'Failed to fetch applications',
      details: err instanceof Error ? err.message : err
    }, {status: 500});
  }

  console.log(`Found ${applications.length} unprocessed applications to re-process.`);

  // Call /api/cron/process-application for each application (fire-and-forget)
  const pendingApplications: string[] = applications.map(app => {
    console.log(`Will queue Re-processing of application ${app.id} with response ID ${app.typeform_response_id}`);
    fetch(
      PROCESS_APPLICATION_ENDPOINT,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'authorization': `Bearer ${process.env.CRON_SECURE_KEY}`,
        },
        body: JSON.stringify({typeform_response_id: app.typeform_response_id}),
      }).then(r => {
      if (!r.ok) {
        console.error(`Failed to process application ${app.id}: ${r.statusText}`);
      }
    });

    return app.typeform_response_id;
  });

  return NextResponse.json({count: pendingApplications.length, pending: pendingApplications});
}
