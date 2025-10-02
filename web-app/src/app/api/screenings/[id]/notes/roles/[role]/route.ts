import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request, context: { params: { id: string; role: string } }) {
  const { id: applicationId, role } = await context.params as any;
  try {
    // Identify current user
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: any) {
            cookieStore.delete({ name, ...options });
          },
        },
      }
    );
    const { data: auth } = await supabaseAuth.auth.getUser();
    const currentUserId = auth?.user?.id || null;

    const { data } = await supabaseAdmin
      .from('screenings')
      .select('notes')
      .eq('application_id', applicationId)
      .eq('screening_type', 'initial')
      .maybeSingle();
    const notes = (data?.notes || {}) as any;
    const roleNotes = (notes?.roles && typeof notes.roles === 'object') ? notes.roles[role] : undefined;
    const isSubmitted = !!roleNotes?.submitted;
    const submittedBy = roleNotes?.submitted_by;
    const canViewDraft = !isSubmitted && currentUserId && submittedBy === currentUserId;
    if (!roleNotes || (!isSubmitted && !canViewDraft)) {
      return NextResponse.json({ error: 'No notes found for role' }, { status: 404 });
    }
    return NextResponse.json({ role, notes: roleNotes, is_draft: !isSubmitted });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load role notes' }, { status: 500 });
  }
}



