interface PaginationProps {
  page: number;
  totalPages: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}

export function Pagination({ page, totalPages, setPage }: PaginationProps) {
  return (
    <div className="flex items-center justify-center gap-3 py-3 border-t border-gray-200 bg-gray-50">
      <button
        onClick={() => setPage((p) => Math.max(1, p - 1))}
        disabled={page <= 1}
        className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-md
                   hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed
                   cursor-pointer transition-colors"
      >
        Previous
      </button>
      <span className="text-sm text-gray-500">
        {page} of {totalPages}
      </span>
      <button
        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        disabled={page >= totalPages}
        className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-md
                   hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed
                   cursor-pointer transition-colors"
      >
        Next
      </button>
    </div>
  );
}
