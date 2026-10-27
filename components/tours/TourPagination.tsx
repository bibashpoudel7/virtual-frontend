'use client';

import { Icon } from '@iconify/react';

interface TourPaginationProps {
  currentPage: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  onPageChange: (page: number) => void;
  loading?: boolean;
}

export default function TourPagination({
  currentPage,
  totalPages,
  hasNext,
  hasPrev,
  onPageChange,
  loading = false
}: TourPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-4 mt-8">
      {/* Previous Button */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={!hasPrev || loading}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all duration-200 ${
          hasPrev && !loading
            ? 'border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 cursor-pointer'
            : 'border-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        <Icon icon="material-symbols:chevron-left" className="w-5 h-5" />
        Previous
      </button>

      {/* Page Info */}
      <div className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600">
        <span className="font-medium text-gray-900">{currentPage}</span>
        <span>of</span>
        <span className="font-medium text-gray-900">{totalPages}</span>
      </div>

      {/* Next Button */}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={!hasNext || loading}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all duration-200 ${
          hasNext && !loading
            ? 'border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 cursor-pointer'
            : 'border-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        Next
        <Icon icon="material-symbols:chevron-right" className="w-5 h-5" />
      </button>
    </div>
  );
}