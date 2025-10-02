import { NextRequest, NextResponse } from 'next/server';
import { typeformService } from '@/services/typeformService';
import { validateServerSession } from '@/lib/server-auth';
import { UserRole } from '@/types/user';

/**
 * POST /api/typeform/forms/[formId]/sync
 * Triggers a manual sync of a specific form
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ formId: string }> }
) {
  // Await params properly according to Next.js requirements
  const resolvedParams = await params;
  const formId = resolvedParams.formId;
  
  try {
    // Check authentication and authorization
    const authResult = await validateServerSession([
      'PROGRAM_OPERATIONS_ADMINISTRATOR', 
      'PROGRAM_OPERATIONS_MANAGER'
    ]);
    
    if (!authResult.authorized) {
      return authResult.response || NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Sync form
    const dbFormId = await typeformService.syncForm(formId);
    return NextResponse.json({ success: true, dbFormId });
  } catch (error: any) {
    console.error(`Error in POST /api/typeform/forms/${formId}/sync:`, error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
