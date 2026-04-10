import { useState, useEffect, useCallback } from 'react';
import { formatDateTime } from '../utils/format';
import { SearchIcon } from '../components/Icons';
import { Pagination } from '../components/Pagination';
import { InfoTooltip } from '../components/Tooltip';
import { STATUS_STYLES, METHOD_STYLES } from '../utils/styles';
import { useAuth } from '../hooks/useAuth';

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
    Cancelled: number;
    other: number;
  };
}

type Filter = 'all' | 'Approved' | 'Pending' | 'Declined' | 'WaitingConfirmation' | 'Cancelled';

const STATUS_LABELS: Record<string, string> = {
  WaitingConfirmation: 'Waiting',
};

const STATUS_TOOLTIPS: Record<string, string> = {
  Approved: 'Оплата успішно завершена. Гроші списано з картки або USDT підтверджено адміном. Підписка активована.',
  Pending: 'Invoice створено в WayForPay, юзер ще не оплатив. Автоматично скасовується через 1 годину якщо не оплачено.',
  Declined: 'Платіж відхилено. Для картки - банк або WayForPay відмовив (недостатньо коштів, ліміт, тощо). Для USDT - адмін натиснув "Не підтверджено".',
  WaitingConfirmation: 'Юзер обрав оплату USDT, відправив хеш транзакції і чекає на підтвердження адміном. Перевірте хеш і натисніть Approve/Deny.',
  Cancelled: 'Юзер сам скасував платіж натиснувши кнопку "Відміна" до оплати. Invoice видалено з WayForPay.',
  WaitingAuthComplete: 'Банк вимагає 3D Secure верифікацію. Юзер перенаправлений на сторінку банку. Після верифікації статус зміниться на Approved або Declined.',
};

export function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [counts, setCounts] = useState<TransactionsResponse['counts']>({
    all: 0, Approved: 0, Pending: 0, Declined: 0, WaitingConfirmation: 0, Cancelled: 0, other: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { headers } = useAuth();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({ page: String(page), limit: '10', filter });
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/transactions?${params}`, {
        headers,
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
    { key: 'Cancelled', label: `Cancelled (${counts.Cancelled})` },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-2xl font-bold text-gray-900">Transactions</h2>
        <span className="text-sm text-gray-500">{total} transactions total</span>
      </div>

      {/* Search */}
      <div className="relative mb-2">
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
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        {filterButtons.map((btn) => (
          <div key={btn.key} className="relative">
            <button
              onClick={() => setFilter(btn.key)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md cursor-pointer transition-colors inline-flex items-center gap-1.5 ${
                filter === btn.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {btn.key !== 'all' && STATUS_TOOLTIPS[btn.key] && (
                <InfoTooltip content={STATUS_TOOLTIPS[btn.key]} />
              )}
              {btn.label}
            </button>
          </div>
        ))}
      </div>

      {error && <p className="text-red-600 mb-2">{error}</p>}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : transactions.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 font-medium">No transactions found</p>
        </div>
      ) : (
        <>
          <div className="overflow-auto border border-gray-200 rounded-lg flex-1 min-h-0">
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

        </>
      )}

      {transactions.length > 0 && (
        <Pagination page={page} totalPages={totalPages} setPage={setPage} />
      )}
    </div>
  );
}
