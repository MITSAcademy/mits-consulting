/**
 * Threaded comment section — embeds into ClientDetailPage, TrainerDetailPage,
 * or any other detail page.
 * Pass either clientId or trainerId.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import { api } from '@/lib/api';
import { useUI } from '@/store/ui';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Send, Trash2, Pin } from 'lucide-react';
import { useAuth } from '@/store/auth';

interface Comment {
  id: string;
  body: string;
  authorId: string | null;
  authorName: string;
  pinned: boolean;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function CommentSection({
  clientId,
  trainerId,
}: {
  clientId?: string;
  trainerId?: string;
}) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const user = useAuth((s) => s.user);
  const [body, setBody] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const qKey = ['comments', { clientId, trainerId }];
  const qParam = clientId ? `clientId=${clientId}` : `trainerId=${trainerId}`;

  const { data: comments = [], isLoading } = useQuery<Comment[]>({
    queryKey: qKey,
    queryFn: () => api.get(`/comments?${qParam}`).then((r) => r.data),
    enabled: !!(clientId || trainerId),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  const post = useMutation({
    mutationFn: () => api.post('/comments', {
      clientId: clientId || undefined,
      trainerId: trainerId || undefined,
      body: body.trim(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qKey });
      setBody('');
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/comments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
    onError: (e: any) => showToast(e?.response?.data?.error || 'Cannot delete', 'error'),
  });

  const pin = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      api.patch(`/comments/${id}/pin`, { pinned }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <div className="card">
      <div className="card-h">
        <span>Comments</span>
        <span className="muted normal-case text-xs">{comments.length} total</span>
      </div>

      {/* Thread */}
      <div className="space-y-2 mb-3 max-h-[400px] overflow-y-auto pr-1">
        {isLoading && <div className="muted text-xs">Loading…</div>}
        {!isLoading && comments.length === 0 && (
          <div className="muted text-[12px] text-center py-4">No comments yet.</div>
        )}
        {comments.map((c) => (
          <div key={c.id} className="group relative rounded-xl p-3" style={{
            background: c.pinned ? 'rgba(245,158,11,0.07)' : 'var(--bg-input)',
            border: `1px solid ${c.pinned ? 'rgba(245,158,11,0.3)' : 'var(--brand-borderSoft)'}`,
          }}>
            {c.pinned && (
              <div className="absolute top-2 right-2 flex items-center gap-1"
                style={{ color: 'var(--accent-gold)' }}>
                <Pin size={10}/>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-[11px] font-bold" style={{ color: 'var(--accent-gold)' }}>{c.authorName}</span>
              <span className="text-[10px] muted">{timeAgo(c.createdAt)}</span>
            </div>
            <div className="text-[12px] whitespace-pre-wrap" style={{ color: 'var(--brand-text)' }}>{c.body}</div>

            {/* Hover actions */}
            <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {user?.role === 'founder' && (
                <button onClick={() => pin.mutate({ id: c.id, pinned: !c.pinned })}
                  title={c.pinned ? 'Unpin' : 'Pin'} className="hover:opacity-80">
                  <Pin size={11} style={{ color: c.pinned ? 'var(--accent-gold)' : 'var(--brand-textMuted)' }}/>
                </button>
              )}
              <button onClick={() => del.mutate(c.id)} title="Delete" className="hover:opacity-80">
                <Trash2 size={11} style={{ color: 'var(--status-red)' }}/>
              </button>
            </div>
          </div>
        ))}
        <div ref={bottomRef}/>
      </div>

      {/* Composer */}
      <div className="flex gap-2">
        <Textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a comment… (⌘↵ to post)"
          className="!text-[12px] flex-1 resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && body.trim()) post.mutate();
          }}
        />
        <Button
          variant="primary"
          disabled={!body.trim() || post.isPending}
          onClick={() => post.mutate()}
          className="self-end"
        >
          <Send size={13}/>
        </Button>
      </div>
    </div>
  );
}
