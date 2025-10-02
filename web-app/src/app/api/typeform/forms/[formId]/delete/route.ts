import { NextRequest, NextResponse } from 'next/server';
import { typeformService } from '@/services/typeformService';
import { validateServerSession } from '@/lib/server-auth';
import { UserRole } from '@/types/user';

/**
 * DELETE /api/typeform/forms/[formId]/delete
 * Deletes a typeform from the database
 * Admin only endpoint
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ formId: string }> }
) {
  let formId: string = '';
  try {
    const resolvedParams = await params;
    formId = resolvedParams.formId;
    console.log(`[API DELETE /api/typeform/forms/${formId}/delete] Received request.`);

    // Check authentication and authorization - restricted to admin only
    console.log(`[API DELETE /api/typeform/forms/${formId}/delete] Validating session...`);
    const authResult = await validateServerSession([
      UserRole.PROGRAM_OPERATIONS_ADMINISTRATOR
    ]);
    
    if (!authResult.authorized) {
      console.warn(`[API DELETE /api/typeform/forms/${formId}/delete] Unauthorized access attempt.`);
      return authResult.response || NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Delete the form from the database
    console.log(`[API DELETE /api/typeform/forms/${formId}/delete] Deleting form...`);
    await typeformService.deleteForm(formId);
    console.log(`[API DELETE /api/typeform/forms/${formId}/delete] Form deleted successfully.`);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(`[API DELETE /api/typeform/forms/${formId}/delete] Error:`, error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
