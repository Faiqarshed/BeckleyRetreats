'use client';

import React from 'react';

type PaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export default function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);

  if (totalPages <= 1) return null;

  const goTo = (p: number) => {
    if (p < 1 || p > totalPages || p === current) return;
    onPageChange(p);
  };

  // Build a compact window of pages around current
  const pages: number[] = [];
  const windowSize = 2;
  const start = Math.max(1, current - windowSize);
  const end = Math.min(totalPages, current + windowSize);
  for (let i = start; i <= end; i++) pages.push(i);

  const showFirst = start > 1;
  const showLast = end < totalPages;

  return (
    <nav className="mt-4 flex items-center justify-between" aria-label="Pagination">
      <div className="flex-1 flex justify-between sm:justify-end">
        <button
          onClick={() => goTo(current - 1)}
          disabled={current === 1}
          className="mr-2 inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm rounded-md bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Previous
        </button>
        {showFirst && (
          <>
            <button
              onClick={() => goTo(1)}
              className={`mx-1 inline-flex items-center px-3 py-1.5 border text-sm rounded-md ${current === 1 ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            >
              1
            </button>
            {start > 2 && <span className="mx-1 text-gray-500">…</span>}
          </>
        )}
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => goTo(p)}
            className={`mx-1 inline-flex items-center px-3 py-1.5 border text-sm rounded-md ${p === current ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            {p}
          </button>
        ))}
        {showLast && (
          <>
            {end < totalPages - 1 && <span className="mx-1 text-gray-500">…</span>}
            <button
              onClick={() => goTo(totalPages)}
              className={`mx-1 inline-flex items-center px-3 py-1.5 border text-sm rounded-md ${current === totalPages ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            >
              {totalPages}
            </button>
          </>
        )}
        <button
          onClick={() => goTo(current + 1)}
          disabled={current === totalPages}
          className="ml-2 inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm rounded-md bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </nav>
  );
}


