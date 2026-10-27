'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, Plus, Trash2, X } from 'lucide-react';
import { EmbedToken, embedService } from '@/services/embedService';

interface EmbedCodeModalProps {
  tourId: string;
  tourName?: string;
  isPublished: boolean;
  onClose: () => void;
}

type SizeOption = 'responsive' | 'fixed';

// Manage embed keys and copy the code to show a tour on another website
export default function EmbedCodeModal({ tourId, tourName, isPublished, onClose }: EmbedCodeModalProps) {
  const [origin, setOrigin] = useState('');
  const [keys, setKeys] = useState<EmbedToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDomains, setNewDomains] = useState('');
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const [size, setSize] = useState<SizeOption>('responsive');
  const [height, setHeight] = useState(600);
  const [copied, setCopied] = useState<string | null>(null);

  const activeKeys = keys.filter((k) => !k.revoked_at);
  const selected = activeKeys.find((k) => k.id === selectedId) || activeKeys[0];

  const loadKeys = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await embedService.list(tourId);
      setKeys(list);
      if (list.filter((k) => !k.revoked_at).length === 0) setShowCreate(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load embed keys');
    } finally {
      setLoading(false);
    }
  }, [tourId]);

  useEffect(() => {
    setOrigin(window.location.origin);
    loadKeys();
  }, [loadKeys]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleCreate = async () => {
    try {
      setCreating(true);
      setError(null);
      const domains = newDomains.split(/[\s,]+/).map((d) => d.trim()).filter(Boolean);
      const created = await embedService.create(tourId, { name: newName.trim() || 'Website embed', allowed_domains: domains });
      setKeys((prev) => [created, ...prev]);
      setSelectedId(created.id);
      setShowCreate(false);
      setNewName('');
      setNewDomains('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create embed key');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (key: EmbedToken) => {
    if (!window.confirm(`Revoke "${key.name}"? Websites using this key will stop showing the tour immediately.`)) return;
    try {
      setRevokingId(key.id);
      setError(null);
      await embedService.revoke(tourId, key.id);
      setKeys((prev) => prev.map((k) => (k.id === key.id ? { ...k, revoked_at: new Date().toISOString() } : k)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke embed key');
    } finally {
      setRevokingId(null);
    }
  };

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  const title = (tourName || 'Virtual tour').replace(/"/g, '&quot;');
  const sizeAttr = size === 'fixed' ? ` data-height="${height}px"` : '';
  const snippets = selected
    ? [
        {
          id: 'script',
          label: 'Embed code (recommended)',
          hint: 'Paste into any web page. It resizes for phones automatically.',
          text: `<div data-nimto-embed="${selected.token}"${sizeAttr} data-title="${title}"></div>\n<script src="${origin}/embed.js" async></script>`,
        },
        {
          id: 'iframe',
          label: 'iFrame',
          hint: 'For website builders that block scripts (Wix, Squarespace, some WordPress themes).',
          text: `<iframe src="${origin}/embed/${selected.token}" width="100%" height="${height}"\n  style="border:0;border-radius:12px" allow="fullscreen; autoplay; accelerometer; gyroscope"\n  allowfullscreen loading="lazy" title="${title}"></iframe>`,
        },
      ]
    : [];

  const domainsLabel = (key: EmbedToken) => (key.allowed_domains ? key.allowed_domains.split(',').join(', ') : 'Any website');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="embed-title"
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
          <div>
            <h2 id="embed-title" className="text-lg font-semibold text-gray-900">Embed this tour on a website</h2>
            <p className="mt-1 text-sm text-gray-600">
              Websites need an embed key to show the tour. Revoke a key to remove the tour from that site.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-lg text-gray-500 hover:bg-gray-100 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {!isPublished && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              This tour is still a draft. Embeds show &quot;not available&quot; until the tour is published.
            </p>
          )}
          {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

          {/* Keys */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Embed keys</h3>
              {!showCreate && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-blue-700 hover:bg-blue-50 cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> New key
                </button>
              )}
            </div>

            {loading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading keys...
              </div>
            ) : (
              <ul className="space-y-2">
                {activeKeys.map((key) => (
                  <li
                    key={key.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 ${selected?.id === key.id ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200'}`}
                  >
                    <button onClick={() => setSelectedId(key.id)} className="flex flex-1 items-start gap-3 text-left min-w-0 cursor-pointer">
                      <KeyRound className="mt-0.5 w-4 h-4 flex-shrink-0 text-gray-500" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900 truncate">{key.name}</span>
                        <span className="block text-xs text-gray-500 truncate">
                          {domainsLabel(key)}
                          {key.last_used_at ? ` · last used ${new Date(key.last_used_at).toLocaleDateString()}` : ' · not used yet'}
                        </span>
                      </span>
                    </button>
                    <button
                      onClick={() => handleRevoke(key)}
                      disabled={revokingId === key.id}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 cursor-pointer disabled:opacity-50"
                    >
                      {revokingId === key.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      Revoke
                    </button>
                  </li>
                ))}
                {activeKeys.length === 0 && !showCreate && <li className="text-sm text-gray-500">No active keys.</li>}
              </ul>
            )}

            {showCreate && (
              <div className="mt-3 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <label className="block">
                  <span className="text-sm font-medium text-gray-900">Key name</span>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    maxLength={100}
                    placeholder="e.g. Company website"
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-gray-900">Allowed websites</span>
                  <span className="ml-1 text-xs text-gray-500">(recommended)</span>
                  <textarea
                    value={newDomains}
                    onChange={(e) => setNewDomains(e.target.value)}
                    rows={2}
                    placeholder={'example.com\n*.example.com'}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  />
                  <span className="mt-1 block text-xs text-gray-500">
                    One per line. The key only works on these sites, so a copied key can&apos;t be reused elsewhere. Leave empty to allow any site.
                  </span>
                </label>
                <div className="flex justify-end gap-2">
                  {activeKeys.length > 0 && (
                    <button onClick={() => setShowCreate(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 cursor-pointer">
                      Cancel
                    </button>
                  )}
                  <button
                    onClick={handleCreate}
                    disabled={creating}
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 cursor-pointer disabled:opacity-50"
                  >
                    {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                    Create key
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Code for the selected key */}
          {selected && (
            <section className="space-y-4 border-t pt-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold text-gray-900">Code for &quot;{selected.name}&quot;</span>
                <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
                  {(['responsive', 'fixed'] as const).map((option) => (
                    <button
                      key={option}
                      onClick={() => setSize(option)}
                      className={`px-3 py-1 rounded-md text-xs font-medium cursor-pointer ${size === option ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                    >
                      {option === 'responsive' ? 'Responsive (16:9)' : 'Fixed height'}
                    </button>
                  ))}
                </div>
                {size === 'fixed' && (
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="number"
                      min={300}
                      max={1200}
                      step={50}
                      value={height}
                      onChange={(e) => setHeight(Math.max(300, Math.min(1200, Number(e.target.value) || 600)))}
                      className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-gray-900"
                    />
                    px
                  </label>
                )}
              </div>

              {snippets.map((snippet) => (
                <div key={snippet.id}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900">{snippet.label}</h4>
                      <p className="text-xs text-gray-500">{snippet.hint}</p>
                    </div>
                    <button
                      onClick={() => copy(snippet.id, snippet.text)}
                      className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 cursor-pointer"
                    >
                      {copied === snippet.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copied === snippet.id ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-gray-900 p-3 text-xs text-gray-100">{snippet.text}</pre>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
