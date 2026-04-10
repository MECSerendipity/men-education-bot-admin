import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';

/* ---------- Types ---------- */

interface Statistics {
  users: {
    total: number;
    newPeriod: number;
    activeSubscribers: number;
    conversionRate: number;
  };
  revenue: {
    totalUah: number;
    totalUsdt: number;
    avgCheckUah: number;
    avgCheckUsdt: number;
    approvedCount: number;
    declinedCount: number;
    successRate: number;
  };
  subscriptions: {
    active: number;
    expired: number;
    cancelled: number;
    byPlan: Record<string, number>;
    byMethod: { card: number; crypto: number };
    newPeriod: number;
    renewals: number;
    firstPayments: number;
    churn: number;
  };
}

type PeriodKey = 'today' | 'week' | 'month' | 'all' | 'custom';

/* ---------- Helpers ---------- */

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Format date as YYYY-MM-DD in local timezone */
function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getPeriodDates(key: PeriodKey): { from?: string; to?: string } {
  const today = new Date();
  const todayStr = toDateStr(today);
  switch (key) {
    case 'today':
      return { from: todayStr, to: todayStr };
    case 'week': {
      const w = new Date(today);
      w.setDate(w.getDate() - 7);
      return { from: toDateStr(w), to: todayStr };
    }
    case 'month': {
      const m = new Date(today);
      m.setDate(m.getDate() - 30);
      return { from: toDateStr(m), to: todayStr };
    }
    case 'all':
      return {};
    default:
      return {};
  }
}

const PLAN_LABELS: Record<string, string> = {
  card_1m: 'Card 1m',
  card_6m: 'Card 6m',
  card_12m: 'Card 12m',
  crypto_1m: 'Crypto 1m',
  crypto_6m: 'Crypto 6m',
  crypto_12m: 'Crypto 12m',
};

const PERIOD_LABELS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Сьогодні' },
  { key: 'week', label: 'Тиждень' },
  { key: 'month', label: 'Місяць' },
  { key: 'all', label: 'Весь час' },
  { key: 'custom', label: 'Кастомний' },
];

/* ---------- Small components ---------- */

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-900">{value}</span>
    </div>
  );
}

function Badge({ label, count, color }: { label: string; count: number; color: string }) {
  const colorClasses: Record<string, string> = {
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    gray: 'bg-gray-100 text-gray-700',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${colorClasses[color] ?? colorClasses.gray}`}>
      {label}
      <span className="font-bold">{fmt(count)}</span>
    </span>
  );
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const colorClasses: Record<string, string> = {
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    indigo: 'bg-indigo-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
    teal: 'bg-teal-500',
  };
  return (
    <div className="w-full bg-gray-100 rounded-full h-2">
      <div className={`h-2 rounded-full ${colorClasses[color] ?? 'bg-gray-500'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold text-gray-900 mb-3">{children}</h3>;
}

/* ---------- Main component ---------- */

export function StatisticsPage() {
  const [data, setData] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const { headers } = useAuth();

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let dates: { from?: string; to?: string };
      if (period === 'custom') {
        dates = {};
        if (customFrom) dates.from = customFrom;
        if (customTo) dates.to = customTo;
      } else {
        dates = getPeriodDates(period);
      }

      const params = new URLSearchParams();
      if (dates.from) params.set('from', dates.from);
      if (dates.to) params.set('to', dates.to);

      const url = `/api/statistics${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error('Failed to load statistics');
      const json: Statistics = await res.json();
      setData(json);
    } catch {
      setError('Failed to load statistics. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [headers, period, customFrom, customTo]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  /* ---------- Period label for display ---------- */
  function periodLabel(): string {
    switch (period) {
      case 'today': return 'за сьогодні';
      case 'week': return 'за тиждень';
      case 'month': return 'за місяць';
      case 'all': return 'за весь час';
      case 'custom': {
        if (customFrom && customTo) return `${customFrom} - ${customTo}`;
        if (customFrom) return `з ${customFrom}`;
        if (customTo) return `до ${customTo}`;
        return 'за весь час';
      }
    }
  }

  /* ---------- Loading / Error states ---------- */

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="text-center py-20">
        <p className="text-red-600 mb-4">{error}</p>
        <button onClick={fetchStats} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition-colors cursor-pointer">
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { users, revenue, subscriptions } = data;

  const planColors = ['green', 'blue', 'indigo', 'purple', 'orange', 'teal'];
  const maxPlan = Math.max(...Object.values(subscriptions.byPlan), 1);
  const methodTotal = subscriptions.byMethod.card + subscriptions.byMethod.crypto;

  return (
    <div className="overflow-y-auto h-full -mx-1 px-1 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-900">Statistics</h2>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Period filter */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {PERIOD_LABELS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg cursor-pointer transition-colors ${
              period === p.key
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {p.label}
          </button>
        ))}

        {/* Custom date inputs */}
        {period === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-400 text-sm">-</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
      </div>

      {/* Top row — 4 key stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Всього юзерів" value={fmt(users.total)} sub={`+${fmt(users.newPeriod)} ${periodLabel()}`} />
        <StatCard label="Активних підписників" value={fmt(users.activeSubscribers)} sub={`${users.conversionRate}% конверсія`} />
        <StatCard label="Дохід UAH" value={`${fmt(revenue.totalUah, 2)} UAH`} sub={`середній чек ${fmt(revenue.avgCheckUah, 2)} UAH`} />
        <StatCard label="Дохід USDT" value={`${fmt(revenue.totalUsdt, 2)} USDT`} sub={`середній чек ${fmt(revenue.avgCheckUsdt, 2)} USDT`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Users section */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <SectionTitle>Юзери</SectionTitle>
          <MiniStat label={`Нових ${periodLabel()}`} value={fmt(users.newPeriod)} />
          <div className="border-t border-gray-100 mt-3 pt-3">
            <MiniStat label="Активних підписників" value={fmt(users.activeSubscribers)} />
            <MiniStat label="Конверсія" value={`${users.conversionRate}%`} />
          </div>
        </div>

        {/* Revenue section */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <SectionTitle>Дохід</SectionTitle>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">UAH</p>
          <MiniStat label={periodLabel()} value={`${fmt(revenue.totalUah, 2)}`} />
          <MiniStat label="Середній чек" value={`${fmt(revenue.avgCheckUah, 2)}`} />
          <div className="border-t border-gray-100 mt-3 pt-3 mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">USDT</p>
            <MiniStat label={periodLabel()} value={`${fmt(revenue.totalUsdt, 2)}`} />
            <MiniStat label="Середній чек" value={`${fmt(revenue.avgCheckUsdt, 2)}`} />
          </div>
          <div className="border-t border-gray-100 pt-3">
            <MiniStat label="Успішних транзакцій" value={fmt(revenue.approvedCount)} />
            <MiniStat label="Відхилених транзакцій" value={fmt(revenue.declinedCount)} />
            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm text-gray-500">Успішність</span>
              <div className="flex-1">
                <ProgressBar value={revenue.successRate} max={100} color="green" />
              </div>
              <span className="text-sm font-semibold text-gray-900">{revenue.successRate}%</span>
            </div>
          </div>
        </div>

        {/* Subscriptions section */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <SectionTitle>Підписки</SectionTitle>
          <div className="flex flex-wrap gap-2 mb-4">
            <Badge label="Active" count={subscriptions.active} color="green" />
            <Badge label="Expired" count={subscriptions.expired} color="red" />
            <Badge label="Cancelled" count={subscriptions.cancelled} color="gray" />
          </div>

          {/* Plan distribution */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">По тарифу (активні)</p>
          <div className="space-y-2 mb-4">
            {Object.entries(subscriptions.byPlan).map(([plan, count], i) => (
              <div key={plan}>
                <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                  <span>{PLAN_LABELS[plan] ?? plan}</span>
                  <span className="font-semibold">{count}</span>
                </div>
                <ProgressBar value={count} max={maxPlan} color={planColors[i % planColors.length]} />
              </div>
            ))}
          </div>

          {/* Method distribution */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">По методу (активні)</p>
          <div className="flex gap-4 mb-4">
            <div className="flex-1 bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-blue-700">{subscriptions.byMethod.card}</p>
              <p className="text-xs text-blue-500">Card {methodTotal > 0 ? `(${Math.round((subscriptions.byMethod.card / methodTotal) * 100)}%)` : ''}</p>
            </div>
            <div className="flex-1 bg-purple-50 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-purple-700">{subscriptions.byMethod.crypto}</p>
              <p className="text-xs text-purple-500">Crypto {methodTotal > 0 ? `(${Math.round((subscriptions.byMethod.crypto / methodTotal) * 100)}%)` : ''}</p>
            </div>
          </div>

          {/* Events */}
          <div className="border-t border-gray-100 pt-3">
            <MiniStat label={`Нових ${periodLabel()}`} value={fmt(subscriptions.newPeriod)} />
            <MiniStat label={`Продовжень ${periodLabel()}`} value={fmt(subscriptions.renewals)} />
            <MiniStat label={`Перших оплат ${periodLabel()}`} value={fmt(subscriptions.firstPayments)} />
            <MiniStat label={`Churn ${periodLabel()}`} value={fmt(subscriptions.churn)} />
          </div>
        </div>
      </div>
    </div>
  );
}
