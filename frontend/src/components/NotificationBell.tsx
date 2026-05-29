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
    refetchInterval: open ? 60_000 : false,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.get('/notifications/unread-count').then((r) => r.data),
    refetchInterval: 120_000, // 2 min — was 30s
    refetchOnWindowFocus: true,
    staleTime: 60_000,
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
        className="relative p-2 rounded hover:bg-bg-input"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 bg-brand-red text-white text-[10px] font-bold rounded-full px-1 min-w-[16px] h-[16px] flex items-center justify-center"
            style={{ lineHeight: 1 }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-[360px] max-h-[480px] overflow-y-auto rounded-md border border-brand-border bg-bg-card shadow-lg z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-brand-border">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button
                onClick={() => markAll.mutate()}
                className="text-[11px] text-brand-blue hover:underline flex items-center gap-1"
                title="Mark all as read"
              >
                <Check size={11} /> Mark all read
              </button>
            )}
          </div>
          {!list || list.length === 0 ? (
            <div className="muted text-sm py-6 text-center">No notifications yet.</div>
          ) : (
            list.map((n) => (
              <button
                key={n.id}
                onClick={() => clickItem(n)}
                className={`w-full text-left px-3 py-2 border-b border-brand-border hover:bg-bg-input ${n.readAt ? 'opacity-60' : 'bg-bg-input/30'}`}
              >
                <div className="flex items-start gap-2">
                  {!n.readAt && (
                    <span className="mt-1.5 w-2 h-2 rounded-full bg-brand-blue flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium leading-snug">{n.title}</div>
                    {n.body && <div className="text-[11px] muted mt-0.5 leading-snug">{n.body}</div>}
                    <div className="text-[10px] muted mt-1">{timeAgo(n.createdAt)}</div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
