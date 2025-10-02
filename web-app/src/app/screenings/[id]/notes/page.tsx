'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function ScreeningNotesRolesPage() {
  const params = useParams();
  const [roles, setRoles] = useState<Array<{ role: string; display_name: string | null; display_role: string; is_draft?: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRoles() {
      try {
        setLoading(true);
        const res = await fetch(`/api/screenings/${params.id}/notes/roles`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed loading roles: ${res.status}`);
        const data = await res.json();
        setRoles(Array.isArray(data.roles) ? data.roles : []);
      } catch (e: any) {
        setError(e?.message || 'Failed to load roles');
      } finally {
        setLoading(false);
      }
    }
    if (params.id) loadRoles();
  }, [params.id]);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div className="sm:flex-auto">
          <h1 className="text-xl font-semibold text-gray-900">Screening Notes</h1>
          <p className="mt-2 text-sm text-gray-700">Select a role to view their notes for this screening.</p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none space-x-3">
          <Link href={`/screenings/${params.id}`} className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">Back to Screening</Link>
          <Link href={`/screenings/${params.id}`} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700">Edit Notes</Link>
        </div>
      </div>

      {loading && (
        <div className="mt-8 text-gray-500">Loading roles…</div>
      )}
      {error && (
        <div className="mt-8 text-red-600">{error}</div>
      )}

      {!loading && !error && (
        roles.length > 0 ? (
          <ul className="mt-8 divide-y divide-gray-200 rounded-md border border-gray-200">
            {roles.map((role) => (
              <li key={role.role} className="flex items-center justify-between p-4">
                <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                  <span>{(role.display_name || 'Unknown User')} ({role.display_role})</span>
                  {role.is_draft ? (
                    <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 border border-yellow-200">Draft</span>
                  ) : null}
                </div>
                <Link href={`/screenings/${params.id}/notes/${encodeURIComponent(role.role)}`} className="text-indigo-600 hover:text-indigo-800 text-sm">View notes</Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-8 text-gray-500">No role-specific notes yet.</div>
        )
      )}
    </div>
  );
}



