import { NextRequest, NextResponse } from 'next/server';
import { typeformService } from '@/services/typeformService';
import { validateServerSession } from '@/lib/server-auth';
import { UserRole } from '@/types/user';

/**
 * GET /api/typeform/forms/[formId]
 * Returns detailed information about a specific form
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ formId: string }> }
) {
  let formId: string = '';
  try {
    const awaitedParams = await params;
    formId = awaitedParams.formId;
    // Check authentication and authorization
    const authResult = await validateServerSession([
      'PROGRAM_OPERATIONS_ADMINISTRATOR', 
      'PROGRAM_OPERATIONS_MANAGER'
    ]);

    if (!authResult.authorized) {
      console.warn(`[API GET /api/typeform/forms/${formId}] Unauthorized access attempt.`);
      return authResult.response || NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get form details from Typeform
    const formDetails = await typeformService.getFormDetails(formId);
    return NextResponse.json({ form: formDetails });
  } catch (error: any) {
    const effectiveFormId = formId || 'unknown';
    console.error(`[API GET /api/typeform/forms/${effectiveFormId}] Error:`, error.message);
    if (error.response?.status === 400) {
      return NextResponse.json({ error: error.message || 'Bad request from underlying service' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
