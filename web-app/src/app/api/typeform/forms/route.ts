import { NextRequest, NextResponse } from 'next/server';
import { typeformService } from '@/services/typeformService';
import { validateServerSession } from '@/lib/server-auth';
import { UserRole } from '@/types/user';

/**
 * GET /api/typeform/forms
 * Returns a list of all forms from our database
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

    // Get forms from our database
    const dbForms = await typeformService.getFormsFromDatabase();
    
    // For forms that we have in our database, fetch their display links from Typeform
    // to enable the "View Form" functionality
    const allTypeformForms = await typeformService.getFormsFromTypeform();
    
    // Map database forms to include display links from Typeform forms
    const forms = dbForms.map((dbForm: any) => {
      const typeformForm = allTypeformForms.find(tf => tf.id === dbForm.form_id);
      
      return {
        id: dbForm.form_id,
        db_id: dbForm.id,
        title: dbForm.form_title,
        workspace_id: dbForm.workspace_id,
        created_at: dbForm.created_at,
        updated_at: dbForm.updated_at,
        _links: {
          display: typeformForm?._links?.display || '#'
        }
      };
    });
    
    return NextResponse.json({ forms });
  } catch (error: any) {
    console.error('Error in GET /api/typeform/forms:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/typeform/forms
 * Syncs a form from Typeform to our database
 * Request body: { formId: string }
 */
export async function POST(req: NextRequest) {
  try {
    // Check authentication and authorization
    const authResult = await validateServerSession([
      'PROGRAM_OPERATIONS_ADMINISTRATOR', 
      'PROGRAM_OPERATIONS_MANAGER'
    ]);
    
    if (!authResult.authorized) {
      return authResult.response || NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const { formId } = body;

    if (!formId) {
      return NextResponse.json({ error: 'Form ID is required' }, { status: 400 });
    }

    // Sync form
    const dbFormId = await typeformService.syncForm(formId);
    return NextResponse.json({ dbFormId });
  } catch (error: any) {
    console.error('Error in POST /api/typeform/forms:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
