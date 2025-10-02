import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminRole } from '@/lib/server-auth';
import { Participant } from '@/types/application';

// Initialize Supabase client with service role for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * GET handler to retrieve participants with optional filtering
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
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);

    // Base query
    let query = supabaseAdmin
      .from('participants')
      .select('*', { count: 'exact' });

    // Apply filters
    if (status === 'active') {
      // Treat Active as DB status ACTIVE/Active
      query = query.in('status', ['ACTIVE', 'Active']);
    } else if (status === 'inactive') {
      // Treat Inactive as DB status PENDING/Pending (per payload)
      query = query.in('status', ['PENDING', 'Pending']);
    }

    if (search) {
      const termRaw = search.replace(/\s+/g, ' ').trim();
      let orClause = `first_name.ilike.%${termRaw}%,last_name.ilike.%${termRaw}%,email.ilike.%${termRaw}%`;
      if (termRaw.includes(' ')) {
        const parts = termRaw.split(/\s+/).filter(Boolean);
        const first = parts[0];
        const last = parts.slice(1).join(' ');
        orClause = `and(first_name.ilike.%${first}%,last_name.ilike.%${last}%),and(first_name.ilike.%${last}%,last_name.ilike.%${first}%),first_name.ilike.%${first}%,last_name.ilike.%${first}%,first_name.ilike.%${last}%,last_name.ilike.%${last}%,${orClause}`;
      }
      query = query.or(orClause);
    }

    // Order by created_at descending (newest first) and apply pagination
    const safePage = Math.max(1, page);
    const safePageSize = Math.max(1, Math.min(100, pageSize));
    const rangeFrom = (safePage - 1) * safePageSize;
    const rangeTo = rangeFrom + safePageSize - 1;
    query = query.order('created_at', { ascending: false }).range(rangeFrom, rangeTo);

    // Execute query
    const { data: participants, error, count } = await query;

    if (error) {
      console.error('Error fetching participants:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ participants, total: count || 0, page: safePage, pageSize: safePageSize });
  } catch (error) {
    console.error('Error processing participants request:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST handler to create a new participant
 */
export async function POST(req: NextRequest) {
  try {
    // Validate admin access
    const authResult = await validateAdminRole();
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const participantData: Omit<Participant, 'id' | 'created_at' | 'updated_at'> = await req.json();

    // Validate required fields
    if (!participantData.email || !participantData.first_name || !participantData.last_name) {
      return NextResponse.json(
        { error: 'Email, first name, and last name are required' },
        { status: 400 }
      );
    }

    // Check if participant with this email already exists
    const { data: existingParticipant } = await supabaseAdmin
      .from('participants')
      .select('id')
      .eq('email', participantData.email)
      .single();

    if (existingParticipant) {
      return NextResponse.json(
        { error: 'A participant with this email already exists' },
        { status: 409 }
      );
    }

    // Set default values
    const now = new Date().toISOString();
    const participant = {
      ...participantData,
      is_active: participantData.is_active ?? true,
      created_at: now,
      updated_at: now
    };

    // Insert new participant
    const { data, error } = await supabaseAdmin
      .from('participants')
      .insert(participant)
      .select()
      .single();

    if (error) {
      console.error('Error creating participant:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ participant: data }, { status: 201 });
  } catch (error) {
    console.error('Error processing create participant request:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
