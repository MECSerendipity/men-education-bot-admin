import { useState, useEffect, useCallback } from 'react';

interface PriceRow {
  key: string;
  amount: string;
  currency: string;
  days: number;
}

interface PriceOffer {
  id: number;
  telegram_id: string;
  key: string;
  amount: string;
  currency: string;
  days: number;
  created_at: string;
}

/** Friendly plan name */
function planName(key: string): string {
  const names: Record<string, string> = {
    card_1m: '1 місяць',
    card_6m: '6 місяців',
    card_12m: '12 місяців',
    crypto_1m: '1 місяць',
    crypto_6m: '6 місяців',
    crypto_12m: '12 місяців',
  };
  return names[key] ?? key;
}

/** Payment method badge */
function MethodBadge({ planKey }: { planKey: string }) {
  const isCard = planKey.startsWith('card_');
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
      isCard ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
    }`}>
      {isCard ? '💳 Картка' : '⚡ Крипто'}
    </span>
  );
}

/** Editable price cell */
function PriceCell({
  price,
  onSave,
}: {
  price: PriceRow;
  onSave: (key: string, amount: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(price.amount);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) return;
    setSaving(true);
    try {
      await onSave(price.key, num);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setValue(price.amount);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') handleCancel();
          }}
          className="w-28 px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
        <span className="text-sm text-gray-500">{price.currency}</span>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
        >
          {saving ? '...' : '✓'}
        </button>
        <button
          onClick={handleCancel}
          className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 cursor-pointer"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-left group cursor-pointer"
      title="Click to edit"
    >
      <span className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
        {Number(price.amount).toLocaleString()}
      </span>
      <span className="ml-1.5 text-sm text-gray-500">{price.currency}</span>
      <span className="ml-2 text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
        edit
      </span>
    </button>
  );
}

/** Refresh icon */
function RefreshIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round"
            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M20.016 4.356v4.992" />
    </svg>
  );
}

export function PricesPage() {
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [offers, setOffers] = useState<PriceOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'global' | 'offers'>('global');

  // New offer form
  const [newTelegramId, setNewTelegramId] = useState('');
  const [creatingOffer, setCreatingOffer] = useState(false);

  const token = localStorage.getItem('admin_token');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [pricesRes, offersRes] = await Promise.all([
        fetch('/api/prices', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/prices/offers', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (!pricesRes.ok) throw new Error('Failed to load prices');
      if (!offersRes.ok) throw new Error('Failed to load offers');
      setPrices(await pricesRes.json());
      setOffers(await offersRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /** Update a global price */
  async function handleSavePrice(key: string, amount: number) {
    const res = await fetch(`/api/prices/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount }),
    });
    if (!res.ok) throw new Error('Failed to save');
    setPrices((prev) => prev.map((p) => p.key === key ? { ...p, amount: String(amount) } : p));
  }

  /** Create offers for a user (copies current global prices) */
  async function handleCreateOffer() {
    if (!newTelegramId.trim()) return;
    setCreatingOffer(true);
    try {
      const res = await fetch('/api/prices/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ telegram_id: newTelegramId.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create offer');
      }
      setNewTelegramId('');
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    } finally {
      setCreatingOffer(false);
    }
  }

  /** Update an offer price */
  async function handleSaveOffer(id: number, amount: number) {
    const res = await fetch(`/api/prices/offers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount }),
    });
    if (!res.ok) throw new Error('Failed to save');
    setOffers((prev) => prev.map((o) => o.id === id ? { ...o, amount: String(amount) } : o));
  }

  /** Delete all offers for a user */
  async function handleDeleteOffers(telegramId: string) {
    if (!confirm(`Видалити всі пропозиції для ${telegramId}?`)) return;
    const res = await fetch(`/api/prices/offers/user/${telegramId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to delete');
    setOffers((prev) => prev.filter((o) => o.telegram_id !== telegramId));
  }

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  // Group card and crypto prices
  const cardPrices = prices.filter((p) => p.key.startsWith('card_'));
  const cryptoPrices = prices.filter((p) => p.key.startsWith('crypto_'));

  // Group offers by telegram_id
  const offersByUser = offers.reduce<Record<string, PriceOffer[]>>((acc, o) => {
    (acc[o.telegram_id] ??= []).push(o);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Prices</h2>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600
                     bg-gray-100 rounded-md hover:bg-gray-200 cursor-pointer transition-colors"
        >
          <RefreshIcon />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab('global')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
            tab === 'global' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Глобальні ціни
        </button>
        <button
          onClick={() => setTab('offers')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
            tab === 'offers' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Персональні пропозиції
          {Object.keys(offersByUser).length > 0 && (
            <span className="ml-2 bg-orange-100 text-orange-700 text-xs px-1.5 py-0.5 rounded-full">
              {Object.keys(offersByUser).length}
            </span>
          )}
        </button>
      </div>

      {tab === 'global' && (
        <div className="space-y-6">
          <p className="text-sm text-gray-500">
            Ціни для всіх нових юзерів та тих, хто не має підписки. Натисніть на ціну щоб змінити.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Card prices */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
                <h3 className="font-semibold text-blue-800">💳 Картка (UAH)</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {cardPrices.map((p) => (
                  <div key={p.key} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-gray-700">{planName(p.key)}</span>
                      <span className="text-xs text-gray-400 ml-2">{p.days} днів</span>
                    </div>
                    <PriceCell price={p} onSave={handleSavePrice} />
                  </div>
                ))}
              </div>
            </div>

            {/* Crypto prices */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-orange-50 border-b border-orange-100">
                <h3 className="font-semibold text-orange-800">⚡ Крипто (USDT)</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {cryptoPrices.map((p) => (
                  <div key={p.key} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-gray-700">{planName(p.key)}</span>
                      <span className="text-xs text-gray-400 ml-2">{p.days} днів</span>
                    </div>
                    <PriceCell price={p} onSave={handleSavePrice} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'offers' && (
        <div className="space-y-6">
          <p className="text-sm text-gray-500">
            Персональні ціни для конкретних юзерів. Видаляються автоматично після оплати.
          </p>

          {/* Create offer form */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Створити пропозицію</h3>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={newTelegramId}
                onChange={(e) => setNewTelegramId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateOffer()}
                placeholder="Telegram ID юзера"
                className="w-64 px-3 py-2 text-sm border border-gray-300 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handleCreateOffer}
                disabled={creatingOffer || !newTelegramId.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg
                           hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {creatingOffer ? 'Створюю...' : 'Створити'}
              </button>
              <span className="text-xs text-gray-400">Скопіює поточні глобальні ціни для редагування</span>
            </div>
          </div>

          {/* Offers list */}
          {Object.keys(offersByUser).length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400 text-sm">Немає персональних пропозицій</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(offersByUser).map(([telegramId, userOffers]) => (
                <div key={telegramId} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-gray-800">Telegram ID: </span>
                      <span className="font-mono text-sm text-gray-600">{telegramId}</span>
                      <span className="text-xs text-gray-400 ml-3">
                        створено {new Date(userOffers[0].created_at).toLocaleDateString('uk-UA')}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteOffers(telegramId)}
                      className="text-xs text-red-600 hover:text-red-800 font-medium cursor-pointer"
                    >
                      Видалити всі
                    </button>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {userOffers.map((offer) => (
                      <div key={offer.id} className="px-4 py-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <MethodBadge planKey={offer.key} />
                          <span className="text-sm text-gray-700">{planName(offer.key)}</span>
                        </div>
                        <PriceCell
                          price={{ key: offer.key, amount: offer.amount, currency: offer.currency, days: offer.days }}
                          onSave={async (_key, amount) => handleSaveOffer(offer.id, amount)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
