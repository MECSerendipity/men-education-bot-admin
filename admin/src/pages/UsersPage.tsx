import { useState, useEffect, useCallback } from 'react';
import { formatDate } from '../utils/format';
import { SearchIcon } from '../components/Icons';
import { Pagination } from '../components/Pagination';
import { InfoTooltip } from '../components/Tooltip';
import { useAuth } from '../hooks/useAuth';

const FILTER_TOOLTIPS: Record<string, string> = {
  active: 'Юзери з активною підпискою. Мають доступ до приватних каналів клубу.',
  inactive: 'Юзери без підписки або з простроченою/скасованою підпискою. Не мають доступу до каналів.',
};

interface User {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  is_subscribed: boolean;
  ref_code: string | null;
  subscribed_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  counts: { all: number; active: number; inactive: number };
}

type Filter = 'all' | 'active' | 'inactive';

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [counts, setCounts] = useState<{ all: number; active: number; inactive: number }>({ all: 0, active: 0, inactive: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { headers } = useAuth();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
        filter,
      });
      if (search.trim()) {
        params.set('search', search.trim());
      }

      const res = await fetch(`/api/users?${params}`, {
        headers,
      });
      if (!res.ok) throw new Error('Failed to load users');

      const data: UsersResponse = await res.json();
      setUsers(data.users);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setCounts(data.counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [page, search, filter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Reset to page 1 when search or filter changes
  useEffect(() => {
    setPage(1);
  }, [search, filter]);

  const filterButtons: { key: Filter; label: string }[] = [
    { key: 'all', label: `All (${counts.all})` },
    { key: 'active', label: `Active (${counts.active})` },
    { key: 'inactive', label: `Inactive (${counts.inactive})` },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-2xl font-bold text-gray-900">Users</h2>
        <span className="text-sm text-gray-500">{total} users total</span>
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
          placeholder="Search by username, name or Telegram ID..."
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
              {btn.key !== 'all' && FILTER_TOOLTIPS[btn.key] && (
                <InfoTooltip content={FILTER_TOOLTIPS[btn.key]} />
              )}
              {btn.label}
            </button>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && <p className="text-red-600 mb-2">{error}</p>}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : users.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-gray-300 mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth={1.5} className="w-12 h-12 mx-auto">
              <path strokeLinecap="round" strokeLinejoin="round"
                    d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium">No users found</p>
          {search && (
            <p className="text-gray-400 text-sm mt-1">
              No users matching "<span className="font-medium">{search}</span>"
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-auto border border-gray-200 rounded-lg flex-1 min-h-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">User ID</th>
                  <th className="px-4 py-3 font-medium">Telegram ID</th>
                  <th className="px-4 py-3 font-medium">Username</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Subscription</th>
                  <th className="px-4 py-3 font-medium">Ref Code</th>
                  <th className="px-4 py-3 font-medium">Registered</th>
                  <th className="px-4 py-3 font-medium">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => {
                  const active = user.is_subscribed;
                  return (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-gray-400">{user.id}</td>
                      <td className="px-4 py-3 font-mono text-gray-700">{user.telegram_id}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {user.username ? `@${user.username}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {[user.first_name, user.last_name].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{user.email || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-400 text-xs">{user.ref_code ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(user.created_at)}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(user.expires_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </>
      )}

      {users.length > 0 && (
        <Pagination page={page} totalPages={totalPages} setPage={setPage} />
      )}
    </div>
  );
}
