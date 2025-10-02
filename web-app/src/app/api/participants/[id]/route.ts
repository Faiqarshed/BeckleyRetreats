import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminRole } from '@/lib/server-auth';

// Initialize Supabase client with service role for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * GET handler to retrieve a specific participant by ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Validate admin or screener access
    const authResult = await validateAdminRole();
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: participantId } = await params;

    // Fetch the participant
    const { data: participant, error } = await supabaseAdmin
      .from('participants')
      .select('*')
      .eq('id', participantId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // PostgreSQL error for no rows returned
        return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
      }
      console.error('Error fetching participant:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!participant) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
    }

    return NextResponse.json({ participant });
  } catch (error) {
    console.error('Error processing participant request:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PUT handler to update a participant
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Validate admin access
    const authResult = await validateAdminRole();
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: participantId } = await params;
    
    // Check if participant exists
    const { data: existingParticipant, error: checkError } = await supabaseAdmin
      .from('participants')
      .select('id')
      .eq('id', participantId)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
      }
      console.error('Error checking participant:', checkError);
      return NextResponse.json({ error: checkError.message }, { status: 500 });
    }

    // Parse request body
    const updates = await req.json();
    
    // Remove restricted fields
    delete updates.id;
    delete updates.created_at;
    
    // Set updated_at
    updates.updated_at = new Date().toISOString();

    // Update participant
    const { data, error } = await supabaseAdmin
      .from('participants')
      .update(updates)
      .eq('id', participantId)
      .select()
      .single();

    if (error) {
      console.error('Error updating participant:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ participant: data });
  } catch (error) {
    console.error('Error processing update participant request:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
