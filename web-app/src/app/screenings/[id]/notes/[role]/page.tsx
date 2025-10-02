'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function ScreeningRoleNotesPage() {
  const params = useParams();
  const [payload, setPayload] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const headerLabel = useMemo(() => {
    let raw = String(params.role || '');
    try { raw = decodeURIComponent(raw); } catch {}
    const idx = raw.indexOf(':');
    const baseRole = (idx > -1 ? raw.substring(0, idx) : raw).trim();
    const pretty = baseRole
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return `${pretty} Notes`;
  }, [params.role]);

  useEffect(() => {
    async function loadRoleNotes() {
      try {
        setLoading(true);
        const res = await fetch(`/api/screenings/${params.id}/notes/roles/${params.role}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed loading role notes: ${res.status}`);
        const data = await res.json();
        setPayload(data);
      } catch (e: any) {
        setError(e?.message || 'Failed to load notes');
      } finally {
        setLoading(false);
      }
    }
    if (params.id && params.role) loadRoleNotes();
  }, [params.id, params.role]);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div className="sm:flex-auto">
          <h1 className="text-xl font-semibold text-gray-900">{headerLabel}</h1>
          <p className="mt-2 text-sm text-gray-700">Notes for this role and screening.</p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none space-x-3">
          <Link href={`/screenings/${params.id}/notes`} className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">Back to roles</Link>
          <Link href={`/screenings/${params.id}`} className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">Back to screening</Link>
        </div>
      </div>

      {loading && <div className="mt-8 text-gray-500">Loading…</div>}
      {error && <div className="mt-8 text-red-600">{error}</div>}

      {!loading && !error && payload?.notes && (
        <div className="mt-8 space-y-6">
          {payload?.is_draft ? (
            <div className="rounded-md bg-yellow-50 p-4 border border-yellow-200">
              <div className="flex">
                <div className="ml-0">
                  <h3 className="text-sm font-medium text-yellow-800">Draft</h3>
                  <div className="mt-2 text-sm text-yellow-700">
                    <p>You are viewing your draft notes. Drafts are only visible to you until submitted.</p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          {Object.entries(payload.notes).map(([key, value]) => (
            key === 'submitted' || key === 'updated_at' || key === 'submitted_by' ? null : (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-2">{key}</label>
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3 min-h-[60px]">
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{String(value ?? '') || '—'}</p>
                </div>
              </div>
            )
          ))}
          <div className="text-xs text-gray-500">
            <div>Last updated: {payload.notes.updated_at || '—'}</div>
          </div>
        </div>
      )}
    </div>
  );
}



