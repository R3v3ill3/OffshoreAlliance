'use client';

import { useState } from "react";

interface CursorPaginationProps {
  hasNextPage: boolean;
  hasPreviousPage?: boolean;
  onNextPage: () => void;
  onPreviousPage?: () => void;
  loading?: boolean;
  totalItems?: number;
  pageSize?: number;
  currentPageStart?: number;
  currentPageEnd?: number;
}

export function CursorPagination({
  hasNextPage,
  hasPreviousPage = false,
  onNextPage,
  onPreviousPage,
  loading = false,
  totalItems,
  pageSize,
  currentPageStart,
  currentPageEnd,
}: CursorPaginationProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200 sm:px-6">
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          {totalItems !== undefined && currentPageStart !== undefined && currentPageEnd !== undefined && (
            <p className="text-sm text-gray-700">
              Showing <span className="font-medium">{currentPageStart}</span> to{" "}
              <span className="font-medium">{currentPageEnd}</span> of{" "}
              <span className="font-medium">{totalItems}</span> results
            </p>
          )}
        </div>
        <div>
          <nav className="inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
            {onPreviousPage && (
              <button
                onClick={onPreviousPage}
                disabled={!hasPreviousPage || loading}
                className="relative inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-l-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
            )}
            <button
              onClick={onNextPage}
              disabled={!hasNextPage || loading}
              className="relative inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-r-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Loading..." : "Next"}
            </button>
          </nav>
        </div>
      </div>

      {/* Mobile pagination */}
      <div className="flex items-center justify-between w-full sm:hidden">
        <div className="flex-1">
          {onPreviousPage && (
            <button
              onClick={onPreviousPage}
              disabled={!hasPreviousPage || loading}
              className="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
          )}
        </div>
        <div className="flex-1 flex justify-end">
          <button
            onClick={onNextPage}
            disabled={!hasNextPage || loading}
            className="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Loading..." : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
