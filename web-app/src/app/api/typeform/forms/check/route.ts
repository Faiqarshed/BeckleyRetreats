import { NextRequest, NextResponse } from 'next/server';
import { typeformService } from '@/services/typeformService';
import { validateServerSession } from '@/lib/server-auth';

/**
 * GET /api/typeform/forms/check?formId=XXX
 * Checks if a form exists in our database
 */
export async function GET(req: NextRequest) {
  try {
    // Check authentication and authorization
    const authResult = await validateServerSession([
      'PROGRAM_OPERATIONS_ADMINISTRATOR', 
      'PROGRAM_OPERATIONS_MANAGER'
    ]);
    
    if (!authResult.authorized) {
      return authResult.response || NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get formId from query params
    const { searchParams } = new URL(req.url);
    const formId = searchParams.get('formId');

    if (!formId) {
      return NextResponse.json({ error: 'Form ID is required' }, { status: 400 });
    }

    // Check if form exists in database
    const { exists, form } = await typeformService.checkFormExists(formId);
    
    return NextResponse.json({ exists, form });
  } catch (error: any) {
    console.error('Error in GET /api/typeform/forms/check:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
