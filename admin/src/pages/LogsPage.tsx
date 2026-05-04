import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';

interface SystemLog {
  id: number;
  level: string;
  message: string;
  context: Record<string, unknown> | null;
  created_at: string;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('uk-UA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

interface Badge {
  label: string;
  value: string;
  color: string;
}

/** Pick well-known fields from context and render them as compact badges */
function extractBadges(ctx: Record<string, unknown> | null): Badge[] {
  if (!ctx) return [];
  const out: Badge[] = [];

  const pick = (keys: string[]): unknown => {
    for (const k of keys) {
      if (ctx[k] !== undefined && ctx[k] !== null && ctx[k] !== '') return ctx[k];
    }
    return undefined;
  };

  const tg = pick(['telegramId', 'telegram_id', 'tgId']);
  if (tg !== undefined) out.push({ label: 'tg', value: String(tg), color: 'cyan' });

  const userId = pick(['userId', 'user_id']);
  if (userId !== undefined) out.push({ label: 'user', value: String(userId), color: 'blue' });

  const subId = pick(['subscriptionId', 'subscription_id', 'subId']);
  if (subId !== undefined) out.push({ label: 'sub', value: String(subId), color: 'purple' });

  const orderRef = pick(['orderReference', 'orderRef', 'order_reference']);
  if (orderRef !== undefined) out.push({ label: 'order', value: String(orderRef), color: 'amber' });

  const txId = pick(['transactionId', 'transaction_id']);
  if (txId !== undefined) out.push({ label: 'tx', value: String(txId), color: 'amber' });

  const plan = pick(['plan']);
  if (plan !== undefined) out.push({ label: 'plan', value: String(plan), color: 'pink' });

  const method = pick(['method']);
  if (method !== undefined) out.push({ label: 'method', value: String(method), color: 'pink' });

  const amount = pick(['amount']);
  const currency = pick(['currency']);
  if (amount !== undefined) {
    const val = currency ? `${amount} ${currency}` : String(amount);
    out.push({ label: '$', value: val, color: 'emerald' });
  }

  const cardPan = pick(['cardPan', 'card_pan']);
  if (cardPan !== undefined) out.push({ label: 'card', value: String(cardPan), color: 'sky' });

  const signal = pick(['signal']);
  if (signal !== undefined) out.push({ label: 'signal', value: String(signal), color: 'gray' });

  return out;
}

const BADGE_COLORS: Record<string, string> = {
  cyan:    'bg-cyan-900/40 border-cyan-700 text-cyan-300',
  blue:    'bg-blue-900/40 border-blue-700 text-blue-300',
  purple:  'bg-purple-900/40 border-purple-700 text-purple-300',
  amber:   'bg-amber-900/40 border-amber-700 text-amber-300',
  pink:    'bg-pink-900/40 border-pink-700 text-pink-300',
  emerald: 'bg-emerald-900/40 border-emerald-700 text-emerald-300',
  sky:     'bg-sky-900/40 border-sky-700 text-sky-300',
  gray:    'bg-gray-800 border-gray-600 text-gray-300',
};

export function LogsPage() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { headers } = useAuth();

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50', search, filter });
      const res = await fetch(`/api/logs/system?${params}`, {
        headers,
      });
      const data = await res.json();
      setLogs(data.logs ?? []);
      setTotalPages(data.totalPages ?? 1);
      setTotal(data.total ?? 0);
    } catch {
      setLogs([]);
    }
    setLoading(false);
  }, [page, search, filter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => { setPage(1); }, [search, filter]);

  const levelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warn': return 'text-yellow-400';
      case 'info': return 'text-green-400';
      default: return 'text-green-600';
    }
  };

  const levelBg = (level: string) => {
    switch (level) {
      case 'error': return 'bg-red-950/30';
      case 'warn': return 'bg-yellow-950/20';
      default: return '';
    }
  };

  return (
    <div className="bg-gray-950 rounded-xl border border-green-900/50 shadow-2xl shadow-green-900/10 overflow-hidden flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="bg-black/80 border-b border-green-900/50 px-5 py-3 flex items-center gap-4 shrink-0">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <div className="w-3 h-3 rounded-full bg-green-500" />
        </div>
        <span className="text-green-500 font-mono text-sm">me-club-bot ~ system logs</span>
      </div>

      {/* Controls (sticky top) */}
      <div className="px-4 pt-4 pb-2 bg-gray-950 shrink-0 space-y-3">
        <div className="flex gap-3 items-center">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search messages, context (tg id, order ref, plan, ...)"
            className="flex-1 bg-black/50 border border-green-800 rounded px-3 py-2 text-green-300 text-sm placeholder-green-700 focus:outline-none focus:border-green-500"
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-black/50 border border-green-800 rounded px-3 py-2 text-green-300 text-sm focus:outline-none focus:border-green-500"
          >
            <option value="all">All levels</option>
            <option value="info">INFO</option>
            <option value="warn">WARN</option>
            <option value="error">ERROR</option>
          </select>
          <button
            onClick={fetchLogs}
            className="px-3 py-2 bg-green-900/50 border border-green-700 rounded text-green-400 text-sm hover:bg-green-800/50 transition-colors cursor-pointer"
          >
            Refresh
          </button>
        </div>
        <div className="text-green-600 text-xs font-mono">
          {total} records found | page {page}/{totalPages}
        </div>
      </div>

      {/* Log entries (scrollable) */}
      <div className="flex-1 overflow-y-auto px-4 pb-2 font-mono text-sm min-h-0">
        {loading ? (
          <div className="text-green-600 animate-pulse py-4 text-center">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="text-green-700 py-4 text-center">No logs found</div>
        ) : (
          <div className="space-y-0.5">
            {logs.map((log) => {
              const badges = extractBadges(log.context);
              const isExpanded = expandedId === log.id;
              return (
                <div key={log.id}>
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    className={`flex flex-wrap gap-2 px-2 py-1 hover:bg-green-950/50 rounded cursor-pointer transition-colors ${levelBg(log.level)}`}
                  >
                    <span className="text-green-700 shrink-0 w-36">{formatTime(log.created_at)}</span>
                    <span className={`shrink-0 w-14 font-bold uppercase ${levelColor(log.level)}`}>
                      [{log.level}]
                    </span>
                    <span className={`flex-1 min-w-0 text-green-300 ${isExpanded ? 'whitespace-pre-wrap break-all' : 'truncate'}`}>
                      {log.message}
                    </span>
                    {badges.length > 0 && (
                      <span className="flex flex-wrap gap-1 shrink-0">
                        {badges.map((b, i) => (
                          <span
                            key={i}
                            className={`px-1.5 py-0.5 text-[11px] leading-tight rounded border ${BADGE_COLORS[b.color] ?? BADGE_COLORS.gray}`}
                            title={`${b.label}: ${b.value}`}
                          >
                            <span className="opacity-60">{b.label}:</span>{b.value}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  {isExpanded && log.context && (
                    <pre className="ml-52 px-2 py-1 text-xs text-green-600 whitespace-pre-wrap break-all">
                      {JSON.stringify(log.context, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination (sticky bottom) */}
      {totalPages > 1 && (
        <div className="flex gap-2 justify-center py-3 border-t border-green-900/50 bg-gray-950 shrink-0">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1 bg-green-900/30 border border-green-800 rounded text-green-500 text-xs disabled:opacity-30 hover:bg-green-800/50 cursor-pointer disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 bg-green-900/30 border border-green-800 rounded text-green-500 text-xs disabled:opacity-30 hover:bg-green-800/50 cursor-pointer disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
