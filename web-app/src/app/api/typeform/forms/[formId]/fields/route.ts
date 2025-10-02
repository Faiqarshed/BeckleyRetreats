import { NextRequest, NextResponse } from 'next/server';
import { typeformService } from '@/services/typeformService';
import { validateServerSession } from '@/lib/server-auth';

/**
 * GET /api/typeform/forms/[formId]/fields
 * Returns all fields and their choices for a specific form
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ formId: string }> } 
) {
  let formId: string = ''; 
  try {
    // Await the params Promise and get formId
    const awaitedParams = await params;
    formId = awaitedParams.formId; 
    // Check authentication and authorization
    const authResult = await validateServerSession([
      'PROGRAM_OPERATIONS_ADMINISTRATOR',
      'PROGRAM_OPERATIONS_MANAGER'
    ]);

    if (!authResult.authorized) {
      console.warn(`[API GET /api/typeform/forms/${formId}/fields] Unauthorized access attempt.`);
      return authResult.response || NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get fields for the form using the awaited formId
    const fields = await typeformService.getFormFieldVersions(formId);

    // Get all choices for all fields
    const choices = [];
    for (const field of fields) {
      const fieldChoices = await typeformService.getFieldChoiceVersions(field.id);
      choices.push(...fieldChoices);
    }

    return NextResponse.json({
      fields,
      choices
    });
  } catch (error: any) {
    // Use the formId obtained (or default if await failed before assignment)
    const effectiveFormId = formId || 'unknown';
    console.error(`[API GET /api/typeform/forms/${effectiveFormId}/fields] Error:`, error.message);
    
    // Check if the error has a response status that might indicate a 400 from the service itself
    if (error.response?.status === 400) {
       return NextResponse.json({ error: error.message || 'Bad request from underlying service' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
