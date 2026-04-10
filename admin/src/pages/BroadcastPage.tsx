import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';

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

type SubPage = 'panel' | null;

/* ---------- Chat presets ---------- */

const CHAT_PRESETS = [
  { label: 'Men Education Club', chatId: '-1003975579938' },
  { label: 'Men Education Bot', chatId: '8618067926' },
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
  const [selectedChat, setSelectedChat] = useState('');
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
            <select
              value={selectedChat}
              onChange={(e) => setSelectedChat(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="">Оберіть чат...</option>
              {CHAT_PRESETS.map((p) => (
                <option key={p.chatId} value={p.chatId}>{p.label}</option>
              ))}
            </select>
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

/* ---------- Main Page ---------- */

export function BroadcastPage() {
  const [subPage, setSubPage] = useState<SubPage>(null);

  if (subPage === 'panel') {
    return <PanelPage onBack={() => setSubPage(null)} />;
  }

  return (
    <div className="overflow-y-auto h-full pb-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Broadcast</h2>
        <p className="text-sm text-gray-500 mt-1">Відправка повідомлень в групи та канали</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <button
          onClick={() => setSubPage('panel')}
          className="text-left p-6 rounded-xl border-2 border-blue-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
        >
          <h3 className="text-lg font-bold text-gray-900 mb-2">Панель управління</h3>
          <p className="text-sm text-gray-500 leading-relaxed">
            Повідомлення з inline кнопками-посиланнями в Men Education Club
          </p>
        </button>

        <div className="p-6 rounded-xl border-2 border-gray-200 opacity-50">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Розсилка в бот <span className="text-xs font-normal text-gray-400 ml-1">Скоро</span></h3>
          <p className="text-sm text-gray-500 leading-relaxed">Масова розсилка повідомлення всім юзерам бота або по фільтрах</p>
        </div>

        <div className="p-6 rounded-xl border-2 border-gray-200 opacity-50">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Відео кружечок <span className="text-xs font-normal text-gray-400 ml-1">Скоро</span></h3>
          <p className="text-sm text-gray-500 leading-relaxed">Відправка відео-кружечка в групу або канал</p>
        </div>

        <div className="p-6 rounded-xl border-2 border-gray-200 opacity-50">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Фото + текст <span className="text-xs font-normal text-gray-400 ml-1">Скоро</span></h3>
          <p className="text-sm text-gray-500 leading-relaxed">Відправка фото з підписом та inline кнопками</p>
        </div>

        <div className="p-6 rounded-xl border-2 border-gray-200 opacity-50">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Відео + текст <span className="text-xs font-normal text-gray-400 ml-1">Скоро</span></h3>
          <p className="text-sm text-gray-500 leading-relaxed">Відправка відео з підписом та inline кнопками</p>
        </div>
      </div>
    </div>
  );
}
