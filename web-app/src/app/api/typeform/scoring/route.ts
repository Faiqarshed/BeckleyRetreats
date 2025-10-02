import { NextRequest, NextResponse } from 'next/server';
import { typeformService } from '@/services/typeformService';
import { validateServerSession } from '@/lib/server-auth';
import { UserRole } from '@/types/user';

/**
 * GET /api/typeform/scoring
 * Gets scoring rules for fields and choices
 * Query parameters:
 *   - targetType: 'field' | 'choice'
 *   - targetIds: comma-separated list of target IDs
 */
export async function GET(req: NextRequest) {
  try {
    // Check authentication and authorization
    const authResult = await validateServerSession();

    if (!authResult.authenticated) {
      console.warn('[API GET /api/typeform/scoring] Unauthorized access attempt.');
      return authResult.response || NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // All authenticated users can view scoring rules
    const url = new URL(req.url);
    const targetType = url.searchParams.get('targetType') as 'field' | 'choice';
    const targetIdsParam = url.searchParams.get('targetIds');
    // console.log(`[API GET /api/typeform/scoring] Extracted query params - targetType: ${targetType}, targetIdsParam: ${targetIdsParam}`);

    if (!targetType || !targetIdsParam || !['field', 'choice'].includes(targetType)) {
      console.error(`[API GET /api/typeform/scoring] Invalid parameters detected. targetType: ${targetType}`);
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const targetIds = targetIdsParam.split(',');
    const idCount = targetIds.length;
    
    // Log count instead of the full list
    if (idCount > 10) {
      console.log(`[API GET /api/typeform/scoring] Processing ${idCount} ${targetType} IDs`);
    }
    
    // Get scoring rules
    const rules = await typeformService.getScoringRules(targetType, targetIds);
    return NextResponse.json({ rules });
  } catch (error: any) {
    console.error('[API GET /api/typeform/scoring] Error:', error.message);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/typeform/scoring
 * Creates or updates a scoring rule
 * Request body:
 *   - targetType: 'field' | 'choice'
 *   - targetId: target ID
 *   - scoreValue: 'red' | 'yellow' | 'green'
 *   - criteria: (optional) criteria object
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
    const { targetType, targetId, scoreValue, criteria = {} } = body;

    if (!targetType || !targetId || !scoreValue || !['field', 'choice'].includes(targetType) || !['red', 'yellow', 'green', 'na'].includes(scoreValue)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    // Set scoring rule
    const ruleId = await typeformService.setScoringRule(
      targetType as 'field' | 'choice',
      targetId,
      scoreValue as 'red' | 'yellow' | 'green' | 'na',
      authResult.userId || '',
      criteria
    );

    return NextResponse.json({ ruleId });
  } catch (error: any) {
    console.error('Error in POST /api/typeform/scoring:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/typeform/scoring
 * Deletes a scoring rule
 * Query parameter: ruleId=string
 */
export async function DELETE(req: NextRequest) {
  try {
    // Check authentication and authorization
    const authResult = await validateServerSession([
      'PROGRAM_OPERATIONS_ADMINISTRATOR', 
      'PROGRAM_OPERATIONS_MANAGER'
    ]);
    
    if (!authResult.authorized) {
      return authResult.response || NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get ruleId from URL query parameters
    const searchParams = req.nextUrl.searchParams;
    const ruleId = searchParams.get('ruleId');

    if (!ruleId) {
      return NextResponse.json({ error: 'Rule ID is required' }, { status: 400 });
    }

    try {
      // Check if the rule exists before attempting to delete it
      const { exists } = await typeformService.checkScoringRuleExists(ruleId);
      
      if (!exists) {
        // Rule doesn't exist, but we'll return success anyway
        // This prevents errors when trying to delete rules that were never saved to the database
        console.log(`Rule ${ruleId} not found for deletion, but returning success anyway`);
        return NextResponse.json({ success: true });
      }

      // Rule exists, so delete it
      await typeformService.deleteScoringRule(ruleId);
      return NextResponse.json({ success: true });
    } catch (checkError) {
      console.error(`Error checking if rule ${ruleId} exists:`, checkError);
      // Even if checking fails, attempt to delete anyway
      await typeformService.deleteScoringRule(ruleId);
      return NextResponse.json({ success: true });
    }
  } catch (error: any) {
    console.error('Error in DELETE /api/typeform/scoring:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
