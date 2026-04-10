import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';

/* ─── Types ─── */

interface PriceRow {
  key: string;
  display_name: string;
  amount: string | number;
  currency: string;
  days: number;
}

interface PriceOfferRow {
  id: number;
  telegram_id: string;
  user_id: number | null;
  username: string | null;
  prices: Record<string, PriceRow>;
  created_at: string;
  updated_at: string;
}

/** Duration config for plan cards */
const DURATIONS = [
  { key: '12m', label: '12 місяців', card: 'card_12m', crypto: 'crypto_12m', accent: 'amber' },
  { key: '6m', label: '6 місяців', card: 'card_6m', crypto: 'crypto_6m', accent: 'blue' },
  { key: '1m', label: '1 місяць', card: 'card_1m', crypto: 'crypto_1m', accent: 'gray' },
] as const;

/* ─── Icons ─── */

function PencilIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round"
            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M20.016 4.356v4.992" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 01.78.72l.5 6a.75.75 0 01-1.49.12l-.5-6a.75.75 0 01.71-.84zm2.84 0a.75.75 0 01.71.84l-.5 6a.75.75 0 11-1.49-.12l.5-6a.75.75 0 01.78-.72z" clipRule="evenodd" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
    </svg>
  );
}

/* ─── Toast ─── */

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm rounded-lg shadow-lg animate-[fadeIn_0.2s_ease-out]">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-400 shrink-0">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
      </svg>
      {message}
    </div>
  );
}

/* ─── Inline Editor ─── */

function InlineEditor({
  value,
  suffix,
  type = 'text',
  onSave,
}: {
  value: string | number;
  suffix?: string;
  type?: 'text' | 'number';
  onSave: (val: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setText(String(value)); }, [value]);

  async function handleSave() {
    const trimmed = text.trim();
    if (!trimmed || trimmed === String(value)) { setEditing(false); setText(String(value)); return; }
    if (type === 'number') {
      const n = parseFloat(trimmed);
      if (isNaN(n) || n <= 0) return;
    }
    setSaving(true);
    try { await onSave(trimmed); setEditing(false); }
    catch { setText(String(value)); }
    finally { setSaving(false); }
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <input
          ref={inputRef}
          type={type}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setText(String(value)); setEditing(false); } }}
          className="w-28 px-2 py-1 text-sm border border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          autoFocus
        />
        {suffix && <span className="text-xs text-gray-400">{suffix}</span>}
        <button onClick={handleSave} disabled={saving}
          className="p-1 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 cursor-pointer">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
          </svg>
        </button>
        <button onClick={() => { setText(String(value)); setEditing(false); }}
          className="p-1 text-gray-500 bg-gray-100 rounded-md hover:bg-gray-200 cursor-pointer">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group inline-flex items-center gap-1.5 cursor-pointer"
      title="Натисніть щоб редагувати"
    >
      <span className="group-hover:text-blue-600 transition-colors">{type === 'number' ? Number(value).toLocaleString() : value}</span>
      {suffix && <span className="text-xs text-gray-400">{suffix}</span>}
      <span className="text-gray-300 group-hover:text-blue-500 transition-colors">
        <PencilIcon />
      </span>
    </button>
  );
}

/* ─── Plan Card (Global) — display only ─── */

function PlanCard({
  duration,
  cardPrice,
  cryptoPrice,
  onEdit,
}: {
  duration: typeof DURATIONS[number];
  cardPrice?: PriceRow;
  cryptoPrice?: PriceRow;
  onEdit: () => void;
}) {
  const borderColor = duration.accent === 'amber' ? 'border-amber-200' : duration.accent === 'blue' ? 'border-blue-200' : 'border-gray-200';
  const headerBg = duration.accent === 'amber' ? 'bg-amber-50' : duration.accent === 'blue' ? 'bg-blue-50' : 'bg-gray-50';
  const headerText = duration.accent === 'amber' ? 'text-amber-800' : duration.accent === 'blue' ? 'text-blue-800' : 'text-gray-700';

  const displayName = cardPrice?.display_name ?? cryptoPrice?.display_name ?? '?';

  return (
    <div className={`bg-white border ${borderColor} rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow`}>
      {/* Header */}
      <div className={`px-5 py-4 ${headerBg} border-b ${borderColor}`}>
        <div className="flex items-center justify-between">
          <h3 className={`text-lg font-bold ${headerText}`}>{duration.label}</h3>
          <span className="text-xs text-gray-400 font-mono">{cardPrice?.days ?? cryptoPrice?.days ?? '?'} днів</span>
        </div>
      </div>

      {/* Info */}
      <div className="px-5 py-4">
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Назва</div>
        <div className="text-sm font-medium text-gray-800 mb-4">{displayName}</div>

        <div className="space-y-3">
          {cardPrice && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">💳 Картка</span>
              <span className="text-sm font-semibold text-gray-800">{Number(cardPrice.amount).toLocaleString()} {cardPrice.currency}</span>
            </div>
          )}
          {cryptoPrice && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">⚡ Крипто</span>
              <span className="text-sm font-semibold text-gray-800">{Number(cryptoPrice.amount).toLocaleString()} {cryptoPrice.currency}</span>
            </div>
          )}
        </div>

        <button
          onClick={onEdit}
          className="mt-4 w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium
                     text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 cursor-pointer transition-colors"
        >
          <PencilIcon />
          Редагувати
        </button>
      </div>
    </div>
  );
}

/* ─── Plan Edit Modal ─── */

function PlanEditModal({
  duration,
  cardPrice,
  cryptoPrice,
  onSaveAmount,
  onSaveDisplayName,
  onClose,
}: {
  duration: typeof DURATIONS[number];
  cardPrice?: PriceRow;
  cryptoPrice?: PriceRow;
  onSaveAmount: (key: string, amount: number) => Promise<void>;
  onSaveDisplayName: (key: string, name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [displayName, setDisplayName] = useState(cardPrice?.display_name ?? cryptoPrice?.display_name ?? '');
  const [cardAmount, setCardAmount] = useState(String(cardPrice?.amount ?? ''));
  const [cryptoAmount, setCryptoAmount] = useState(String(cryptoPrice?.amount ?? ''));
  const [saving, setSaving] = useState(false);

  const isValidAmount = (val: string) => /^\d+(\.\d+)?$/.test(val) && parseFloat(val) > 0;

  const isValid =
    displayName.trim().length > 0 &&
    (!cardPrice || isValidAmount(cardAmount)) &&
    (!cryptoPrice || isValidAmount(cryptoAmount));

  function handleAmountInput(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (val === '' || /^\d*\.?\d*$/.test(val)) setter(val);
    };
  }

  async function handleSave() {
    if (!isValid) return;
    setSaving(true);
    try {
      const origName = cardPrice?.display_name ?? cryptoPrice?.display_name ?? '';
      if (displayName.trim() !== origName) {
        await onSaveDisplayName(cardPrice?.key ?? cryptoPrice?.key ?? '', displayName.trim());
      }
      if (cardPrice && cardAmount !== String(cardPrice.amount)) {
        await onSaveAmount(cardPrice.key, parseFloat(cardAmount));
      }
      if (cryptoPrice && cryptoAmount !== String(cryptoPrice.amount)) {
        await onSaveAmount(cryptoPrice.key, parseFloat(cryptoAmount));
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">Редагувати — {duration.label}</h3>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Display name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Назва</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={`w-full px-3 py-2.5 text-sm border rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         ${!displayName.trim() ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
              autoFocus
            />
            {!displayName.trim() && (
              <p className="text-xs text-red-500 mt-1">Назва не може бути пустою</p>
            )}
          </div>

          {/* Card price */}
          {cardPrice && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                💳 Картка ({cardPrice.currency})
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={cardAmount}
                onChange={handleAmountInput(setCardAmount)}
                className={`w-full px-3 py-2.5 text-sm border rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           ${cardAmount && !isValidAmount(cardAmount) ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
              />
              {cardAmount && !isValidAmount(cardAmount) && (
                <p className="text-xs text-red-500 mt-1">Введіть коректне число більше 0</p>
              )}
            </div>
          )}

          {/* Crypto price */}
          {cryptoPrice && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                ⚡ Крипто ({cryptoPrice.currency})
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={cryptoAmount}
                onChange={handleAmountInput(setCryptoAmount)}
                className={`w-full px-3 py-2.5 text-sm border rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           ${cryptoAmount && !isValidAmount(cryptoAmount) ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
              />
              {cryptoAmount && !isValidAmount(cryptoAmount) && (
                <p className="text-xs text-red-500 mt-1">Введіть коректне число більше 0</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 grid grid-cols-2 gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !isValid}
            className="px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg
                       hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            {saving ? 'Зберігаю...' : 'Зберегти'}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg
                       hover:bg-gray-200 disabled:opacity-50 cursor-pointer transition-colors"
          >
            Скасувати
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Offer Card — collapsible ─── */

function OfferCard({
  offer,
  globalPrices,
  onSave,
  onDelete,
}: {
  offer: PriceOfferRow;
  globalPrices: Record<string, PriceRow>;
  onSave: (telegramId: string, key: string, amount: number) => Promise<void>;
  onDelete: (telegramId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const createdDate = new Date(offer.created_at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' });

  // Summary: count how many prices differ from global
  const diffCount = DURATIONS.reduce((count, dur) => {
    const cardOffer = offer.prices[dur.card];
    const cryptoOffer = offer.prices[dur.crypto];
    const cardGlobal = globalPrices[dur.card];
    const cryptoGlobal = globalPrices[dur.crypto];
    if (cardOffer && cardGlobal && Number(cardOffer.amount) !== Number(cardGlobal.amount)) count++;
    if (cryptoOffer && cryptoGlobal && Number(cryptoOffer.amount) !== Number(cryptoGlobal.amount)) count++;
    return count;
  }, 0);

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {/* Header — always visible, clickable to expand */}
        <div
          className="px-5 py-3.5 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-9 h-9 bg-purple-100 rounded-full text-purple-600">
              <UserIcon />
            </span>
            <div>
              <div className="flex items-center gap-2">
                {offer.username ? (
                  <span className="text-sm font-semibold text-gray-800">@{offer.username}</span>
                ) : (
                  <span className="font-mono text-sm text-gray-800">{offer.telegram_id}</span>
                )}
                {offer.user_id && <span className="text-xs text-gray-400">ID: {offer.user_id}</span>}
                {diffCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-purple-100 text-purple-700 rounded">
                    {diffCount} змін
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400">
                TG: {offer.telegram_id} · створено {createdDate}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth={2}
                 className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </div>

        {/* Expanded content */}
        {expanded && (
          <div className="border-t border-gray-200">
            {/* Price summary */}
            <div className="px-5 py-4">
              <div className="space-y-2">
                {DURATIONS.map((dur) => {
                  const cardOffer = offer.prices[dur.card];
                  const cryptoOffer = offer.prices[dur.crypto];
                  const cardGlobal = globalPrices[dur.card];
                  const cryptoGlobal = globalPrices[dur.crypto];

                  return (
                    <div key={dur.key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <span className="text-sm font-medium text-gray-600">{dur.label}</span>
                      <div className="flex items-center gap-4 text-sm">
                        {cardOffer && (
                          <span className="flex items-center gap-1.5">
                            <span className="text-gray-400">💳</span>
                            <span className={`font-semibold ${cardGlobal && Number(cardOffer.amount) !== Number(cardGlobal.amount) ? 'text-purple-700' : 'text-gray-700'}`}>
                              {Number(cardOffer.amount).toLocaleString()} {cardOffer.currency}
                            </span>
                          </span>
                        )}
                        {cryptoOffer && (
                          <span className="flex items-center gap-1.5">
                            <span className="text-gray-400">⚡</span>
                            <span className={`font-semibold ${cryptoGlobal && Number(cryptoOffer.amount) !== Number(cryptoGlobal.amount) ? 'text-purple-700' : 'text-gray-700'}`}>
                              {Number(cryptoOffer.amount).toLocaleString()} {cryptoOffer.currency}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-2 mt-4">
                <button
                  onClick={() => setShowEditModal(true)}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium
                             text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100 cursor-pointer transition-colors"
                >
                  <PencilIcon />
                  Редагувати
                </button>
                <button
                  onClick={() => onDelete(offer.telegram_id)}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium
                             text-red-600 bg-red-50 rounded-lg hover:bg-red-100 cursor-pointer transition-colors"
                >
                  <TrashIcon />
                  Видалити
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <OfferEditModal
          offer={offer}
          globalPrices={globalPrices}
          onSave={onSave}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </>
  );
}

/* ─── Offer Edit Modal ─── */

function OfferEditModal({
  offer,
  globalPrices,
  onSave,
  onClose,
}: {
  offer: PriceOfferRow;
  globalPrices: Record<string, PriceRow>;
  onSave: (telegramId: string, key: string, amount: number) => Promise<void>;
  onClose: () => void;
}) {
  const buildInitial = () => {
    const result: Record<string, string> = {};
    for (const [key, val] of Object.entries(offer.prices)) result[key] = String(val.amount);
    return result;
  };

  const [editPrices, setEditPrices] = useState<Record<string, string>>(buildInitial);
  const [saving, setSaving] = useState(false);

  const isValidAmount = (val: string) => /^\d+(\.\d+)?$/.test(val) && parseFloat(val) > 0;
  const isValid = Object.values(editPrices).every((v) => isValidAmount(v));

  const hasChanges = Object.keys(editPrices).some(
    (key) => editPrices[key] !== String(offer.prices[key]?.amount ?? ''),
  );

  async function handleSave() {
    if (!isValid) return;
    setSaving(true);
    try {
      for (const [key, val] of Object.entries(editPrices)) {
        if (val !== String(offer.prices[key]?.amount ?? '')) {
          await onSave(offer.telegram_id, key, parseFloat(val));
        }
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const userName = offer.username ? `@${offer.username}` : offer.telegram_id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">Редагувати ціни — {userName}</h3>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {DURATIONS.map((dur) => {
            const cardOffer = offer.prices[dur.card];
            const cryptoOffer = offer.prices[dur.crypto];
            const cardGlobal = globalPrices[dur.card];
            const cryptoGlobal = globalPrices[dur.crypto];

            return (
              <div key={dur.key} className="border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">{dur.label}</h4>
                <div className="grid grid-cols-2 gap-3">
                  {cardOffer && cardGlobal && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        💳 {cardGlobal.currency}
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={editPrices[dur.card] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d*$/.test(val)) {
                            setEditPrices((prev) => ({ ...prev, [dur.card]: val }));
                          }
                        }}
                        className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                                   ${editPrices[dur.card] && !isValidAmount(editPrices[dur.card]) ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                      />
                      <div className="text-xs text-gray-400 mt-0.5">глоб: {Number(cardGlobal.amount).toLocaleString()}</div>
                    </div>
                  )}
                  {cryptoOffer && cryptoGlobal && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        ⚡ {cryptoGlobal.currency}
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={editPrices[dur.crypto] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d*$/.test(val)) {
                            setEditPrices((prev) => ({ ...prev, [dur.crypto]: val }));
                          }
                        }}
                        className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                                   ${editPrices[dur.crypto] && !isValidAmount(editPrices[dur.crypto]) ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                      />
                      <div className="text-xs text-gray-400 mt-0.5">глоб: {Number(cryptoGlobal.amount).toLocaleString()}</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 grid grid-cols-2 gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !isValid || !hasChanges}
            className="px-4 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-lg
                       hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            {saving ? 'Зберігаю...' : 'Зберегти'}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg
                       hover:bg-gray-200 disabled:opacity-50 cursor-pointer transition-colors"
          >
            Скасувати
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */

export function PricesPage() {
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [offers, setOffers] = useState<PriceOfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'global' | 'offers'>('global');
  const [toast, setToast] = useState('');

  // Edit plan modal
  const [editingDuration, setEditingDuration] = useState<typeof DURATIONS[number] | null>(null);

  // New offer modal
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [newTelegramId, setNewTelegramId] = useState('');
  const [offerPrices, setOfferPrices] = useState<Record<string, string>>({});
  const [offerError, setOfferError] = useState('');
  const [creatingOffer, setCreatingOffer] = useState(false);

  const { token, headers } = useAuth();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [pricesRes, offersRes] = await Promise.all([
        fetch('/api/prices', { headers }),
        fetch('/api/prices/offers', { headers }),
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

  /** Build a prices map for quick lookup */
  const pricesMap: Record<string, PriceRow> = {};
  for (const p of prices) pricesMap[p.key] = p;

  function showToast(msg: string) { setToast(msg); }

  /** Update a global price amount */
  async function handleSavePrice(key: string, amount: number) {
    const res = await fetch(`/api/prices/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ amount }),
    });
    if (!res.ok) throw new Error('Failed to save');
    setPrices((prev) => prev.map((p) => p.key === key ? { ...p, amount: String(amount) } : p));
    showToast('Ціну оновлено');
  }

  /** Update a global price display_name */
  async function handleSaveDisplayName(key: string, display_name: string) {
    const res = await fetch(`/api/prices/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ display_name }),
    });
    if (!res.ok) throw new Error('Failed to save');
    setPrices((prev) => prev.map((p) => p.key === key ? { ...p, display_name } : p));
    showToast('Назву оновлено');
  }

  /** Open the offer creation modal */
  function openOfferModal() {
    setNewTelegramId('');
    setOfferError('');
    // Pre-fill with current global prices
    const initial: Record<string, string> = {};
    for (const p of prices) initial[p.key] = String(p.amount);
    setOfferPrices(initial);
    setShowOfferModal(true);
  }

  function closeOfferModal() {
    setShowOfferModal(false);
    setOfferError('');
  }

  /** Create offers for a user with custom prices */
  async function handleCreateOffer() {
    if (!newTelegramId.trim() || !/^\d+$/.test(newTelegramId.trim())) {
      setOfferError('Telegram ID має бути числом');
      return;
    }
    // Validate all prices
    for (const key of Object.keys(offerPrices)) {
      const val = offerPrices[key];
      if (!val || !/^\d+(\.\d+)?$/.test(val) || parseFloat(val) <= 0) {
        setOfferError(`Невалідна ціна для ${key}`);
        return;
      }
    }

    setCreatingOffer(true);
    setOfferError('');
    try {
      // Step 1: Create offer (copies global prices)
      const res = await fetch('/api/prices/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ telegram_id: newTelegramId.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create offer');
      }

      // Step 2: Update each price that differs from global
      for (const [key, val] of Object.entries(offerPrices)) {
        const globalPrice = pricesMap[key];
        if (globalPrice && String(globalPrice.amount) !== val) {
          await fetch(`/api/prices/offers/${newTelegramId.trim()}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({ key, amount: parseFloat(val) }),
          });
        }
      }

      closeOfferModal();
      await fetchData();
      showToast('Пропозицію створено');
    } catch (err) {
      setOfferError(err instanceof Error ? err.message : 'Error');
    } finally {
      setCreatingOffer(false);
    }
  }

  /** Update a single price inside an offer */
  async function handleSaveOffer(telegramId: string, key: string, amount: number) {
    const res = await fetch(`/api/prices/offers/${telegramId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ key, amount }),
    });
    if (!res.ok) throw new Error('Failed to save');
    setOffers((prev) => prev.map((o) =>
      o.telegram_id === telegramId
        ? { ...o, prices: { ...o.prices, [key]: { ...o.prices[key], amount } } }
        : o
    ));
    showToast('Ціну пропозиції оновлено');
  }

  /** Delete offer for a user */
  async function handleDeleteOffers(telegramId: string) {
    if (!confirm(`Видалити пропозицію для ${telegramId}?`)) return;
    const res = await fetch(`/api/prices/offers/user/${telegramId}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) throw new Error('Failed to delete');
    setOffers((prev) => prev.filter((o) => o.telegram_id !== telegramId));
    showToast('Пропозицію видалено');
  }

  /* ─── Render ─── */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-red-600 font-medium">{error}</p>
        <button onClick={fetchData} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer">
          Спробувати знову
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Ціни</h2>
          <p className="text-sm text-gray-500 mt-1">Управління тарифами та персональними пропозиціями</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600
                     bg-white border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors shadow-sm"
        >
          <RefreshIcon />
          Оновити
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setTab('global')}
          className={`px-5 py-2.5 text-sm font-medium rounded-lg transition-all cursor-pointer ${
            tab === 'global'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          Тарифи
        </button>
        <button
          onClick={() => setTab('offers')}
          className={`px-5 py-2.5 text-sm font-medium rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
            tab === 'offers'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          Персональні
          {offers.length > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-purple-100 text-purple-700 rounded-full">
              {offers.length}
            </span>
          )}
        </button>
      </div>

      {/* ═══ Global Prices Tab ═══ */}
      {tab === 'global' && (
        <div>
          <p className="text-sm text-gray-400 mb-6">
            Ці ціни бачать всі нові юзери. Натисніть "Редагувати" щоб змінити.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {DURATIONS.map((dur) => (
              <PlanCard
                key={dur.key}
                duration={dur}
                cardPrice={pricesMap[dur.card]}
                cryptoPrice={pricesMap[dur.crypto]}
                onEdit={() => setEditingDuration(dur)}
              />
            ))}
          </div>

          {/* Edit Plan Modal */}
          {editingDuration && (
            <PlanEditModal
              duration={editingDuration}
              cardPrice={pricesMap[editingDuration.card]}
              cryptoPrice={pricesMap[editingDuration.crypto]}
              onSaveAmount={handleSavePrice}
              onSaveDisplayName={handleSaveDisplayName}
              onClose={() => setEditingDuration(null)}
            />
          )}

          {/* Preview */}
          <div className="mt-8 p-5 bg-gray-50 border border-gray-200 rounded-xl">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Як бачить юзер в боті</h4>
            <div className="space-y-2">
              {DURATIONS.map((dur) => {
                const card = pricesMap[dur.card];
                const crypto = pricesMap[dur.crypto];
                if (!card && !crypto) return null;
                const name = card?.display_name ?? crypto?.display_name ?? '?';
                return (
                  <div key={dur.key} className="inline-flex items-center px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-800 mr-2 shadow-sm">
                    {name} — {card ? `${Number(card.amount).toLocaleString()} ${card.currency}` : '?'} / {crypto ? `${Number(crypto.amount).toLocaleString()} ${crypto.currency}` : '?'}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Offers Tab ═══ */}
      {tab === 'offers' && (
        <div>
          <p className="text-sm text-gray-400 mb-6">
            Персональні ціни для конкретних юзерів. Видаляються автоматично після оплати.
          </p>

          {/* Create offer button */}
          <div className="mb-6">
            <button
              onClick={openOfferModal}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-lg
                         hover:bg-purple-700 cursor-pointer transition-colors"
            >
              <PlusIcon />
              Створити пропозицію
            </button>
          </div>

          {/* Offers list */}
          {offers.length === 0 ? (
            <div className="text-center py-16 bg-white border border-gray-200 rounded-xl">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-gray-100 rounded-full text-gray-400 mb-3">
                <UserIcon />
              </div>
              <p className="text-gray-400 text-sm">Немає персональних пропозицій</p>
              <p className="text-gray-300 text-xs mt-1">Створіть першу пропозицію через форму вище</p>
            </div>
          ) : (
            <div className="space-y-5">
              {offers.map((offer) => (
                <OfferCard
                  key={offer.telegram_id}
                  offer={offer}
                  globalPrices={pricesMap}
                  onSave={handleSaveOffer}
                  onDelete={handleDeleteOffers}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Offer Modal */}
      {showOfferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeOfferModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Створити персональну пропозицію</h3>
              <p className="text-sm text-gray-500 mt-1">Ціни скопійовані з глобальних. Змініть потрібні перед створенням.</p>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-5">
              {/* Telegram ID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Telegram ID</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={newTelegramId}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*$/.test(val)) { setNewTelegramId(val); setOfferError(''); }
                  }}
                  placeholder="Наприклад: 123456789"
                  className={`w-full px-3 py-2.5 text-sm border rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                             ${offerError && !newTelegramId.trim() ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                  autoFocus
                />
              </div>

              {/* Prices */}
              <div className="space-y-4">
                {DURATIONS.map((dur) => {
                  const cardGlobal = pricesMap[dur.card];
                  const cryptoGlobal = pricesMap[dur.crypto];

                  return (
                    <div key={dur.key} className="border border-gray-200 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">{dur.label}</h4>
                      <div className="grid grid-cols-2 gap-3">
                        {cardGlobal && (
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                              💳 Картка ({cardGlobal.currency})
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={offerPrices[dur.card] ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                  setOfferPrices((prev) => ({ ...prev, [dur.card]: val }));
                                }
                              }}
                              className={`w-full px-3 py-2 text-sm border rounded-lg
                                         focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                                         ${offerPrices[dur.card] !== undefined && offerPrices[dur.card] !== '' && !/^\d+(\.\d+)?$/.test(offerPrices[dur.card]) ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                            />
                            <div className="text-xs text-gray-400 mt-0.5">
                              Глобальна: {Number(cardGlobal.amount).toLocaleString()} {cardGlobal.currency}
                            </div>
                          </div>
                        )}
                        {cryptoGlobal && (
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                              ⚡ Крипто ({cryptoGlobal.currency})
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={offerPrices[dur.crypto] ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                  setOfferPrices((prev) => ({ ...prev, [dur.crypto]: val }));
                                }
                              }}
                              className={`w-full px-3 py-2 text-sm border rounded-lg
                                         focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                                         ${offerPrices[dur.crypto] !== undefined && offerPrices[dur.crypto] !== '' && !/^\d+(\.\d+)?$/.test(offerPrices[dur.crypto]) ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                            />
                            <div className="text-xs text-gray-400 mt-0.5">
                              Глобальна: {Number(cryptoGlobal.amount).toLocaleString()} {cryptoGlobal.currency}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Error */}
              {offerError && (
                <div className="px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                  {offerError}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button
                onClick={handleCreateOffer}
                disabled={creatingOffer || !newTelegramId.trim()}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-lg
                           hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                {creatingOffer ? 'Створюю...' : 'Створити пропозицію'}
              </button>
              <button
                onClick={closeOfferModal}
                disabled={creatingOffer}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg
                           hover:bg-gray-200 disabled:opacity-50 cursor-pointer transition-colors"
              >
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  );
}
