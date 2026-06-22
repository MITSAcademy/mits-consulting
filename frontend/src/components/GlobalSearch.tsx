import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Search, Users, UserCog, User, X } from 'lucide-react';

interface SearchResults {
  clients: Array<{ id: string; name: string; lifecycle: string; assignedAmId: string | null }>;
  trainers: Array<{ id: string; name: string; skills: string[] }>;
  users: Array<{ id: string; name: string; role: string }>;
}

let _setOpen: ((open: boolean) => void) | null = null;

export function openGlobalSearch() {
  _setOpen?.(true);
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const debouncedQ = useDebounce(q, 300);

  // Register setter so external code can open
  useEffect(() => {
    _setOpen = setOpen;
    return () => { _setOpen = null; };
  }, []);

  // Keyboard shortcut Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Auto-focus when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQ('');
    }
  }, [open]);

  const { data, isFetching } = useQuery<SearchResults>({
    queryKey: ['global-search', debouncedQ],
    queryFn: () => api.get('/search', { params: { q: debouncedQ } }).then((r) => r.data),
    enabled: debouncedQ.length >= 2,
    staleTime: 30_000,
  });

  const close = useCallback(() => setOpen(false), []);

  const go = (path: string) => {
    navigate(path);
    close();
  };

  const hasResults = data && (data.clients.length > 0 || data.trainers.length > 0 || data.users.length > 0);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-start justify-center pt-[15vh]"
      style={{ background: 'rgba(10,12,18,0.75)', backdropFilter: 'blur(6px)', zIndex: 9999 }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        className="w-full max-w-xl mx-4 rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)', boxShadow: '0 32px 64px rgba(0,0,0,0.6)' }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          <Search size={16} style={{ color: 'var(--brand-textMuted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search clients, trainers, people…"
            className="flex-1 bg-transparent outline-none text-[14px]"
            style={{ color: 'var(--brand-text)' }}
          />
          {q && (
            <button onClick={() => setQ('')} style={{ color: 'var(--brand-textMuted)' }}>
              <X size={14} />
            </button>
          )}
          <kbd className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-input)', color: 'var(--brand-textMuted)', border: '1px solid var(--brand-borderSoft)' }}>
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto py-2">
          {debouncedQ.length < 2 ? (
            <div className="text-[13px] text-center py-8" style={{ color: 'var(--brand-textMuted)' }}>
              Type at least 2 characters to search
            </div>
          ) : isFetching && !data ? (
            <div className="text-[13px] text-center py-8" style={{ color: 'var(--brand-textMuted)' }}>Searching…</div>
          ) : !hasResults ? (
            <div className="text-[13px] text-center py-8" style={{ color: 'var(--brand-textMuted)' }}>No results for "{debouncedQ}"</div>
          ) : (
            <>
              {data!.clients.length > 0 && (
                <ResultGroup label="Clients" icon={Users}>
                  {data!.clients.map((c) => (
                    <ResultRow key={c.id} onClick={() => go(`/clients/${c.id}`)}>
                      <span className="font-medium text-[13px]">{c.name}</span>
                      <span className="text-[11px] ml-auto" style={{ color: 'var(--brand-textMuted)' }}>{c.lifecycle}</span>
                    </ResultRow>
                  ))}
                </ResultGroup>
              )}
              {data!.trainers.length > 0 && (
                <ResultGroup label="Trainers" icon={UserCog}>
                  {data!.trainers.map((t) => (
                    <ResultRow key={t.id} onClick={() => go(`/trainers/${t.id}`)}>
                      <span className="font-medium text-[13px]">{t.name}</span>
                      {t.skills?.length > 0 && (
                        <span className="text-[11px] ml-auto truncate max-w-[180px]" style={{ color: 'var(--brand-textMuted)' }}>{t.skills.slice(0, 3).join(', ')}</span>
                      )}
                    </ResultRow>
                  ))}
                </ResultGroup>
              )}
              {data!.users.length > 0 && (
                <ResultGroup label="People" icon={User}>
                  {data!.users.map((u) => (
                    <ResultRow key={u.id} onClick={close}>
                      <span className="font-medium text-[13px]">{u.name}</span>
                      <span className="text-[11px] ml-auto capitalize" style={{ color: 'var(--brand-textMuted)' }}>{u.role.replace(/_/g, ' ')}</span>
                    </ResultRow>
                  ))}
                </ResultGroup>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ResultGroup({ label, icon: Icon, children }: { label: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-1.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--brand-textMuted)' }}>
        <Icon size={11} />
        {label}
      </div>
      {children}
    </div>
  );
}

function ResultRow({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors"
      style={{ color: 'var(--brand-text)' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-cardHover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}
