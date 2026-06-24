import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check } from 'lucide-react';
import { api } from '@/lib/api';

type Notification = {
  id: string;
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
  readAt?: string | null;
  createdAt: string;
};

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Polling cadences are deliberately slow — the backend is on Render free tier
  // (256 MB / 0.1 CPU) and aggressive polling was slowing every page. Window
  // focus refetch keeps things feeling live without constant network chatter.
  const { data: list } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    // Only fetch the list when the dropdown is open OR on a fresh page load —
    // otherwise rely on refetchOnWindowFocus.
    queryFn: () => api.get('/notifications').then((r) => r.data),
    refetchInterval: open ? 5 * 60_000 : false,
    refetchOnWindowFocus: true,
    staleTime: 5 * 60_000,
  });

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.get('/notifications/unread-count').then((r) => r.data),
    refetchInterval: 10 * 60_000,
    refetchOnWindowFocus: true,
    staleTime: 5 * 60_000,
  });

  const unread = countData?.count ?? 0;

  const markOne = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAll = useMutation({
    mutationFn: () => api.post(`/notifications/read-all`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function clickItem(n: Notification) {
    if (!n.readAt) markOne.mutate(n.id);
    if (n.link) navigate(n.link);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg transition-all hover:bg-bg-cardHover"
        title="Notifications"
        aria-label="Notifications"
        style={{ border: '1px solid var(--brand-borderSoft)' }}
      >
        <Bell
          size={18}
          style={{
            color: unread > 0 ? 'var(--accent-gold)' : undefined,
            // Tiny "shake" when unread > 0 so it draws the eye on page load
            animation: unread > 0 ? 'bellWiggle 4s ease-in-out infinite' : undefined,
          }}
        />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 text-[10px] font-bold rounded-full px-1 min-w-[17px] h-[17px] flex items-center justify-center"
            style={{
              background: 'var(--status-red)',
              color: 'white',
              lineHeight: 1,
              boxShadow: '0 2px 6px rgba(239,68,68,0.45), 0 0 0 2px var(--bg-page)',
              animation: 'unreadPop 360ms cubic-bezier(0.18, 0.89, 0.32, 1.28) both',
            }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 w-[380px] max-h-[500px] overflow-y-auto rounded-2xl z-50"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--brand-border)',
            boxShadow: '0 16px 50px rgba(0,0,0,0.35), 0 0 0 1px rgba(229,178,76,0.06)',
            animation: 'notifDropIn 220ms cubic-bezier(0.2, 0.9, 0.25, 1) both',
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-2.5 sticky top-0 z-10"
            style={{
              background: 'var(--bg-card)',
              borderBottom: '1px solid var(--brand-border)',
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight">Notifications</span>
              {unread > 0 && (
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ background: 'var(--accent-goldSoft)', color: 'var(--accent-gold)' }}
                >
                  {unread} new
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={() => markAll.mutate()}
                className="text-[11px] font-medium flex items-center gap-1 transition-colors"
                style={{ color: 'var(--accent-gold)' }}
                title="Mark all as read"
              >
                <Check size={11} /> Mark all read
              </button>
            )}
          </div>
          {!list || list.length === 0 ? (
            <div className="py-10 px-6 text-center">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2"
                style={{ background: 'var(--bg-cardHover)' }}
              >
                <Bell size={18} style={{ color: 'var(--brand-textMuted)' }} />
              </div>
              <div className="text-[13px] font-semibold mb-1">All caught up</div>
              <div className="text-[11px] muted">You'll see new updates here as they arrive.</div>
            </div>
          ) : (
            list.map((n) => (
              <button
                key={n.id}
                onClick={() => clickItem(n)}
                className="w-full text-left px-4 py-2.5 transition-colors"
                style={{
                  borderBottom: '1px solid var(--brand-borderSoft)',
                  background: n.readAt ? 'transparent' : 'var(--accent-goldSoft)',
                  opacity: n.readAt ? 0.65 : 1,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-cardHover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = n.readAt ? 'transparent' : 'var(--accent-goldSoft)'; }}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                      background: n.readAt ? 'transparent' : 'var(--accent-gold)',
                      boxShadow: n.readAt ? 'none' : '0 0 6px rgba(229,178,76,0.5)',
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-semibold leading-snug" style={{ color: 'var(--brand-text)' }}>
                      {n.title}
                    </div>
                    {n.body && (
                      <div className="text-[11px] muted mt-0.5 leading-snug">{n.body}</div>
                    )}
                    <div className="text-[10px] muted mt-1.5">{timeAgo(n.createdAt)}</div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
      <style>{`
        @keyframes bellWiggle {
          0%, 92%, 100% { transform: rotate(0); }
          94%           { transform: rotate(-9deg); }
          96%           { transform: rotate(7deg); }
          98%           { transform: rotate(-4deg); }
        }
        @keyframes unreadPop {
          from { opacity: 0; transform: scale(0.4); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes notifDropIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
      `}</style>
    </div>
  );
}
