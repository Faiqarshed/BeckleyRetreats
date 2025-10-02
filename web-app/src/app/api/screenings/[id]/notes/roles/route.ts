import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request, context: { params: { id: string } }) {
  const { id: applicationId } = await context.params;
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
    const roleMapRaw = (notes?.roles && typeof notes.roles === 'object') ? notes.roles : {};
    // Include submitted roles for everyone + drafts created by current user
    const roleMap: Record<string, any> = Object.keys(roleMapRaw)
      .filter((k) => roleMapRaw[k]?.submitted === true || (!!currentUserId && roleMapRaw[k]?.submitted !== true && roleMapRaw[k]?.submitted_by === currentUserId))
      .reduce((acc: Record<string, any>, k: string) => { acc[k] = roleMapRaw[k]; return acc; }, {});
    const roles: string[] = Object.keys(roleMap);

    if (roles.length === 0) {
      return NextResponse.json({ roles: [] });
    }

    // Collect user ids for submitters
    const submitterIds = Array.from(new Set(
      roles
        .map(r => roleMap[r]?.submitted_by)
        .filter((v: any) => typeof v === 'string' && v.trim())
    ));

    let profilesById: Record<string, { first_name?: string; last_name?: string; role?: string }> = {};
    if (submitterIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('user_profiles')
        .select('id, first_name, last_name, role')
        .in('id', submitterIds);
      for (const p of profiles || []) {
        profilesById[p.id] = { first_name: p.first_name, last_name: p.last_name, role: p.role } as any;
      }
    }

    // Build enriched list: display_name and display_role
    const enriched = roles.map(roleKey => {
      const submitterId = roleMap[roleKey]?.submitted_by;
      const prof = submitterId ? profilesById[submitterId] : undefined;
      const name = [prof?.first_name, prof?.last_name].filter(Boolean).join(' ').trim();
      const rawRole = prof?.role || roleKey;
      const displayRole = String(rawRole)
        .replace(/\s+/g, '_')
        .replace(/[^A-Za-z0-9_]/g, '_')
        .toUpperCase();
      return {
        role: roleKey,
        display_name: name || null,
        display_role: displayRole,
        is_draft: roleMap[roleKey]?.submitted !== true
      };
    });

    return NextResponse.json({ roles: enriched });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load roles' }, { status: 500 });
  }
}



