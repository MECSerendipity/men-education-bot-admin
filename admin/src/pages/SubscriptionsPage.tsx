import { useState, useEffect, useCallback } from 'react';
import { formatDate, formatDateTime } from '../utils/format';
import { SearchIcon } from '../components/Icons';
import { Pagination } from '../components/Pagination';
import { InfoTooltip, Tooltip } from '../components/Tooltip';
import { STATUS_STYLES, METHOD_STYLES } from '../utils/styles';
import { useAuth } from '../hooks/useAuth';

const FILTER_TOOLTIPS: Record<string, string> = {
  Active: 'Підписка активна, юзер має доступ до каналів. Auto-renewal спробує списати за 3 дні до закінчення.',
  Expired: 'Підписка закінчилась і не була продовжена. Юзер втратив доступ до каналів і був кікнутий.',
  Cancelled: 'Юзер скасував підписку вручну. Доступ зберігається до expires_at, потім кік.',
};

interface Subscription {
  id: number;
  telegram_id: number;
  plan: string;
  method: string;
  status: string;
  card_pan: string | null;
  prices: Record<string, { amount: number; currency: string; display_name?: string }> | null;
  started_at: string;
  expires_at: string;
  created_at: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
}

interface SubscriptionEvent {
  id: number;
  subscription_id: number;
  telegram_id: number;
  event: string;
  plan: string | null;
  method: string | null;
  card_pan: string | null;
  amount: number | null;
  currency: string | null;
  expires_at: string | null;
  created_at: string;
}

interface SubscriptionsResponse {
  subscriptions: Subscription[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  counts: { all: number; Active: number; Expired: number; Cancelled: number };
}

type Filter = 'all' | 'Active' | 'Expired' | 'Cancelled';

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={2} className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}

const EVENT_STYLES: Record<string, string> = {
  created: 'bg-blue-100 text-blue-700',
  renewed: 'bg-green-100 text-green-700',
  plan_changed: 'bg-yellow-100 text-yellow-700',
  method_changed: 'bg-purple-100 text-purple-700',
  card_changed: 'bg-indigo-100 text-indigo-700',
  cancelled: 'bg-red-100 text-red-600',
  expired: 'bg-gray-100 text-gray-500',
};

const EVENT_LABELS: Record<string, string> = {
  created: 'Created',
  renewed: 'Renewed',
  plan_changed: 'Plan Changed',
  method_changed: 'Method Changed',
  card_changed: 'Card Changed',
  cancelled: 'Cancelled',
  expired: 'Expired',
};


export function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [counts, setCounts] = useState<SubscriptionsResponse['counts']>({ all: 0, Active: 0, Expired: 0, Cancelled: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Expandable rows: subscriptionId -> events (multiple can be open)
  const [expandedEvents, setExpandedEvents] = useState<Record<number, SubscriptionEvent[]>>({});
  const [loadingEvents, setLoadingEvents] = useState<Set<number>>(new Set());
  const { headers } = useAuth();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({ page: String(page), limit: '10', filter });
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/subscriptions?${params}`, {
        headers,
      });
      if (!res.ok) throw new Error('Failed to load subscriptions');

      const data: SubscriptionsResponse = await res.json();
      setSubscriptions(data.subscriptions);
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

  const toggleExpand = async (subscriptionId: number) => {
    if (subscriptionId in expandedEvents) {
      setExpandedEvents((prev) => {
        const next = { ...prev };
        delete next[subscriptionId];
        return next;
      });
      return;
    }

    setLoadingEvents((prev) => new Set(prev).add(subscriptionId));

    try {
      const res = await fetch(`/api/subscriptions/${subscriptionId}/events`, {
        headers,
      });
      if (!res.ok) throw new Error('Failed to load events');
      const data = await res.json();
      setExpandedEvents((prev) => ({ ...prev, [subscriptionId]: data.events }));
    } catch {
      setExpandedEvents((prev) => ({ ...prev, [subscriptionId]: [] }));
    } finally {
      setLoadingEvents((prev) => {
        const next = new Set(prev);
        next.delete(subscriptionId);
        return next;
      });
    }
  };

  const filterButtons: { key: Filter; label: string }[] = [
    { key: 'all', label: `All (${counts.all})` },
    { key: 'Active', label: `Active (${counts.Active})` },
    { key: 'Expired', label: `Expired (${counts.Expired})` },
    { key: 'Cancelled', label: `Cancelled (${counts.Cancelled})` },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-2xl font-bold text-gray-900">Subscriptions</h2>
        <span className="text-sm text-gray-500">{total} subscriptions total</span>
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
          placeholder="Search by Telegram ID, username or name..."
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

      {error && <p className="text-red-600 mb-2">{error}</p>}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : subscriptions.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 font-medium">No subscriptions found</p>
        </div>
      ) : (
        <>
          <div className="overflow-auto border border-gray-200 rounded-lg flex-1 min-h-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-2 py-3 font-medium w-6"></th>
                  <th className="px-3 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Prices</th>
                  <th className="px-4 py-3 font-medium">Started</th>
                  <th className="px-4 py-3 font-medium">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {subscriptions.map((sub) => {
                  const userName = sub.username
                    ? `@${sub.username}`
                    : [sub.first_name, sub.last_name].filter(Boolean).join(' ') || String(sub.telegram_id);
                  const isExpanded = sub.id in expandedEvents || loadingEvents.has(sub.id);
                  const subEvents = expandedEvents[sub.id];
                  const isLoadingEvents = loadingEvents.has(sub.id);

                  return (
                    <>
                      <tr
                        key={sub.id}
                        onClick={() => toggleExpand(sub.id)}
                        className={`hover:bg-gray-50 transition-colors cursor-pointer ${isExpanded ? 'bg-blue-50' : ''}`}
                      >
                        <td className="px-2 py-3 text-gray-400">
                          <ChevronIcon open={isExpanded} />
                        </td>
                        <td className="px-3 py-3 font-mono text-gray-400">{sub.id}</td>
                        <td className="px-4 py-3 text-gray-700">
                          <div>{userName}</div>
                          <div className="text-xs text-gray-400 font-mono">TG_ID: {sub.telegram_id}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{sub.plan}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            METHOD_STYLES[sub.method] ?? 'bg-gray-100 text-gray-500'
                          }`}>
                            {sub.method}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            STATUS_STYLES[sub.status] ?? 'bg-gray-100 text-gray-500'
                          }`}>
                            {sub.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {sub.prices ? (
                            <Tooltip content={
                              <div className="space-y-1">
                                <div className="font-semibold text-gray-300 mb-1.5">Price snapshot</div>
                                {Object.entries(sub.prices).map(([k, v]) => (
                                  <div key={k} className={`flex justify-between gap-4 ${k === sub.plan ? 'text-green-400 font-medium' : ''}`}>
                                    <span>{v.display_name ?? k}</span>
                                    <span>{v.amount} {v.currency}</span>
                                  </div>
                                ))}
                              </div>
                            }>
                              <span className="cursor-help underline decoration-dotted">
                                {sub.prices[sub.plan] ? `${sub.prices[sub.plan].amount} ${sub.prices[sub.plan].currency}` : 'View'}
                              </span>
                            </Tooltip>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{formatDate(sub.started_at)}</td>
                        <td className="px-4 py-3 text-gray-500">{formatDate(sub.expires_at)}</td>
                      </tr>

                      {/* Expanded events row */}
                      {isExpanded && (
                        <tr key={`${sub.id}-events`}>
                          <td colSpan={10} className="px-0 py-0">
                            <div className="bg-gray-50 border-t border-b border-gray-200 px-8 py-4">
                              <h4 className="text-sm font-semibold text-gray-700 mb-3">Subscription History</h4>

                              {isLoadingEvents ? (
                                <p className="text-sm text-gray-400">Loading history...</p>
                              ) : !subEvents || subEvents.length === 0 ? (
                                <p className="text-sm text-gray-400">No history yet</p>
                              ) : (
                                <table className="w-full text-sm">
                                  <thead className="text-gray-500 text-left text-xs">
                                    <tr>
                                      <th className="pb-2 pr-4 font-medium">Event ID</th>
                                      <th className="pb-2 pr-4 font-medium">Event</th>
                                      <th className="pb-2 pr-4 font-medium">Plan</th>
                                      <th className="pb-2 pr-4 font-medium">Method</th>
                                      <th className="pb-2 pr-4 font-medium">Card</th>
                                      <th className="pb-2 pr-4 font-medium">Amount</th>
                                      <th className="pb-2 pr-4 font-medium">Created</th>
                                      <th className="pb-2 font-medium">Expires</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200">
                                    {subEvents.map((ev) => (
                                      <tr key={ev.id} className="text-gray-600">
                                        <td className="py-2 pr-4 font-mono text-gray-400 text-xs">{ev.id}</td>
                                        <td className="py-2 pr-4">
                                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                            EVENT_STYLES[ev.event] ?? 'bg-gray-100 text-gray-500'
                                          }`}>
                                            {EVENT_LABELS[ev.event] ?? ev.event}
                                          </span>
                                        </td>
                                        <td className="py-2 pr-4 text-xs">{ev.plan ?? '-'}</td>
                                        <td className="py-2 pr-4">
                                          {ev.method ? (
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                              METHOD_STYLES[ev.method] ?? 'bg-gray-100 text-gray-500'
                                            }`}>
                                              {ev.method}
                                            </span>
                                          ) : '-'}
                                        </td>
                                        <td className="py-2 pr-4 text-xs font-mono">{ev.card_pan ?? '-'}</td>
                                        <td className="py-2 pr-4 text-xs">
                                          {ev.amount ? `${ev.amount} ${ev.currency ?? ''}` : '-'}
                                        </td>
                                        <td className="py-2 pr-4 text-xs">{formatDate(ev.created_at)}</td>
                                        <td className="py-2 text-xs text-gray-600">{formatDate(ev.expires_at)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

        </>
      )}

      {subscriptions.length > 0 && (
        <Pagination page={page} totalPages={totalPages} setPage={setPage} />
      )}
    </div>
  );
}
