import { useState, useEffect, useCallback } from 'react';

interface Transaction {
  id: number;
  telegram_id: number;
  amount: string;
  currency: string;
  method: string;
  plan: string;
  status: string;
  order_reference: string;
  card_pan: string | null;
  tx_hash: string | null;
  created_at: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
}

interface TransactionsResponse {
  transactions: Transaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  counts: {
    all: number;
    Approved: number;
    Pending: number;
    Declined: number;
    WaitingConfirmation: number;
    other: number;
  };
}

type Filter = 'all' | 'Approved' | 'Pending' | 'Declined' | 'WaitingConfirmation';

function SearchIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_STYLES: Record<string, string> = {
  Approved: 'bg-green-100 text-green-700',
  Pending: 'bg-yellow-100 text-yellow-700',
  Declined: 'bg-red-100 text-red-600',
  WaitingConfirmation: 'bg-blue-100 text-blue-700',
  Expired: 'bg-gray-100 text-gray-500',
  Cancelled: 'bg-gray-100 text-gray-500',
};

const STATUS_LABELS: Record<string, string> = {
  WaitingConfirmation: 'Waiting',
};

const METHOD_STYLES: Record<string, string> = {
  card: 'bg-purple-100 text-purple-700',
  crypto: 'bg-orange-100 text-orange-700',
};

export function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [counts, setCounts] = useState<TransactionsResponse['counts']>({
    all: 0, Approved: 0, Pending: 0, Declined: 0, WaitingConfirmation: 0, other: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    const token = localStorage.getItem('admin_token');

    try {
      const params = new URLSearchParams({ page: String(page), limit: '20', filter });
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/transactions?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load transactions');

      const data: TransactionsResponse = await res.json();
      setTransactions(data.transactions);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setCounts(data.counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [page, search, filter]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [search, filter]);

  const filterButtons: { key: Filter; label: string }[] = [
    { key: 'all', label: `All (${counts.all})` },
    { key: 'Approved', label: `Approved (${counts.Approved})` },
    { key: 'Pending', label: `Pending (${counts.Pending})` },
    { key: 'WaitingConfirmation', label: `Waiting (${counts.WaitingConfirmation})` },
    { key: 'Declined', label: `Declined (${counts.Declined})` },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Transactions</h2>
        <span className="text-sm text-gray-500">{total} transactions total</span>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <SearchIcon />
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by Telegram ID, username, order reference or tx hash..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     transition-colors"
        />
      </div>

      {/* Filter buttons */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {filterButtons.map((btn) => (
          <button
            key={btn.key}
            onClick={() => setFilter(btn.key)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md cursor-pointer transition-colors ${
              filter === btn.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : transactions.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 font-medium">No transactions found</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Details</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.map((tx) => {
                  const userName = tx.username
                    ? `@${tx.username}`
                    : [tx.first_name, tx.last_name].filter(Boolean).join(' ') || String(tx.telegram_id);
                  const detail = tx.method === 'crypto'
                    ? tx.tx_hash
                      ? `Hash: ${tx.tx_hash.slice(0, 12)}...`
                      : '—'
                    : tx.card_pan ?? '—';
                  return (
                    <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-gray-400">{tx.id}</td>
                      <td className="px-4 py-3 text-gray-700">
                        <div>{userName}</div>
                        <div className="text-xs text-gray-400 font-mono">{tx.telegram_id}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-medium">
                        {tx.amount} {tx.currency}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          METHOD_STYLES[tx.method] ?? 'bg-gray-100 text-gray-500'
                        }`}>
                          {tx.method}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{tx.plan}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_STYLES[tx.status] ?? 'bg-gray-100 text-gray-500'
                        }`}>
                          {STATUS_LABELS[tx.status] ?? tx.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-mono max-w-[160px] truncate" title={tx.tx_hash ?? tx.card_pan ?? ''}>
                        {detail}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{formatDateTime(tx.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-md
                             hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed
                             cursor-pointer transition-colors"
                >
                  Previous
                </button>
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
            </div>
          )}
        </>
      )}
    </div>
  );
}
