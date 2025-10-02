import { NextRequest, NextResponse } from 'next/server';
import { applicationService } from '@/services/applicationService';

/**
 * GET handler to check for duplicate application submissions by token
 */
export async function GET(req: NextRequest) {
  try {
    // Extract token from query parameters
    const token = req.nextUrl.searchParams.get('token');
    
    if (!token) {
      return NextResponse.json(
        { error: 'Token parameter is required' },
        { status: 400 }
      );
    }

    // Check for existing application with this token
    const existingApplication = await applicationService.findApplicationByToken(token);
    
    return NextResponse.json({
      isDuplicate: !!existingApplication,
      existingApplication: existingApplication || null
    });
  } catch (error) {
    console.error('Error checking for duplicate application:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
