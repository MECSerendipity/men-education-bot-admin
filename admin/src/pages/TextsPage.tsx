import { useState, useEffect, useCallback } from 'react';

interface TextEntry {
  key: string;
  value: string;
}

/** Max characters before text gets collapsed */
const MAX_PREVIEW_LENGTH = 150;

/** Search icon */
function SearchIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
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

/** Highlights all occurrences of `query` in `text` with yellow background */
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) {
    return <>{text}</>;
  }

  const parts: Array<{ text: string; highlighted: boolean }> = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let lastIndex = 0;

  let index = lowerText.indexOf(lowerQuery, lastIndex);
  while (index !== -1) {
    if (index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, index), highlighted: false });
    }
    parts.push({ text: text.slice(index, index + query.length), highlighted: true });
    lastIndex = index + query.length;
    index = lowerText.indexOf(lowerQuery, lastIndex);
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), highlighted: false });
  }

  return (
    <>
      {parts.map((part, i) =>
        part.highlighted ? (
          <mark key={i} className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

/** Single text entry card with collapsible content and inline editing */
function TextCard({
  entry,
  search,
  onSave,
}: {
  entry: TextEntry;
  search: string;
  onSave: (key: string, value: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(entry.value);
  const [saving, setSaving] = useState(false);

  const isLong = entry.value.length > MAX_PREVIEW_LENGTH;
  const displayText = isLong && !expanded
    ? entry.value.slice(0, MAX_PREVIEW_LENGTH) + '...'
    : entry.value;

  function handleEdit() {
    setEditValue(entry.value);
    setEditing(true);
    setExpanded(true);
  }

  function handleCancel() {
    setEditing(false);
    setEditValue(entry.value);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(entry.key, editValue);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
          <HighlightedText text={entry.key} query={search} />
        </span>

        {!editing && (
          <button
            onClick={handleEdit}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div>
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            rows={Math.min(Math.max(editValue.split('\n').length, 2), 20)}
            className="w-full p-2 text-sm border border-gray-300 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       resize-y font-mono"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleSave}
              disabled={saving || editValue === entry.value}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md
                         hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                         cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-md
                         hover:bg-gray-200 disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
            <HighlightedText text={displayText} query={search} />
          </p>

          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
            >
              {expanded ? '^ Collapse' : 'v Show full text'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function TextsPage() {
  const [texts, setTexts] = useState<TextEntry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);

  /** Fetch all texts from the API */
  const fetchTexts = useCallback(async () => {
    setLoading(true);
    setError('');
    const token = localStorage.getItem('admin_token');

    try {
      const res = await fetch('/api/texts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load texts');
      const data: TextEntry[] = await res.json();
      setTexts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTexts();
  }, [fetchTexts]);

  /** Save a single text entry via PUT */
  async function handleSave(key: string, value: string) {
    const token = localStorage.getItem('admin_token');
    const res = await fetch(`/api/texts/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ value }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to save');
    }

    // Update local state with the new value
    setTexts((prev) =>
      prev.map((entry) => (entry.key === key ? { ...entry, value } : entry))
    );
    setHasUnsaved(true);
  }

  /** Apply text changes to the running bot */
  async function handleApply() {
    setApplying(true);
    const token = localStorage.getItem('admin_token');
    try {
      const res = await fetch('/api/texts/apply', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to apply');
      }
      setHasUnsaved(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to apply changes');
    } finally {
      setApplying(false);
    }
  }

  /** Filter texts -- contains match on key or value */
  const filtered = texts.filter((entry) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      entry.key.toLowerCase().includes(q) ||
      entry.value.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return <p className="text-gray-500">Loading...</p>;
  }

  if (error) {
    return <p className="text-red-600">{error}</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Texts</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={handleApply}
            disabled={applying || !hasUnsaved}
            className={`px-4 py-1.5 text-sm font-medium rounded-md cursor-pointer transition-colors ${
              hasUnsaved
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            } disabled:opacity-50`}
          >
            {applying ? 'Застосовую...' : 'Застосувати на боті'}
          </button>
          <button
            onClick={fetchTexts}
            title="Refresh texts"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600
                       bg-gray-100 rounded-md hover:bg-gray-200 cursor-pointer transition-colors"
          >
            <RefreshIcon />
            Refresh
          </button>
          <span className="text-sm text-gray-500">
            {filtered.length} of {texts.length} entries
          </span>
        </div>
      </div>

      {/* Search field */}
      <div className="relative mb-6">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <SearchIcon />
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by key or text..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     transition-colors"
        />
      </div>

      {/* Results or empty state */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-gray-300 mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth={1.5} className="w-12 h-12 mx-auto">
              <path strokeLinecap="round" strokeLinejoin="round"
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium">No results found</p>
          <p className="text-gray-400 text-sm mt-1">
            No texts matching "<span className="font-medium">{search}</span>"
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => (
            <TextCard key={entry.key} entry={entry} search={search} onSave={handleSave} />
          ))}
        </div>
      )}
    </div>
  );
}
