import { useState, useEffect, useCallback } from 'react';
import { formatDateTime } from '../utils/format';
import { SearchIcon } from '../components/Icons';
import { Pagination } from '../components/Pagination';
import { InfoTooltip } from '../components/Tooltip';
import { useAuth } from '../hooks/useAuth';

type Tab = 'referrals' | 'transactions' | 'balances' | 'config';

/* ─── Types ─── */

interface Referral {
  id: number;
  referrer_id: number;
  referred_id: number;
  status: string;
  created_at: string;
  activated_at: string | null;
  churned_at: string | null;
  referrer_username: string | null;
  referrer_first_name: string | null;
  referred_username: string | null;
  referred_first_name: string | null;
}

interface PartnerTx {
  id: number;
  partner_id: number;
  referred_id: number | null;
  transaction_id: number | null;
  type: string;
  amount: number;
  currency: string;
  percentage: number | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  partner_username: string | null;
  partner_first_name: string | null;
  referred_username: string | null;
  referred_first_name: string | null;
}

interface Partner {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  ref_code: string | null;
  partner_balance_uah: number;
  partner_balance_usdt: number;
  referral_count: number;
}

interface PartnerConfig {
  first_enabled: string;
  first_percent: string;
  recurring_enabled: string;
  recurring_percent: string;
  min_withdrawal_uah: string;
  min_withdrawal_usdt: string;
}

/* ─── Helpers ─── */

function displayName(username: string | null, firstName: string | null, id?: number): string {
  if (username) return `@${username}`;
  if (firstName) return firstName;
  return id ? String(id) : '-';
}

const STATUS_STYLES: Record<string, string> = {
  clicked: 'bg-yellow-100 text-yellow-700',
  active: 'bg-green-100 text-green-700',
  churned: 'bg-red-100 text-red-700',
  completed: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

const REFERRAL_FILTER_TOOLTIPS: Record<string, string> = {
  clicked: 'Юзер перейшов за посиланням, але ще не оплатив підписку.',
  active: 'Юзер оплатив підписку. Партнер отримує комісію з кожної оплати.',
  churned: 'Юзера кікнули з клубу. Ланцюг комісій розірвано назавжди.',
};

const TX_FILTER_TOOLTIPS: Record<string, string> = {
  earnings: 'Нарахування комісій партнерам (перша оплата + автопродовження).',
  withdrawals: 'Всі запити на виведення коштів (pending + approved + rejected).',
  pending: 'Запити на виведення, що очікують підтвердження адміна.',
  rejected: 'Запити на виведення, відхилені адміном.',
};

/* ─── Referrals Tab ─── */

function ReferralsTab() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [counts, setCounts] = useState({ all: 0, clicked: 0, active: 0, churned: 0 });
  const [loading, setLoading] = useState(true);
  const { headers } = useAuth();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10', filter });
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/partners/referrals?${params}`, { headers });
      const data = await res.json();
      setReferrals(data.referrals ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      if (data.counts) setCounts(data.counts);
    } catch { setReferrals([]); }
    setLoading(false);
  }, [page, search, filter]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [search, filter]);

  type ReferralFilter = 'all' | 'clicked' | 'active' | 'churned';
  const filterButtons: { key: ReferralFilter; label: string }[] = [
    { key: 'all', label: `All (${counts.all})` },
    { key: 'clicked', label: `Clicked (${counts.clicked})` },
    { key: 'active', label: `Active (${counts.active})` },
    { key: 'churned', label: `Churned (${counts.churned})` },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="relative mb-2">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <SearchIcon />
        </div>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by Telegram ID or username..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors" />
      </div>

      {/* Filter buttons */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        {filterButtons.map(btn => (
          <div key={btn.key} className="relative">
            <button onClick={() => setFilter(btn.key)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md cursor-pointer transition-colors inline-flex items-center gap-1.5 ${
                filter === btn.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {btn.key !== 'all' && REFERRAL_FILTER_TOOLTIPS[btn.key] && (
                <InfoTooltip content={REFERRAL_FILTER_TOOLTIPS[btn.key]} />
              )}
              {btn.label}
            </button>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : referrals.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 font-medium">No referrals found</p>
          {search && <p className="text-gray-400 text-sm mt-1">No referrals matching "<span className="font-medium">{search}</span>"</p>}
        </div>
      ) : (
        <>
          <div className="overflow-auto border border-gray-200 rounded-lg flex-1 min-h-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Referrer</th>
                  <th className="px-4 py-3 font-medium">Referred</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Clicked</th>
                  <th className="px-4 py-3 font-medium">Activated</th>
                  <th className="px-4 py-3 font-medium">Churned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {referrals.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-700">{displayName(r.referrer_username, r.referrer_first_name, r.referrer_id)}</td>
                    <td className="px-4 py-3 text-gray-700">{displayName(r.referred_username, r.referred_first_name, r.referred_id)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[r.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDateTime(r.created_at)}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDateTime(r.activated_at)}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDateTime(r.churned_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {referrals.length > 0 && (
        <Pagination page={page} totalPages={totalPages} setPage={setPage} />
      )}
    </div>
  );
}

/* ─── Transactions Tab ─── */

function TransactionsTab() {
  const [txs, setTxs] = useState<PartnerTx[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const { headers } = useAuth();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10', filter });
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/partners/transactions?${params}`, { headers });
      const data = await res.json();
      setTxs(data.transactions ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch { setTxs([]); }
    setLoading(false);
  }, [page, search, filter]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [search, filter]);

  const TYPE_LABELS: Record<string, string> = {
    earning_first: 'First commission',
    earning_recurring: 'Recurring',
    withdrawal: 'Withdrawal',
  };

  type TxFilter = 'all' | 'earnings' | 'withdrawals' | 'pending' | 'rejected';
  const filterButtons: { key: TxFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'earnings', label: 'Earnings' },
    { key: 'withdrawals', label: 'Withdrawals' },
    { key: 'pending', label: 'Pending' },
    { key: 'rejected', label: 'Rejected' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="relative mb-2">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <SearchIcon />
        </div>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by Telegram ID or username..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors" />
      </div>

      {/* Filter buttons */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        {filterButtons.map(btn => (
          <div key={btn.key} className="relative">
            <button onClick={() => setFilter(btn.key)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md cursor-pointer transition-colors inline-flex items-center gap-1.5 ${
                filter === btn.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {btn.key !== 'all' && TX_FILTER_TOOLTIPS[btn.key] && (
                <InfoTooltip content={TX_FILTER_TOOLTIPS[btn.key]} />
              )}
              {btn.label}
            </button>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : txs.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 font-medium">No transactions found</p>
          {search && <p className="text-gray-400 text-sm mt-1">No transactions matching "<span className="font-medium">{search}</span>"</p>}
        </div>
      ) : (
        <>
          <div className="overflow-auto border border-gray-200 rounded-lg flex-1 min-h-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Partner</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Referred</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium text-right">%</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {txs.map(tx => (
                  <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-700">{displayName(tx.partner_username, tx.partner_first_name, tx.partner_id)}</td>
                    <td className="px-4 py-3 text-gray-700">{TYPE_LABELS[tx.type] ?? tx.type}</td>
                    <td className="px-4 py-3 text-gray-700">{tx.referred_id ? displayName(tx.referred_username, tx.referred_first_name, tx.referred_id) : '-'}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{Number(tx.amount).toFixed(2)} {tx.currency}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{tx.percentage != null ? `${tx.percentage}%` : '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[tx.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDateTime(tx.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {txs.length > 0 && (
        <Pagination page={page} totalPages={totalPages} setPage={setPage} />
      )}
    </div>
  );
}

/* ─── Balances Tab ─── */

function BalancesTab() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const { headers } = useAuth();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/partners/balances?${params}`, { headers });
      const data = await res.json();
      setPartners(data.partners ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch { setPartners([]); }
    setLoading(false);
  }, [page, search]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [search]);

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="relative mb-3">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <SearchIcon />
        </div>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by Telegram ID or username..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors" />
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : partners.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 font-medium">No partners found</p>
          {search && <p className="text-gray-400 text-sm mt-1">No partners matching "<span className="font-medium">{search}</span>"</p>}
        </div>
      ) : (
        <>
          <div className="overflow-auto border border-gray-200 rounded-lg flex-1 min-h-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Telegram ID</th>
                  <th className="px-4 py-3 font-medium">Username</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Ref Code</th>
                  <th className="px-4 py-3 font-medium text-right">Referrals</th>
                  <th className="px-4 py-3 font-medium text-right">Balance UAH</th>
                  <th className="px-4 py-3 font-medium text-right">Balance USDT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {partners.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-gray-700">{p.telegram_id}</td>
                    <td className="px-4 py-3 text-gray-700">{p.username ? `@${p.username}` : '-'}</td>
                    <td className="px-4 py-3 text-gray-700">{p.first_name ?? '-'}</td>
                    <td className="px-4 py-3 font-mono text-gray-400">{p.ref_code ?? '-'}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{p.referral_count}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{Number(p.partner_balance_uah).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{Number(p.partner_balance_usdt).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {partners.length > 0 && (
        <Pagination page={page} totalPages={totalPages} setPage={setPage} />
      )}
    </div>
  );
}

/* ─── Config Tab ─── */

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange}
      className={`relative inline-flex h-7 w-12 items-center rounded-full cursor-pointer transition-colors ${enabled ? 'bg-teal-500' : 'bg-gray-300'}`}>
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function ConfigTab() {
  const [config, setConfig] = useState<PartnerConfig | null>(null);
  const [draft, setDraft] = useState<PartnerConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { headers } = useAuth();

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/partners/config', { headers });
      const data = await res.json();
      setConfig(data);
      setDraft(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const validate = (): boolean => {
    if (!draft) return false;
    const errs: Record<string, string> = {};

    const firstPct = Number(draft.first_percent);
    if (draft.first_enabled === 'true' && (isNaN(firstPct) || firstPct < 1 || firstPct > 99)) {
      errs.first_percent = 'Must be between 1% and 99%';
    }

    const recurPct = Number(draft.recurring_percent);
    if (draft.recurring_enabled === 'true' && (isNaN(recurPct) || recurPct < 1 || recurPct > 99)) {
      errs.recurring_percent = 'Must be between 1% and 99%';
    }

    const minUah = Number(draft.min_withdrawal_uah);
    if (isNaN(minUah) || minUah < 1) {
      errs.min_withdrawal_uah = 'Must be at least 1';
    }

    const minUsdt = Number(draft.min_withdrawal_usdt);
    if (isNaN(minUsdt) || minUsdt < 1) {
      errs.min_withdrawal_usdt = 'Must be at least 1';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    if (!draft) return;
    setSaving(true);
    try {
      await fetch('/api/partners/config', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      setConfig(draft);
      setErrors({});
    } catch { /* ignore */ }
    setSaving(false);
  };

  const cancel = () => {
    if (config) setDraft({ ...config });
    setErrors({});
  };

  /** Only allow digits (and optionally one dot for decimals) */
  const handleNumericInput = (field: keyof PartnerConfig, value: string) => {
    const clean = value.replace(/[^0-9.]/g, '');
    if (!draft) return;
    setDraft({ ...draft, [field]: clean });
  };

  const hasChanges = config && draft && JSON.stringify(config) !== JSON.stringify(draft);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!draft) return <p className="text-gray-500">Failed to load config</p>;

  const firstEnabled = draft.first_enabled === 'true';
  const recurringEnabled = draft.recurring_enabled === 'true';

  const inputClass = (field: string) =>
    `w-20 border rounded-lg px-3 py-1.5 text-sm text-center transition-colors ${
      errors[field]
        ? 'border-red-400 focus:outline-none focus:ring-2 focus:ring-red-400'
        : 'border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent'
    }`;

  const inputClassWide = (field: string) =>
    `w-24 border rounded-lg px-3 py-1.5 text-sm text-center transition-colors ${
      errors[field]
        ? 'border-red-400 focus:outline-none focus:ring-2 focus:ring-red-400'
        : 'border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent'
    }`;

  return (
    <div className="max-w-xl">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">Commission Settings</h3>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* First payment commission */}
          <div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">First payment commission</p>
                <p className="text-xs text-gray-500 mt-0.5">Commission from the first payment of a referred user</p>
              </div>
              <Toggle enabled={firstEnabled}
                onChange={() => setDraft({ ...draft, first_enabled: firstEnabled ? 'false' : 'true' })} />
            </div>
            {firstEnabled && (
              <div className="mt-3">
                <div className="flex items-center gap-2">
                  <input type="text" inputMode="numeric" value={draft.first_percent}
                    onChange={e => handleNumericInput('first_percent', e.target.value)}
                    className={inputClass('first_percent')} />
                  <span className="text-sm text-gray-500">%</span>
                </div>
                {errors.first_percent && (
                  <p className="text-xs text-red-500 mt-1">{errors.first_percent}</p>
                )}
              </div>
            )}
          </div>

          <hr className="border-gray-100" />

          {/* Recurring commission */}
          <div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">Recurring commission</p>
                <p className="text-xs text-gray-500 mt-0.5">Commission from auto-renewals of referred users</p>
              </div>
              <Toggle enabled={recurringEnabled}
                onChange={() => setDraft({ ...draft, recurring_enabled: recurringEnabled ? 'false' : 'true' })} />
            </div>
            {recurringEnabled && (
              <div className="mt-3">
                <div className="flex items-center gap-2">
                  <input type="text" inputMode="numeric" value={draft.recurring_percent}
                    onChange={e => handleNumericInput('recurring_percent', e.target.value)}
                    className={inputClass('recurring_percent')} />
                  <span className="text-sm text-gray-500">%</span>
                </div>
                {errors.recurring_percent && (
                  <p className="text-xs text-red-500 mt-1">{errors.recurring_percent}</p>
                )}
              </div>
            )}
          </div>

          <hr className="border-gray-100" />

          {/* Min withdrawal */}
          <div>
            <p className="text-sm font-semibold text-gray-900 mb-3">Minimum withdrawal</p>
            <div className="flex gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <input type="text" inputMode="numeric" value={draft.min_withdrawal_uah}
                    onChange={e => handleNumericInput('min_withdrawal_uah', e.target.value)}
                    className={inputClassWide('min_withdrawal_uah')} />
                  <span className="text-sm text-gray-500">UAH</span>
                </div>
                {errors.min_withdrawal_uah && (
                  <p className="text-xs text-red-500 mt-1">{errors.min_withdrawal_uah}</p>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <input type="text" inputMode="numeric" value={draft.min_withdrawal_usdt}
                    onChange={e => handleNumericInput('min_withdrawal_usdt', e.target.value)}
                    className={inputClassWide('min_withdrawal_usdt')} />
                  <span className="text-sm text-gray-500">USDT</span>
                </div>
                {errors.min_withdrawal_usdt && (
                  <p className="text-xs text-red-500 mt-1">{errors.min_withdrawal_usdt}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer buttons */}
        {hasChanges && (
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
            <button onClick={cancel}
              className="px-5 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200 transition-colors">
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              className="px-5 py-2 text-sm font-medium text-white bg-teal-500 rounded-lg cursor-pointer hover:bg-teal-600 transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ─── */

const TABS: { id: Tab; label: string }[] = [
  { id: 'referrals', label: 'Referrals' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'balances', label: 'Balances' },
  { id: 'config', label: 'Settings' },
];

export function PartnersPage() {
  const [tab, setTab] = useState<Tab>('referrals');

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-900">Partners</h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium cursor-pointer transition-colors ${
              tab === t.id
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {tab === 'referrals' && <ReferralsTab />}
        {tab === 'transactions' && <TransactionsTab />}
        {tab === 'balances' && <BalancesTab />}
        {tab === 'config' && <ConfigTab />}
      </div>
    </div>
  );
}
