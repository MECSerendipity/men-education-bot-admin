import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { InfoTooltip } from '../components/Tooltip';

/* ---------- Types ---------- */

interface BroadcastButton {
  id: number;
  button_name: string;
  link: string;
}

interface LayoutItem {
  buttonId: number;
  row: number;
}

type SubPage = 'panel' | 'video-note' | 'bot-broadcast' | null;

/* ---------- Chat presets ---------- */

const CHAT_PRESETS = [
  { label: 'Men Education Club', chatId: '-1003975579938' },
];

/* ---------- Icons ---------- */

function PlusIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 01.78.72l.5 6a.75.75 0 01-1.49.12l-.5-6a.75.75 0 01.71-.84zm2.84 0a.75.75 0 01.71.84l-.5 6a.75.75 0 11-1.49-.12l.5-6a.75.75 0 01.78-.72z" clipRule="evenodd" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
    </svg>
  );
}

/* ---------- Broadcast Type Cards ---------- */

const BROADCAST_TYPES = [
  {
    type: 'panel' as SubPage,
    icon: '\u{1F680}',
    title: 'Панель управління',
    description: 'Повідомлення з inline кнопками-посиланнями. Навігаційне меню для групи або каналу.',
    color: 'blue',
    ready: true,
  },
  {
    type: null as SubPage,
    icon: '\u{1F4E2}',
    title: 'Розсилка в бот',
    description: 'Масова розсилка повідомлення всім юзерам бота або по фільтрах.',
    color: 'purple',
    ready: false,
  },
  {
    type: null as SubPage,
    icon: '\u{1F3A5}',
    title: 'Відео кружечок',
    description: 'Відправка відео-кружечка (video note) в групу або канал.',
    color: 'pink',
    ready: false,
  },
  {
    type: null as SubPage,
    icon: '\u{1F5BC}\u{FE0F}',
    title: 'Фото + текст',
    description: 'Відправка фото з підписом та inline кнопками.',
    color: 'green',
    ready: false,
  },
  {
    type: null as SubPage,
    icon: '\u{1F3AC}',
    title: 'Відео + текст',
    description: 'Відправка відео з підписом та inline кнопками.',
    color: 'orange',
    ready: false,
  },
];

const CARD_COLORS: Record<string, { icon: string; border: string; hover: string }> = {
  blue: { icon: 'bg-blue-100', border: 'border-blue-200', hover: 'hover:border-blue-400' },
  purple: { icon: 'bg-purple-100', border: 'border-purple-200', hover: 'hover:border-purple-400' },
  pink: { icon: 'bg-pink-100', border: 'border-pink-200', hover: 'hover:border-pink-400' },
  green: { icon: 'bg-green-100', border: 'border-green-200', hover: 'hover:border-green-400' },
  orange: { icon: 'bg-orange-100', border: 'border-orange-200', hover: 'hover:border-orange-400' },
};

/* ---------- Preview ---------- */

function MessagePreview({ text, layout, buttons }: { text: string; layout: LayoutItem[]; buttons: BroadcastButton[] }) {
  const rows = new Map<number, BroadcastButton[]>();
  for (const item of layout) {
    const btn = buttons.find((b) => b.id === item.buttonId);
    if (!btn) continue;
    if (!rows.has(item.row)) rows.set(item.row, []);
    rows.get(item.row)!.push(btn);
  }
  const sortedRows = [...rows.entries()].sort(([a], [b]) => a - b);

  return (
    <div className="bg-gray-900 rounded-xl p-4 text-white w-full max-w-sm">
      <div className="text-sm whitespace-pre-wrap leading-relaxed mb-3">
        {text || <span className="text-gray-500 italic">Текст повідомлення...</span>}
      </div>
      {sortedRows.length > 0 && (
        <div className="space-y-1.5">
          {sortedRows.map(([rowNum, btns]) => (
            <div key={rowNum} className="flex gap-1.5">
              {btns.map((btn) => (
                <div key={btn.id} className="flex-1 text-center py-2 px-3 bg-gray-700 rounded-lg text-xs font-medium text-blue-400 truncate">
                  {btn.button_name}
                  <span className="ml-1 text-gray-500">&#8599;</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Panel Sub-Page ---------- */

function PanelPage({ onBack }: { onBack: () => void }) {
  const [buttons, setButtons] = useState<BroadcastButton[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newLink, setNewLink] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editLink, setEditLink] = useState('');

  // Compose state
  const [selectedChat, setSelectedChat] = useState(CHAT_PRESETS[0]?.chatId ?? '');
  const [text, setText] = useState('');
  const [layout, setLayout] = useState<LayoutItem[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { headers } = useAuth();

  const fetchButtons = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/broadcast/buttons', { headers });
      if (res.ok) setButtons(await res.json());
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => { fetchButtons(); }, [fetchButtons]);

  // --- Button CRUD ---

  async function handleAdd() {
    if (!newName.trim() || !newLink.trim()) return;
    const res = await fetch('/api/broadcast/buttons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ button_name: newName.trim(), link: newLink.trim() }),
    });
    if (res.ok) {
      setNewName('');
      setNewLink('');
      await fetchButtons();
    }
  }

  async function handleUpdate(id: number) {
    if (!editName.trim() || !editLink.trim()) return;
    const res = await fetch(`/api/broadcast/buttons/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ button_name: editName.trim(), link: editLink.trim() }),
    });
    if (res.ok) {
      setEditingId(null);
      await fetchButtons();
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Видалити кнопку?')) return;
    await fetch(`/api/broadcast/buttons/${id}`, { method: 'DELETE', headers });
    setLayout((prev) => prev.filter((l) => l.buttonId !== id));
    await fetchButtons();
  }

  function startEdit(btn: BroadcastButton) {
    setEditingId(btn.id);
    setEditName(btn.button_name);
    setEditLink(btn.link);
  }

  // --- Layout management ---

  const [addingTo, setAddingTo] = useState<{ row: number; isNew?: boolean } | null>(null);
  const dragRef = useRef<{ buttonId: number; row: number } | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{ buttonId: number; row: number } | null>(null);

  function addToLayout(buttonId: number, row: number) {
    setLayout([...layout, { buttonId, row }]);
    setAddingTo(null);
  }

  function removeFromLayout(buttonId: number) {
    setLayout(layout.filter((l) => l.buttonId !== buttonId));
  }


  // Drag & drop swap
  function handleBtnDragStart(buttonId: number, row: number) {
    dragRef.current = { buttonId, row };
  }
  function handleBtnDragOver(e: React.DragEvent, buttonId: number, row: number) {
    e.preventDefault();
    setDragOverTarget({ buttonId, row });
  }
  function handleBtnDrop(targetButtonId: number, targetRow: number) {
    const src = dragRef.current;
    if (!src || src.buttonId === targetButtonId) {
      dragRef.current = null;
      setDragOverTarget(null);
      return;
    }
    setLayout((prev) => prev.map((l) => {
      if (l.buttonId === src.buttonId) return { ...l, row: targetRow };
      if (l.buttonId === targetButtonId) return { ...l, row: src.row };
      return l;
    }));
    dragRef.current = null;
    setDragOverTarget(null);
  }
  function handleBtnDragEnd() {
    dragRef.current = null;
    setDragOverTarget(null);
  }

  // Renumber rows to keep them sequential
  function normalizeRows(items: LayoutItem[]): LayoutItem[] {
    const allRows = [...new Set(items.map((l) => l.row))].sort((a, b) => a - b);
    return items.map((l) => ({ ...l, row: allRows.indexOf(l.row) }));
  }

  function addRowBelow() {
    const maxRow = layout.length > 0 ? Math.max(...layout.map((l) => l.row)) + 1 : 0;
    setAddingTo({ row: maxRow, isNew: true });
  }

  function addToRight(row: number) {
    setAddingTo({ row });
  }

  const layoutRows = [...new Set(layout.map((l) => l.row))].sort((a, b) => a - b);

  // --- Send ---

  async function handleSend() {
    if (!selectedChat || !text.trim()) return;
    setSending(true);
    setResult(null);

    const btnRows: { text: string; url: string; row: number }[] = [];
    for (const item of layout) {
      const btn = buttons.find((b) => b.id === item.buttonId);
      if (btn) btnRows.push({ text: btn.button_name, url: btn.link, row: item.row });
    }

    try {
      const res = await fetch('/api/broadcast/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ chatId: selectedChat, text: text.trim(), buttons: btnRows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: data.error ?? 'Failed to send' });
      } else {
        setResult({ ok: true, message: 'Повідомлення відправлено!' });
      }
    } catch {
      setResult({ ok: false, message: 'Network error' });
    } finally {
      setSending(false);
    }
  }

  const canSend = selectedChat && text.trim() && !sending;

  return (
    <div className="overflow-y-auto h-full pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors">
          <BackIcon />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{'\u{1F680}'} Панель управління</h2>
          <p className="text-sm text-gray-500">Управління кнопками та відправка повідомлень</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Saved buttons */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col max-h-[calc(100vh-200px)]">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 shrink-0">Збережені кнопки</h3>

          {/* Add new button */}
          <div className="space-y-2 mb-4 pb-4 border-b border-gray-100">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Назва кнопки"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              value={newLink}
              onChange={(e) => setNewLink(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || !newLink.trim()}
              className="w-full flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg
                         hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <PlusIcon /> Додати кнопку
            </button>
          </div>

          {/* Buttons list */}
          {loading ? (
            <p className="text-sm text-gray-400">Завантаження...</p>
          ) : buttons.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Немає збережених кнопок</p>
          ) : (
            <div className="space-y-2 overflow-auto flex-1 min-h-0">
              {buttons.map((btn) => (
                <div key={btn.id} className="border border-gray-100 rounded-lg p-2.5">
                  {editingId === btn.id ? (
                    <div className="space-y-1.5">
                      <input
                        type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="text" value={editLink} onChange={(e) => setEditLink(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex gap-1.5">
                        <button onClick={() => handleUpdate(btn.id)}
                          className="flex-1 px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded-md cursor-pointer">Зберегти</button>
                        <button onClick={() => setEditingId(null)}
                          className="flex-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-md cursor-pointer">Скасувати</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-800">{btn.button_name}</span>
                        <div className="flex gap-1">
                          <button onClick={() => startEdit(btn)} className="p-1 text-gray-300 hover:text-blue-600 cursor-pointer"><PencilIcon /></button>
                          <button onClick={() => handleDelete(btn.id)} className="p-1 text-gray-300 hover:text-red-600 cursor-pointer"><TrashIcon /></button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 truncate">{btn.link}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Column 2: Compose message */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Повідомлення</h3>

          {/* Destination */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">Куди надіслати</label>
            <div className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-700">
              Men Education Club
            </div>
          </div>

          {/* Text */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">Текст</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder={"\u{1F680} ПАНЕЛЬ УПРАВЛІННЯ \u{1F680}"}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono"
            />
          </div>

          {/* Layout grid builder */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 mb-2">Кнопки в повідомленні</label>

            <div className="border border-gray-200 rounded-xl p-3 bg-gray-50 space-y-2" onDragEnd={handleBtnDragEnd}>
              {/* Existing rows */}
              {layoutRows.map((rowNum) => {
                const rowItems = layout.filter((l) => l.row === rowNum);
                return (
                  <div key={rowNum} className="flex gap-1.5 items-center">
                    {rowItems.map((item) => {
                      const btn = buttons.find((b) => b.id === item.buttonId);
                      if (!btn) return null;
                      const isDragOver = dragOverTarget?.buttonId === item.buttonId;
                      return (
                        <div
                          key={item.buttonId}
                          draggable
                          onDragStart={() => handleBtnDragStart(item.buttonId, item.row)}
                          onDragOver={(e) => handleBtnDragOver(e, item.buttonId, item.row)}
                          onDrop={() => handleBtnDrop(item.buttonId, item.row)}
                          className={`flex-1 flex items-center gap-1 px-2.5 py-2.5 bg-white border rounded-lg text-xs
                                     cursor-grab active:cursor-grabbing transition-colors
                                     ${isDragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                        >
                          <span className="flex-1 truncate text-gray-800 font-medium">{btn.button_name}</span>
                          <button
                            onClick={() => {
                              removeFromLayout(item.buttonId);
                              setLayout((prev) => normalizeRows(prev.filter((l) => l.buttonId !== item.buttonId)));
                            }}
                            className="text-gray-300 hover:text-red-500 cursor-pointer shrink-0"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      );
                    })}

                    {/* + Add to right */}
                    {rowItems.length < 3 && buttons.length > 0 && (
                      <button
                        onClick={() => addToRight(rowNum)}
                        className="shrink-0 w-9 h-9 flex items-center justify-center border-2 border-dashed border-gray-300
                                   rounded-lg text-gray-400 hover:border-blue-400 hover:text-blue-500 cursor-pointer transition-colors"
                        title="Додати кнопку праворуч"
                      >
                        <PlusIcon />
                      </button>
                    )}
                  </div>
                );
              })}

              {/* + Add row below */}
              {buttons.length > 0 && (
                <button
                  onClick={addRowBelow}
                  className="w-full py-2.5 flex items-center justify-center gap-1.5 border-2 border-dashed border-gray-300
                             rounded-lg text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500 cursor-pointer transition-colors"
                >
                  <PlusIcon />
                  Додати рядок
                </button>
              )}

              {/* Empty state */}
              {layout.length === 0 && buttons.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-3">
                  Спочатку створіть кнопки в лівій колонці
                </p>
              )}
            </div>

            {/* Button picker dropdown */}
            {addingTo && (
              <div className="mt-2 border border-blue-200 rounded-lg bg-white p-2 shadow-sm">
                <p className="text-xs text-gray-500 mb-1.5">
                  Оберіть кнопку {addingTo.isNew ? 'для нового рядка' : 'для додавання праворуч'}:
                </p>
                <div className="space-y-1 max-h-48 overflow-auto">
                  {buttons.map((btn) => (
                    <button
                      key={btn.id}
                      onClick={() => addToLayout(btn.id, addingTo.row)}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors"
                    >
                      <span className="font-medium">{btn.button_name}</span>
                      <span className="ml-2 text-xs text-gray-400 truncate">{btn.link}</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setAddingTo(null)}
                  className="mt-1.5 w-full text-center px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  Скасувати
                </button>
              </div>
            )}
          </div>

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="w-full px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg
                       hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            {sending ? 'Відправляю...' : 'Відправити'}
          </button>

          {result && (
            <div className={`mt-3 px-3 py-2 rounded-lg text-xs ${
              result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {result.message}
            </div>
          )}
        </div>

        {/* Column 3: Preview */}
        <div>
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Прев'ю</h3>
            <div className="bg-gray-100 rounded-xl p-4 flex justify-center">
              <MessagePreview text={text} layout={layout} buttons={buttons} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Shared Types ---------- */

type BroadcastTarget = 'all' | 'subscribers' | 'cancelled_in_club' | 'expired' | 'never_subscribed' | 'specific';

interface UserOption {
  telegram_id: number;
  username: string | null;
  is_subscribed: boolean;
}

interface BroadcastProgress {
  total: number;
  sent: number;
  failed: number;
  done: boolean;
  cancelled: boolean;
  errors: { telegramId: number; error: string }[];
}

const TARGET_OPTIONS: { key: BroadcastTarget; label: string; tooltip: string }[] = [
  { key: 'all', label: 'Всім юзерам', tooltip: 'Надіслати всім юзерам які коли-небудь заходили в бот.' },
  { key: 'subscribers', label: 'Тільки підписникам', tooltip: 'Юзери з активною підпискою, які не скасовували.' },
  { key: 'cancelled_in_club', label: 'Скасували, але ще в клубі', tooltip: 'Юзери які скасували підписку, але термін ще не закінчився - вони ще мають доступ.' },
  { key: 'expired', label: 'Колишні підписники', tooltip: 'Юзери які мали підписку раніше, але вона вже закінчилась - доступу немає.' },
  { key: 'never_subscribed', label: 'Ніколи не підписувались', tooltip: 'Юзери які заходили в бот, але ніколи не оформлювали підписку.' },
  { key: 'specific', label: 'Конкретним юзерам', tooltip: 'Надіслати одному або декільком юзерам за Telegram ID.' },
];

/* ---------- Target Selector (shared) ---------- */

function TargetSelector({ target, onTargetChange, selectedUsers, onSelectedUsersChange, sending, onSend, canSend, progress, result, jobId, onCancel }: {
  target: BroadcastTarget;
  onTargetChange: (t: BroadcastTarget) => void;
  selectedUsers: UserOption[];
  onSelectedUsersChange: (users: UserOption[]) => void;
  sending: boolean;
  onSend: () => void;
  canSend: boolean;
  progress: BroadcastProgress | null;
  result: { ok: boolean; message: string } | null;
  jobId: string | null;
  onCancel: () => void;
}) {
  const [userSearch, setUserSearch] = useState('');
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const { headers } = useAuth();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDropdown) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showDropdown]);

  useEffect(() => {
    if (target !== 'specific') return;
    const timer = setTimeout(async () => {
      setLoadingUsers(true);
      try {
        const params = new URLSearchParams({ page: '1', limit: '50' });
        if (userSearch.trim()) params.set('search', userSearch.trim());
        const res = await fetch(`/api/users?${params}`, { headers });
        if (res.ok) {
          const data = await res.json();
          setUserOptions(data.users.map((u: { telegram_id: number; username: string | null; is_subscribed: boolean }) => ({
            telegram_id: u.telegram_id, username: u.username, is_subscribed: u.is_subscribed,
          })));
        }
      } catch { /* ignore */ }
      setLoadingUsers(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch, target]);

  function toggleUser(user: UserOption) {
    onSelectedUsersChange(
      selectedUsers.some(u => u.telegram_id === user.telegram_id)
        ? selectedUsers.filter(u => u.telegram_id !== user.telegram_id)
        : [...selectedUsers, user]
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Кому надіслати</h3>

      <div className="space-y-2 mb-4">
        {TARGET_OPTIONS.map((opt) => (
          <button key={opt.key} onClick={() => onTargetChange(opt.key)}
            className={`w-full px-4 py-2.5 text-sm font-medium rounded-lg cursor-pointer transition-colors text-left inline-flex items-center gap-2 ${
              target === opt.key ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}>
            <InfoTooltip content={opt.tooltip} />
            {opt.label}
          </button>
        ))}
      </div>

      {/* Specific users dropdown */}
      {target === 'specific' && (
        <div>
          <div className="relative" ref={dropdownRef}>
            <button onClick={() => setShowDropdown(!showDropdown)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white cursor-pointer hover:border-gray-400 transition-colors">
              <span className={selectedUsers.length > 0 ? 'text-gray-700' : 'text-gray-400'}>
                {selectedUsers.length > 0 ? `Обрано: ${selectedUsers.length}` : 'Оберіть юзерів...'}
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                className={`w-4 h-4 text-gray-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`}>
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>
            {showDropdown && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                <div className="p-2 border-b border-gray-100">
                  <input type="text" value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Пошук..." autoFocus
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
                <div className="max-h-60 overflow-auto">
                  {loadingUsers ? (
                    <p className="px-3 py-3 text-sm text-gray-400 text-center">Завантаження...</p>
                  ) : userOptions.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-gray-400 text-center">Юзерів не знайдено</p>
                  ) : userOptions.map(u => {
                    const isSelected = selectedUsers.some(s => s.telegram_id === u.telegram_id);
                    return (
                      <label key={u.telegram_id}
                        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors border-b border-gray-50 last:border-0 ${
                          isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                        }`}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleUser(u)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                        <span className="font-mono text-xs text-gray-500 shrink-0">{u.telegram_id}</span>
                        <span className="flex-1 text-sm text-gray-700 truncate">{u.username ? `@${u.username}` : '—'}</span>
                        <span className={`text-xs font-medium shrink-0 ${u.is_subscribed ? 'text-green-600' : 'text-gray-400'}`}>
                          {u.is_subscribed ? 'Active' : 'Inactive'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {selectedUsers.map(u => (
                <span key={u.telegram_id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                  {u.username ? `@${u.username}` : u.telegram_id}
                  <button onClick={() => onSelectedUsersChange(selectedUsers.filter(p => p.telegram_id !== u.telegram_id))}
                    className="hover:text-blue-600 cursor-pointer text-blue-400">&times;</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Send button + progress */}
      <div className="mt-4 space-y-3">
        <button onClick={onSend} disabled={!canSend}
          className="w-full px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors">
          {sending ? 'Відправляю...' : 'Відправити'}
        </button>

        {progress && !progress.done && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Надіслано: {progress.sent}{progress.failed > 0 ? ` (помилок: ${progress.failed})` : ''}</span>
              <span>{progress.sent + progress.failed} / {progress.total}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${Math.round(((progress.sent + progress.failed) / progress.total) * 100)}%` }} />
            </div>
            {jobId && !progress.cancelled && (
              <button onClick={onCancel}
                className="w-full px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 cursor-pointer transition-colors">
                Скасувати розсилку
              </button>
            )}
            {progress.cancelled && (
              <p className="text-xs text-amber-600 text-center">Скасовується... зачекай поточну відправку</p>
            )}
          </div>
        )}

        {result && (
          <div className={`px-3 py-2 rounded-lg text-xs ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {result.message}
          </div>
        )}

        {progress && progress.errors.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-red-700 mb-1.5">Помилки ({progress.errors.length}):</h4>
            <div className="max-h-32 overflow-auto space-y-1">
              {progress.errors.map((e, i) => (
                <div key={i} className="flex gap-2 px-2 py-1.5 bg-red-50 rounded text-xs">
                  <span className="font-mono text-red-700 shrink-0">{e.telegramId}</span>
                  <span className="text-red-500 truncate">{e.error}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Bot Broadcast Sub-Page ---------- */

interface InlineBtn {
  text: string;
  url: string;
  row: number;
}

function BotBroadcastPage({ onBack }: { onBack: () => void }) {
  const [text, setText] = useState('');
  const [target, setTarget] = useState<BroadcastTarget>('all');
  const [selectedUsers, setSelectedUsers] = useState<UserOption[]>([]);
  const [inlineButtons, setInlineButtons] = useState<InlineBtn[]>([]);
  const [newBtnText, setNewBtnText] = useState('');
  const [newBtnUrl, setNewBtnUrl] = useState('');
  const [mediaType, setMediaType] = useState<'none' | 'photo' | 'video' | 'document'>('none');
  const [mediaFileId, setMediaFileId] = useState('');
  const [mediaFilename, setMediaFilename] = useState('');
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [progress, setProgress] = useState<BroadcastProgress | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const { headers } = useAuth();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function handleCancel() {
    if (!jobId) return;
    try {
      await fetch(`/api/broadcast/cancel/${jobId}`, { method: 'POST', headers });
    } catch { /* ignore */ }
  }

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  function addButton() {
    if (!newBtnText.trim() || !newBtnUrl.trim()) return;
    const maxRow = inlineButtons.length > 0 ? Math.max(...inlineButtons.map(b => b.row)) : -1;
    setInlineButtons([...inlineButtons, { text: newBtnText.trim(), url: newBtnUrl.trim(), row: maxRow + 1 }]);
    setNewBtnText('');
    setNewBtnUrl('');
  }

  function removeButton(index: number) {
    setInlineButtons(inlineButtons.filter((_, i) => i !== index));
  }

  function startPolling(jobId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/broadcast/progress/${jobId}`, { headers });
        if (!res.ok) return;
        const data = await res.json();
        setProgress(data);
        if (data.done) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setSending(false);
          setResult({
            ok: true,
            message: `${data.cancelled ? 'Розсилку скасовано' : 'Розсилка завершена'}: ${data.sent} надіслано${data.failed ? `, ${data.failed} помилок` : ''} / ${data.total} всього`,
          });
        }
      } catch { /* ignore */ }
    }, 1000);
  }

  async function handleSend() {
    if (!text.trim()) return;
    if (target === 'specific' && selectedUsers.length === 0) return;
    setSending(true);
    setResult(null);
    setProgress(null);

    try {
      const res = await fetch('/api/broadcast/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          text: text.trim(),
          target,
          telegramIds: target === 'specific' ? selectedUsers.map(u => String(u.telegram_id)) : undefined,
          buttons: inlineButtons.length > 0 ? inlineButtons : undefined,
          mediaType: mediaType !== 'none' ? mediaType : undefined,
          mediaFileId: mediaType !== 'none' && mediaFileId.trim() ? mediaFileId.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: data.error ?? 'Failed to send' });
        setSending(false);
      } else if (data.jobId) {
        setJobId(data.jobId);
        setProgress({ total: data.total, sent: 0, failed: 0, done: false, cancelled: false, errors: [] });
        startPolling(data.jobId);
      } else {
        setResult({ ok: true, message: 'Відправлено!' });
        setSending(false);
      }
    } catch {
      setResult({ ok: false, message: 'Network error' });
      setSending(false);
    }
  }

  const canSend = !!(text.trim() && !sending && (target !== 'specific' || selectedUsers.length > 0));

  return (
    <div className="overflow-y-auto h-full pb-6">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors">
          <BackIcon />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{'\u{1F4E2}'} Розсилка в бот</h2>
          <p className="text-sm text-gray-500">Масова розсилка повідомлення юзерам бота</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Text + Buttons */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Повідомлення</h3>

          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">Текст</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder="Введіть текст (HTML підтримується)..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">&lt;b&gt;жирний&lt;/b&gt; &lt;i&gt;курсив&lt;/i&gt; &lt;a href=""&gt;посилання&lt;/a&gt;</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Inline кнопки</label>
            {inlineButtons.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {inlineButtons.map((btn, i) => (
                  <div key={i} className="flex items-center gap-2 px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs">
                    <span className="font-medium text-gray-700 flex-1 truncate">{btn.text}</span>
                    <span className="text-gray-400 truncate max-w-[100px]">{btn.url}</span>
                    <button onClick={() => removeButton(i)} className="text-gray-300 hover:text-red-500 cursor-pointer shrink-0">&times;</button>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1.5">
              <input type="text" value={newBtnText} onChange={(e) => setNewBtnText(e.target.value)}
                placeholder="Текст кнопки" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="text" value={newBtnUrl} onChange={(e) => setNewBtnUrl(e.target.value)}
                placeholder="https://..." className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={addButton} disabled={!newBtnText.trim() || !newBtnUrl.trim()}
                className="w-full flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors">
                <PlusIcon /> Додати кнопку
              </button>
            </div>
          </div>

          {/* Media attachment */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Медіа (необов'язково)</label>
            {mediaFileId ? (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-green-50 border border-green-200 rounded-lg">
                <span className="text-xs text-green-700 font-medium flex-1 truncate">
                  {mediaType === 'photo' ? '\u{1F5BC}\u{FE0F}' : mediaType === 'video' ? '\u{1F3AC}' : '\u{1F4CE}'} {mediaFilename || 'Файл завантажено'}
                </span>
                <button onClick={() => { setMediaFileId(''); setMediaType('none'); setMediaFilename(''); }}
                  className="text-green-400 hover:text-red-500 cursor-pointer text-sm">&times;</button>
              </div>
            ) : (
              <label className={`flex items-center justify-center gap-2 px-3 py-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                uploading ? 'border-blue-300 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
              }`}>
                <input type="file" className="hidden"
                  disabled={uploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploading(true);
                    try {
                      const formData = new FormData();
                      formData.append('file', file);
                      const res = await fetch('/api/broadcast/upload', {
                        method: 'POST',
                        headers: { Authorization: headers.Authorization },
                        body: formData,
                      });
                      const data = await res.json();
                      if (res.ok && data.fileId) {
                        setMediaFileId(data.fileId);
                        setMediaType(data.mediaType ?? 'document');
                        setMediaFilename(data.filename ?? file.name);
                      }
                    } catch { /* ignore */ }
                    setUploading(false);
                    e.target.value = '';
                  }}
                />
                <div className="text-center">
                  <span className="text-sm text-gray-500 block">
                    {uploading ? 'Завантаження...' : 'Натисни щоб завантажити фото, відео або файл'}
                  </span>
                  {!uploading && (
                    <span className="text-xs text-gray-400 block mt-0.5">
                      JPG, PNG, GIF, MP4, PDF, DOC, XLS, ZIP — до 50 МБ
                    </span>
                  )}
                </div>
              </label>
            )}
          </div>
        </div>

        {/* Column 2: Preview */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Прев'ю</h3>
          <div className="bg-gray-100 rounded-xl p-4 flex justify-center">
            <div className="bg-gray-900 rounded-xl p-4 text-white w-full max-w-sm">
              <div className="text-sm whitespace-pre-wrap leading-relaxed mb-3">
                {text || <span className="text-gray-500 italic">Текст повідомлення...</span>}
              </div>
              {inlineButtons.length > 0 && (
                <div className="space-y-1.5">
                  {inlineButtons.map((btn, i) => (
                    <div key={i} className="text-center py-2 px-3 bg-gray-700 rounded-lg text-xs font-medium text-blue-400 truncate">
                      {btn.text} <span className="text-gray-500">&#8599;</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Column 3: Target */}
        <TargetSelector
          target={target} onTargetChange={setTarget}
          selectedUsers={selectedUsers} onSelectedUsersChange={setSelectedUsers}
          sending={sending} onSend={handleSend} canSend={canSend}
          progress={progress} result={result}
          jobId={jobId} onCancel={handleCancel}
        />

      </div>
    </div>
  );
}

/* ---------- Video Note Sub-Page ---------- */

function VideoNotePage({ onBack }: { onBack: () => void }) {
  const [fileId, setFileId] = useState('');
  const [target, setTarget] = useState<BroadcastTarget>('all');
  const [selectedUsers, setSelectedUsers] = useState<UserOption[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [progress, setProgress] = useState<BroadcastProgress | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const { headers } = useAuth();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function handleCancel() {
    if (!jobId) return;
    try {
      await fetch(`/api/broadcast/cancel/${jobId}`, { method: 'POST', headers });
    } catch { /* ignore */ }
  }

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  function startPolling(jobId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/broadcast/video-note/progress/${jobId}`, { headers });
        if (!res.ok) return;
        const data = await res.json();
        setProgress(data);
        if (data.done) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setSending(false);
          setResult({
            ok: true,
            message: `${data.cancelled ? 'Розсилку скасовано' : 'Розсилка завершена'}: ${data.sent} надіслано${data.failed ? `, ${data.failed} помилок` : ''} / ${data.total} всього`,
          });
        }
      } catch { /* ignore polling errors */ }
    }, 1000);
  }

  async function handleSend() {
    if (!fileId.trim()) return;
    if (target === 'specific' && selectedUsers.length === 0) return;
    setSending(true);
    setResult(null);
    setProgress(null);

    try {
      const res = await fetch('/api/broadcast/video-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          fileId: fileId.trim(),
          target,
          telegramIds: target === 'specific'
            ? selectedUsers.map(u => String(u.telegram_id))
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: data.error ?? 'Failed to send' });
        setSending(false);
      } else if (data.jobId) {
        // Background job started — poll for progress
        setJobId(data.jobId);
        setProgress({ total: data.total, sent: 0, failed: 0, done: false, cancelled: false, errors: [] });
        startPolling(data.jobId);
      } else {
        // Instant send (single chat)
        setResult({ ok: true, message: 'Відправлено!' });
        setSending(false);
      }
    } catch {
      setResult({ ok: false, message: 'Network error' });
      setSending(false);
    }
  }

  const canSend = !!(fileId.trim() && !sending && (target !== 'specific' || selectedUsers.length > 0));

  return (
    <div className="overflow-y-auto h-full pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors">
          <BackIcon />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{'\u{1F3A5}'} Відео кружечок</h2>
          <p className="text-sm text-gray-500">Відправка відео-кружечка юзерам бота</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: File ID + Instructions */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Відео кружечок</h3>

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-3">
            <h4 className="text-sm font-semibold text-blue-900 mb-2">Як отримати file_id:</h4>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>Зніми відео кружечок в Telegram</li>
              <li>Надішли його боту в приватний чат</li>
              <li>Бот відповість з file_id — скопіюй його</li>
              <li>Встав file_id в поле нижче</li>
            </ol>
          </div>

          {/* File ID input */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">File ID</label>
            <textarea
              value={fileId}
              onChange={(e) => setFileId(e.target.value)}
              placeholder="Встав file_id від бота..."
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono resize-y"
            />
          </div>
        </div>

        {/* Column 2: Target + Send */}
        <TargetSelector
          target={target} onTargetChange={setTarget}
          selectedUsers={selectedUsers} onSelectedUsersChange={setSelectedUsers}
          sending={sending} onSend={handleSend} canSend={canSend}
          progress={progress} result={result}
          jobId={jobId} onCancel={handleCancel}
        />
      </div>
    </div>
  );
}

/* ---------- Main Page ---------- */

export function BroadcastPage() {
  const [subPage, setSubPage] = useState<SubPage>(null);

  if (subPage === 'panel') {
    return <PanelPage onBack={() => setSubPage(null)} />;
  }

  if (subPage === 'bot-broadcast') {
    return <BotBroadcastPage onBack={() => setSubPage(null)} />;
  }

  if (subPage === 'video-note') {
    return <VideoNotePage onBack={() => setSubPage(null)} />;
  }

  return (
    <div className="overflow-y-auto h-full pb-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Broadcast</h2>
        <p className="text-sm text-gray-500 mt-1">Відправка повідомлень в групи та канали</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <button
          onClick={() => setSubPage('bot-broadcast')}
          className="text-left p-6 rounded-xl border-2 border-purple-200 hover:border-purple-400 hover:shadow-md transition-all cursor-pointer"
        >
          <h3 className="text-lg font-bold text-gray-900 mb-2">Розсилка в бот</h3>
          <p className="text-sm text-gray-500 leading-relaxed">Масова розсилка повідомлення з inline кнопками всім юзерам бота або по фільтрах</p>
        </button>

        <button
          onClick={() => setSubPage('video-note')}
          className="text-left p-6 rounded-xl border-2 border-pink-200 hover:border-pink-400 hover:shadow-md transition-all cursor-pointer"
        >
          <h3 className="text-lg font-bold text-gray-900 mb-2">Відео кружечок</h3>
          <p className="text-sm text-gray-500 leading-relaxed">Відправка відео-кружечка юзерам бота або в канал</p>
        </button>

        <button
          onClick={() => setSubPage('panel')}
          className="text-left p-6 rounded-xl border-2 border-blue-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
        >
          <h3 className="text-lg font-bold text-gray-900 mb-2">Панель управління</h3>
          <p className="text-sm text-gray-500 leading-relaxed">
            Повідомлення з inline кнопками-посиланнями в Men Education Club
          </p>
        </button>
      </div>
    </div>
  );
}
