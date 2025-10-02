import { NextRequest, NextResponse } from 'next/server';
import { applicationService } from '@/services/applicationService';
import { validateAdminRole } from '@/lib/server-auth';
import { ApplicationStatus } from '@/types/application';

/**
 * GET handler to retrieve applications with optional filtering
 */
export async function GET(req: NextRequest) {
  try {
    // Validate admin or screener access
    const authResult = await validateAdminRole();
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Extract query parameters
    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get('status') as ApplicationStatus | undefined;
    const closedReason = searchParams.get('closed_reason') || undefined;
    const minScore = searchParams.get('minScore') 
      ? parseInt(searchParams.get('minScore') as string) 
      : undefined;
    const maxScore = searchParams.get('maxScore') 
      ? parseInt(searchParams.get('maxScore') as string) 
      : undefined;
    const assignedTo = searchParams.get('assignedTo') || undefined;
    const isScreening = searchParams.get('screening') === 'true';

    // Pagination params
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);
    const search = searchParams.get('search') || undefined;
    const screeningFrom = searchParams.get('screeningFrom') || undefined;
    const screeningTo = searchParams.get('screeningTo') || undefined;
    const submissionFrom = searchParams.get('submissionFrom') || undefined;
    const submissionTo = searchParams.get('submissionTo') || undefined;
    const screener = searchParams.get('screener') || undefined;
    const participantId = searchParams.get('participant') || undefined;

    // Get applications with optional filters and pagination
    const result = await applicationService.getApplications({
      status,
      minScore,
      maxScore,
      assignedTo,
      isScreening,
      closedReason,
      page,
      pageSize,
      search,
      screeningFrom,
      screeningTo,
      submissionFrom,
      submissionTo,
      screener,
      participantId
    });

    return NextResponse.json({
      applications: result.applications,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize
    });
  } catch (error) {
    console.error('Error getting applications:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
