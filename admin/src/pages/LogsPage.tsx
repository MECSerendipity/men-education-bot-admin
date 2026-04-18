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
    <div className="bg-gray-950 rounded-xl border border-green-900/50 shadow-2xl shadow-green-900/10 overflow-hidden">
      {/* Header */}
      <div className="bg-black/80 border-b border-green-900/50 px-5 py-3 flex items-center gap-4">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <div className="w-3 h-3 rounded-full bg-green-500" />
        </div>
        <span className="text-green-500 font-mono text-sm">me-club-bot ~ system logs</span>
      </div>

      {/* Content */}
      <div className="p-4 min-h-[600px] bg-gray-950">
        <div className="space-y-3">
          {/* Controls */}
          <div className="flex gap-3 items-center">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search messages, context..."
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

          {/* Stats bar */}
          <div className="text-green-600 text-xs font-mono">
            {total} records found | page {page}/{totalPages}
          </div>

          {/* Log entries */}
          <div className="space-y-0.5 font-mono text-sm">
            {loading ? (
              <div className="text-green-600 animate-pulse py-4 text-center">Loading...</div>
            ) : logs.length === 0 ? (
              <div className="text-green-700 py-4 text-center">No logs found</div>
            ) : logs.map((log) => (
              <div key={log.id}>
                <div
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  className={`flex gap-2 px-2 py-1 hover:bg-green-950/50 rounded cursor-pointer transition-colors ${levelBg(log.level)}`}
                >
                  <span className="text-green-700 shrink-0 w-36">{formatTime(log.created_at)}</span>
                  <span className={`shrink-0 w-14 font-bold uppercase ${levelColor(log.level)}`}>
                    [{log.level}]
                  </span>
                  <span className={`${expandedId === log.id ? 'whitespace-pre-wrap break-all' : 'truncate'} text-green-300`}>
                    {log.message}
                  </span>
                </div>
                {expandedId === log.id && log.context && (
                  <pre className="ml-52 px-2 py-1 text-xs text-green-600 whitespace-pre-wrap break-all">
                    {JSON.stringify(log.context, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex gap-2 justify-center pt-2">
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
      </div>
    </div>
  );
}
