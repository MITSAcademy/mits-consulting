/**
 * Mitali's payment follow-up workspace.
 *
 * Mirrors the "MITS Accounts (Managed by Mitali)" sheet:
 *   Client | Pay Date 1 | Pay Date 2 | Amount | Account | Comments | Actions
 *
 * Key rules:
 * - payDate1 = last collected date (reference)
 * - payDate2 = next due date (what Mitali is chasing)
 * - "Payment done" → payDate1 ← payDate2, enter new payDate2
 * - Leverage = extend payDate2 by max 3 days, reason auto-logged as comment
 * - Feedback must be taken ≤3 days before payDate2
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUI } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { EmptyState } from '@/components/EmptyState';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Label, Textarea } from '@/components/ui/input';
import {
  AlertTriangle, CheckCircle2, Clock, MessageSquare,
  Send, Pin, Trash2, Users, LayoutList, Table2
} from 'lucide-react';
import { minFutureDate, maxTodayDate, minPastDate } from '@/lib/utils';

// ─── types ────────────────────────────────────────────────────────────────────

interface LatestComment { id: string; body: string; authorName: string; createdAt: string; }

interface Row {
  id: string;
  name: string;
  currency: string;
  cycleAmount: number;
  engagementType: string;
  payDate1: string | null;
  payDate2: string | null;
  daysUntilDue: number | null;
  leverageUntil: string | null;
  leverageNote: string | null;
  lastFeedbackTakenAt: string | null;
  lastLeverageAskedAt: string | null;
  paymentPendingVaibhav: boolean;
  isEmployerCall: boolean;
  employerName: string | null;
  hostOwner: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  accountName: string | null;
  clientGroupLink: string | null;
  primaryTrainer: { id: string; name: string; phone: string | null; groupLink: string | null } | null;
  trainingId: string | null;
  trainingName: string | null;
  followupNote: string | null;
  followupNoteAt: string | null;
  latestComment: LatestComment | null;
  feedbackNeeded: boolean;
  status: 'pending_vaibhav' | 'paid' | 'overdue' | 'due_soon' | 'no_date' | 'deferred';
  paymentCount: number;
  payments: { id: string; amount: number; currency: string; paymentDate: string; receivedBy: { name: string } | null }[];
}

interface Comment {
  id: string; body: string; authorId: string | null;
  authorName: string; pinned: boolean; createdAt: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]}`;
}

function daysAgoLabel(date: string | null): string {
  if (!date) return '—';
  const d = Math.floor((Date.now() - Date.parse(date)) / 86_400_000);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d}d ago`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── stat card ────────────────────────────────────────────────────────────────

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest font-semibold mb-1" style={{ color: 'var(--brand-textMuted)' }}>{label}</div>
      <div className="text-[28px] font-extrabold leading-none" style={{ color: value > 0 ? color : 'var(--brand-text)' }}>
        {value}
      </div>
    </div>
  );
}

// ─── status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ r }: { r: Row }) {
  if (r.status === 'overdue') return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--status-red)', border: '1px solid rgba(239,68,68,0.3)' }}>
      <AlertTriangle size={10}/> Overdue {r.daysUntilDue !== null ? `${Math.abs(r.daysUntilDue)}d` : ''}
    </span>
  );
  if (r.status === 'due_soon') return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--status-amber)', border: '1px solid rgba(245,158,11,0.3)' }}>
      <Clock size={10}/> Due in {r.daysUntilDue}d
    </span>
  );
  if (r.status === 'pending_vaibhav') return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--status-amber)', border: '1px solid rgba(245,158,11,0.3)' }}>
      <AlertTriangle size={10}/> Pending on Vaibhav
    </span>
  );
  if (r.status === 'deferred') return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}>
      <Clock size={10}/> Deferred{r.leverageUntil ? ` until ${r.leverageUntil}` : ''}
    </span>
  );
  if (r.status === 'paid') return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: 'rgba(34,197,94,0.10)', color: 'var(--status-green)', border: '1px solid rgba(34,197,94,0.25)' }}>
      <CheckCircle2 size={10}/> Done
    </span>
  );
  return <span className="text-[11px] muted">No date set</span>;
}

// ─── comment thread panel ─────────────────────────────────────────────────────

function CommentThread({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [body, setBody] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: comments = [], isLoading } = useQuery<Comment[]>({
    queryKey: ['comments', { clientId }],
    queryFn: () => api.get(`/comments?clientId=${clientId}`).then((r) => r.data),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  const post = useMutation({
    mutationFn: () => api.post('/comments', { clientId, body: body.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments', { clientId }] });
      qc.invalidateQueries({ queryKey: ['follow-up-payments'] });
      setBody('');
      showToast('Comment added');
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/comments/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['comments', { clientId }] }); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Cannot delete', 'error'),
  });

  const content = (
    <div
      className="fixed inset-0 flex items-end justify-end"
      style={{ zIndex: 9999 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col"
        style={{
          width: 380, height: '80vh',
          background: 'var(--bg-card)',
          border: '1px solid var(--brand-border)',
          borderRadius: '16px 16px 0 0',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
          margin: '0 24px',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--brand-borderSoft)' }}>
          <span className="font-bold text-sm">Comments</span>
          <button onClick={onClose} className="muted text-lg leading-none hover:opacity-70">&times;</button>
        </div>

        {/* Thread */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {isLoading ? <div className="muted text-xs">Loading…</div> : null}
          {!isLoading && comments.length === 0 && (
            <div className="muted text-xs text-center mt-8">No comments yet. Be the first.</div>
          )}
          {comments.map((c) => (
            <div key={c.id} className="group relative rounded-xl p-2.5" style={{
              background: c.pinned ? 'rgba(245,158,11,0.08)' : 'var(--bg-input)',
              border: `1px solid ${c.pinned ? 'rgba(245,158,11,0.3)' : 'var(--brand-borderSoft)'}`,
            }}>
              {c.pinned && <Pin size={10} className="absolute top-2 right-2" style={{ color: 'var(--accent-gold)' }}/>}
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-[11px] font-semibold" style={{ color: 'var(--accent-gold)' }}>{c.authorName}</span>
                <span className="text-[10px] muted">{timeAgo(c.createdAt)}</span>
              </div>
              <div className="text-[12px] whitespace-pre-wrap" style={{ color: 'var(--brand-text)' }}>{c.body}</div>
              <button
                onClick={() => del.mutate(c.id)}
                className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                title="Delete (own, within 5 min)"
              >
                <Trash2 size={11} style={{ color: 'var(--status-red)' }}/>
              </button>
            </div>
          ))}
          <div ref={bottomRef}/>
        </div>

        {/* Input */}
        <div className="px-3 pb-3 pt-2" style={{ borderTop: '1px solid var(--brand-borderSoft)' }}>
          <div className="flex gap-2">
            <Textarea
              rows={2}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add a comment…"
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
          <div className="text-[10px] muted mt-1">⌘↵ to post</div>
        </div>
      </div>
    </div>
  );
  return createPortal(content, document.body);
}

// ─── "Payment done" modal ─────────────────────────────────────────────────────

function AdvancePaymentModal({ r, onClose }: { r: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const defaultNext = r.payDate2 ? addDays(r.payDate2, 14) : addDays(todayISO(), 14);
  const [newDate2, setNewDate2] = useState(defaultNext);
  const [amountReceived, setAmountReceived] = useState(String(r.cycleAmount || ''));

  const adv = useMutation({
    mutationFn: () => api.post(`/follow-up-payments/${r.id}/advance-payment`, {
      newDate2,
      amountReceived: amountReceived ? Number(amountReceived) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['follow-up-payments'] });
      showToast(`Payment done ✓ — ${r.currency} ${amountReceived || r.cycleAmount} recorded · next due ${fmtDate(newDate2)}`);
      onClose();
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const content = (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 9999, background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-2xl p-5 w-[380px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}>
        <div className="font-bold text-sm mb-1">Mark payment done — {r.name}</div>
        <div className="muted text-[11px] mb-4">
          Current due date: <strong>{fmtDate(r.payDate2)}</strong> → moves to Pay Date 1.<br/>
          Enter the amount received and set the next due date.
        </div>
        <div className="flex flex-col gap-3">
          <div className="form-row">
            <Label>Amount received ({r.currency})</Label>
            <Input
              type="number"
              min="0"
              value={amountReceived}
              onChange={(e) => setAmountReceived(e.target.value)}
              placeholder={String(r.cycleAmount || '')}
            />
          </div>
          <div className="form-row">
            <Label>Next payment due date</Label>
            <Input type="date" value={newDate2} min={todayISO()} onChange={(e) => setNewDate2(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 mt-4 justify-end">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!newDate2 || adv.isPending} onClick={() => adv.mutate()}>
            {adv.isPending ? 'Saving…' : 'Confirm done'}
          </Button>
        </div>
      </div>
    </div>
  );
  return createPortal(content, document.body);
}

// ─── leverage modal ───────────────────────────────────────────────────────────

function LeverageModal({ r, onClose }: { r: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const base = r.payDate2 || todayISO();
  const maxDate = addDays(base, 3);
  const [newDate2, setNewDate2] = useState(addDays(base, 1));
  const [note, setNote] = useState('');

  const lev = useMutation({
    mutationFn: () => api.post(`/follow-up-payments/${r.id}/leverage`, { newDate2, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['follow-up-payments'] });
      qc.invalidateQueries({ queryKey: ['comments', { clientId: r.id }] });
      showToast(`Leverage granted — due extended to ${fmtDate(newDate2)}`);
      onClose();
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const content = (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 9999, background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-2xl p-5 w-[360px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}>
        <div className="font-bold text-sm mb-1">Grant leverage — {r.name}</div>
        <div className="muted text-[11px] mb-3">
          Client can't pay yet. Extend due date by <strong>max 3 days</strong> (until {fmtDate(maxDate)}).<br/>
          The extension is auto-logged as a comment.
        </div>
        {r.leverageUntil && (
          <div className="text-[11px] mb-3 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--status-amber)' }}>
            Already extended to {fmtDate(r.leverageUntil)}{r.leverageNote ? ` · ${r.leverageNote}` : ''}
          </div>
        )}
        <div className="form-row mb-3">
          <Label>New due date (max {fmtDate(maxDate)})</Label>
          <Input type="date" value={newDate2} min={todayISO()} max={maxDate}
            onChange={(e) => setNewDate2(e.target.value)} />
        </div>
        <div className="form-row">
          <Label>Reason (logged as comment)</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Client travelling, will pay Monday" />
        </div>
        <div className="flex gap-2 mt-4 justify-end">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!newDate2 || newDate2 > maxDate || lev.isPending} onClick={() => lev.mutate()}>
            {lev.isPending ? 'Saving…' : 'Grant leverage'}
          </Button>
        </div>
      </div>
    </div>
  );
  return createPortal(content, document.body);
}

// ─── edit pay dates modal ─────────────────────────────────────────────────────

function EditDatesModal({ r, onClose }: { r: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [date1, setDate1] = useState(r.payDate1 || '');
  const [date2, setDate2] = useState(r.payDate2 || '');

  const save = useMutation({
    mutationFn: () => api.post(`/follow-up-payments/${r.id}/set-pay-dates`, { date1: date1 || null, date2: date2 || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['follow-up-payments'] });
      showToast('Dates updated');
      onClose();
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const content = (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 9999, background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-2xl p-5 w-[340px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}>
        <div className="font-bold text-sm mb-3">Edit payment dates — {r.name}</div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="form-row">
            <Label>Pay Date 1 (last paid)</Label>
            <Input type="date" value={date1} min={minPastDate()} max={maxTodayDate()} onChange={(e) => setDate1(e.target.value)} />
          </div>
          <div className="form-row">
            <Label>Pay Date 2 (next due)</Label>
            <Input type="date" value={date2} onChange={(e) => setDate2(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
  return createPortal(content, document.body);
}

// ─── incomplete nag modal ─────────────────────────────────────────────────────

function IncompleteNagModal({ clients, onDone }: { clients: Row[]; onDone: () => void }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);

  // Per-client inline state: date2 + amount + currency + promised
  const [state, setState] = useState<Record<string, { date2: string; amount: string; currency: string; promised: boolean }>>(() => {
    const s: Record<string, { date2: string; amount: string; currency: string; promised: boolean }> = {};
    for (const c of clients) {
      s[c.id] = { date2: c.payDate2 || '', amount: c.cycleAmount ? String(c.cycleAmount) : '', currency: c.currency || 'USD', promised: false };
    }
    return s;
  });

  const saveDate = useMutation({
    mutationFn: ({ id, date2 }: { id: string; date2: string }) =>
      api.post(`/follow-up-payments/${id}/set-pay-dates`, { date1: null, date2 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['follow-up-payments'] }),
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed to save date', 'error'),
  });

  const saveAmount = useMutation({
    mutationFn: ({ id, amount, currency }: { id: string; amount: number; currency: string }) =>
      api.patch(`/follow-up-payments/${id}/amount`, { cycleAmount: amount, currency, reason: 'Set via incomplete-data prompt' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['follow-up-payments'] }),
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed to save amount', 'error'),
  });

  const pending = clients.filter((c) => !state[c.id]?.promised);

  async function handleSave(c: Row) {
    const s = state[c.id];
    const promises: Promise<any>[] = [];
    if (s.date2 && s.date2 !== c.payDate2) promises.push(saveDate.mutateAsync({ id: c.id, date2: s.date2 }));
    if (s.amount && Number(s.amount) > 0 && Number(s.amount) !== c.cycleAmount)
      promises.push(saveAmount.mutateAsync({ id: c.id, amount: Number(s.amount), currency: s.currency }));
    if (promises.length) await Promise.all(promises);
    setState((prev) => ({ ...prev, [c.id]: { ...prev[c.id], promised: true } }));
  }

  function handlePromise(id: string) {
    setState((prev) => ({ ...prev, [id]: { ...prev[id], promised: true } }));
  }

  const allDone = pending.length === 0;

  const content = (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 9999, background: 'rgba(0,0,0,0.75)' }}>
      <div className="rounded-2xl flex flex-col" style={{
        background: 'var(--bg-card)', border: '2px solid #f87171',
        width: 560, maxHeight: '85vh', overflow: 'hidden',
      }}>
        {/* Header */}
        <div className="px-5 py-4 flex items-start gap-3" style={{ borderBottom: '1px solid var(--brand-border)', background: '#fff5f5' }}>
          <div style={{ fontSize: 28 }}>⚠️</div>
          <div>
            <div className="font-bold text-[15px]" style={{ color: '#b91c1c' }}>
              {clients.length} client{clients.length > 1 ? 's' : ''} with incomplete data
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: '#6b7280' }}>
              Please fill in the next due date and amount for each client before proceeding.
              If you don't have this information yet, click <strong>"I'll fill this soon — I promise"</strong>.
            </div>
          </div>
        </div>

        {/* Scrollable client list */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {clients.map((c) => {
            const s = state[c.id];
            const isDone = s.promised;
            const missingDate = !c.payDate2;
            const missingAmount = !c.cycleAmount || c.cycleAmount === 0;
            return (
              <div key={c.id} className="rounded-xl p-3" style={{
                background: isDone ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.05)',
                border: `1px solid ${isDone ? '#86efac' : '#fca5a5'}`,
                opacity: isDone ? 0.6 : 1,
              }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-[13px]">{c.name}</div>
                  {isDone && <span className="text-[11px] font-bold" style={{ color: '#16a34a' }}>✓ Saved / Promised</span>}
                </div>
                {!isDone && (
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {missingDate && (
                      <div>
                        <div className="text-[10px] font-semibold mb-1" style={{ color: '#b91c1c' }}>⚠ Next Due Date missing</div>
                        <input
                          type="date"
                          value={s.date2}
                          onChange={(e) => setState((prev) => ({ ...prev, [c.id]: { ...prev[c.id], date2: e.target.value } }))}
                          className="w-full text-[12px] px-2 py-1.5 rounded-lg"
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
                        />
                      </div>
                    )}
                    {missingAmount && (
                      <div>
                        <div className="text-[10px] font-semibold mb-1" style={{ color: '#b91c1c' }}>⚠ Amount missing</div>
                        <div className="flex gap-1">
                          <select
                            value={s.currency}
                            onChange={(e) => setState((prev) => ({ ...prev, [c.id]: { ...prev[c.id], currency: e.target.value } }))}
                            className="text-[12px] px-1 py-1.5 rounded-lg"
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)', width: 70 }}
                          >
                            {['USD','CAD','GBP','AED','INR'].map(cur => <option key={cur} value={cur}>{cur}</option>)}
                          </select>
                          <input
                            type="number"
                            value={s.amount}
                            min={0}
                            placeholder="e.g. 650"
                            onChange={(e) => setState((prev) => ({ ...prev, [c.id]: { ...prev[c.id], amount: e.target.value } }))}
                            className="flex-1 text-[12px] px-2 py-1.5 rounded-lg"
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {!isDone && (
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => handleSave(c)}
                      disabled={saveDate.isPending || saveAmount.isPending}
                      className="flex-1 text-[11px] font-bold py-1.5 rounded-lg"
                      style={{ background: '#1d4ed8', color: '#fff', border: 'none', cursor: 'pointer' }}
                    >
                      Save &amp; Done
                    </button>
                    <button
                      onClick={() => handlePromise(c.id)}
                      className="flex-1 text-[11px] py-1.5 rounded-lg"
                      style={{ background: 'transparent', color: '#9ca3af', border: '1px solid var(--brand-border)', cursor: 'pointer' }}
                    >
                      I'll fill this soon — I promise
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex justify-between items-center" style={{ borderTop: '1px solid var(--brand-border)' }}>
          <div className="text-[11px]" style={{ color: '#9ca3af' }}>
            {pending.length > 0 ? `${pending.length} client${pending.length > 1 ? 's' : ''} still need attention` : 'All addressed ✓'}
          </div>
          <button
            onClick={onDone}
            disabled={!allDone}
            className="text-[12px] font-bold px-4 py-2 rounded-lg"
            style={{
              background: allDone ? '#16a34a' : 'var(--bg-input)',
              color: allDone ? '#fff' : '#9ca3af',
              border: 'none',
              cursor: allDone ? 'pointer' : 'not-allowed',
              opacity: allDone ? 1 : 0.5,
            }}
          >
            {allDone ? 'Close — All Done' : `${pending.length} remaining…`}
          </button>
        </div>
      </div>
    </div>
  );
  return createPortal(content, document.body);
}

// ─── client card ──────────────────────────────────────────────────────────────

function PayRow({ r }: { r: Row }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const user = useAuth((s) => s.user);
  const isManager = user?.role === 'manager';

  const [showComments, setShowComments] = useState(false);
  const [showAdvance, setShowAdvance] = useState(false);
  const [showLeverage, setShowLeverage] = useState(false);
  const [showEditDates, setShowEditDates] = useState(false);
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountDraft, setAmountDraft] = useState('');
  const [currencyDraft, setCurrencyDraft] = useState('');
  const [amountReason, setAmountReason] = useState('');
  const [showEmployerDialog, setShowEmployerDialog] = useState(false);
  const [employerNameDraft, setEmployerNameDraft] = useState('');
  const [editingAccount, setEditingAccount] = useState(false);
  const [accountDraft, setAccountDraft] = useState('');

  const canEditAmountAccount = ['founder', 'manager'].includes(user?.role || '');

  const saveAccount = useMutation({
    mutationFn: () => api.patch(`/follow-up-payments/${r.id}/account-name`, { accountName: accountDraft }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['follow-up-payments'] }); setEditingAccount(false); showToast('Account name saved'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const saveAmount = useMutation({
    mutationFn: () => api.patch(`/follow-up-payments/${r.id}/amount`, { cycleAmount: Number(amountDraft), currency: currencyDraft, reason: amountReason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['follow-up-payments'] }); setEditingAmount(false); setAmountReason(''); showToast('Amount saved'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const toggleEmployer = useMutation({
    mutationFn: (on: boolean) => api.post(`/follow-up-payments/${r.id}/employer-call`, { isEmployerCall: on, employerName: on ? employerNameDraft : '' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['follow-up-payments'] }); setShowEmployerDialog(false); showToast('Updated'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const feedbackTaken = useMutation({
    mutationFn: () => api.post(`/follow-up-payments/${r.id}/feedback-taken`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['follow-up-payments'] }); showToast('Feedback logged today'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const togglePending = useMutation({
    mutationFn: () => api.post(`/follow-up-payments/${r.id}/pending-vaibhav`, { pending: !r.paymentPendingVaibhav }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['follow-up-payments'] }); showToast('Updated'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const borderColor =
    r.isEmployerCall ? '#f9a8d4' :
    r.status === 'overdue'  ? 'var(--status-red)' :
    r.status === 'due_soon' ? 'var(--status-amber)' :
    'var(--brand-borderSoft)';

  return (
    <>
      <div className="rounded-xl mb-2" style={{
        background: r.isEmployerCall ? 'rgba(249,168,212,0.08)' : r.status === 'no_date' ? 'rgba(34,197,94,0.05)' : 'var(--bg-card)',
        border: `1px solid ${borderColor}`,
        overflow: 'hidden',
      }}>
        {/* Top row: name + status badge + nav links */}
        <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--brand-borderSoft)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <Link to={`/clients/${r.id}`} className="font-bold text-[14px] hover:underline truncate" style={{ color: r.isEmployerCall ? '#db2777' : 'var(--brand-text)' }}>
              {r.name}{r.isEmployerCall && r.employerName ? ` + ${r.employerName}` : ''}
            </Link>
            {r.isEmployerCall && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: 'rgba(249,168,212,0.3)', color: '#db2777' }}>Employer</span>}
            <span className="text-[11px] muted shrink-0">{r.engagementType}</span>
            {r.hostOwner && <span className="text-[11px] shrink-0" style={{ color: 'var(--accent-gold)' }}>· {r.hostOwner}</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge r={r}/>
            {/* WhatsApp quick-links: 4 icon buttons */}
            <div className="flex items-center gap-1">
              {/* Client direct WA */}
              {r.clientPhone ? (
                <a href={`https://wa.me/${r.clientPhone}`} target="whatsapp_window" rel="noreferrer"
                  title={`WhatsApp ${r.name} directly`}
                  className="flex items-center justify-center w-7 h-7 rounded-lg hover:opacity-80 transition-opacity"
                  style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.35)' }}>
                  <MessageSquare size={13} style={{ color: '#25D366' }}/>
                </a>
              ) : (
                <span className="flex items-center justify-center w-7 h-7 rounded-lg opacity-25 cursor-not-allowed"
                  title="No client phone on file"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}>
                  <MessageSquare size={13} className="muted"/>
                </span>
              )}

              {/* Client WA group */}
              {r.clientGroupLink ? (
                <a href={r.clientGroupLink} target="whatsapp_window" rel="noreferrer"
                  title={`Open ${r.name}'s WhatsApp group`}
                  className="flex items-center justify-center w-7 h-7 rounded-lg hover:opacity-80 transition-opacity"
                  style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.35)' }}>
                  <Users size={13} style={{ color: '#25D366' }}/>
                </a>
              ) : (
                <span className="flex items-center justify-center w-7 h-7 rounded-lg opacity-25 cursor-not-allowed"
                  title="No client WhatsApp group on file"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}>
                  <Users size={13} className="muted"/>
                </span>
              )}

              {/* Separator */}
              <div className="w-px h-4 mx-0.5" style={{ background: 'var(--brand-borderSoft)' }}/>

              {/* Trainer direct WA */}
              {r.primaryTrainer?.phone ? (
                <a href={`https://wa.me/${r.primaryTrainer.phone}`} target="whatsapp_window" rel="noreferrer"
                  title={`WhatsApp trainer ${r.primaryTrainer.name} directly`}
                  className="flex items-center justify-center w-7 h-7 rounded-lg hover:opacity-80 transition-opacity"
                  style={{ background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.35)' }}>
                  <MessageSquare size={13} style={{ color: '#60a5fa' }}/>
                </a>
              ) : (
                <span className="flex items-center justify-center w-7 h-7 rounded-lg opacity-25 cursor-not-allowed"
                  title={r.primaryTrainer ? 'No trainer phone on file' : 'No trainer assigned'}
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}>
                  <MessageSquare size={13} className="muted"/>
                </span>
              )}

              {/* Trainer WA group */}
              {r.primaryTrainer?.groupLink ? (
                <a href={r.primaryTrainer.groupLink} target="whatsapp_window" rel="noreferrer"
                  title={`Open trainer ${r.primaryTrainer.name}'s WhatsApp group`}
                  className="flex items-center justify-center w-7 h-7 rounded-lg hover:opacity-80 transition-opacity"
                  style={{ background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.35)' }}>
                  <Users size={13} style={{ color: '#60a5fa' }}/>
                </a>
              ) : (
                <span className="flex items-center justify-center w-7 h-7 rounded-lg opacity-25 cursor-not-allowed"
                  title={r.primaryTrainer ? 'No trainer WA group on file' : 'No trainer assigned'}
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}>
                  <Users size={13} className="muted"/>
                </span>
              )}
            </div>

            {/* Client page link */}
            <Link to={`/clients/${r.id}`}>
              <button className="text-[11px] px-2 py-1 rounded-lg hover:opacity-80 transition-opacity"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--brand-textSecondary)' }}>
                Client
              </button>
            </Link>
          </div>
        </div>

        {/* Body: dates | amount | comment | actions */}
        <div className="grid gap-0" style={{ gridTemplateColumns: '1fr 1fr 1fr 2fr auto' }}>

          {/* Pay Date 1 */}
          <div className="px-4 py-3" style={{ borderRight: '1px solid var(--brand-borderSoft)' }}>
            <div className="text-[10px] uppercase tracking-wider muted mb-1">Next due</div>
            <div className={`font-mono text-[13px] font-bold ${
              r.status === 'overdue' ? 'text-red-400' :
              r.status === 'due_soon' ? 'text-amber-400' : ''}`}>
              {fmtDate(r.payDate1)}
            </div>
            {r.payDate1 && r.daysUntilDue !== null && (
              <div className="text-[10px] muted mt-0.5">
                {r.daysUntilDue < 0 ? `${Math.abs(r.daysUntilDue)}d overdue` : r.daysUntilDue === 0 ? 'today' : `in ${r.daysUntilDue}d`}
              </div>
            )}
            {!r.payDate1 && <div className="text-[10px] muted mt-0.5">—</div>}
          </div>

          {/* Pay Date 2 */}
          <div className="px-4 py-3" style={{ borderRight: '1px solid var(--brand-borderSoft)' }}>
            <div className="text-[10px] uppercase tracking-wider muted mb-1">After that</div>
            <div className="font-mono text-[13px]">
              {fmtDate(r.payDate2)}
            </div>
            {r.leverageUntil && r.leverageUntil === r.payDate2 && (
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--status-amber)' }}>⟳ leverage</div>
            )}
            <button onClick={() => setShowEditDates(true)}
              className="text-[10px] mt-0.5 hover:underline block"
              style={{ color: 'var(--accent-gold)' }}>
              edit dates
            </button>
          </div>

          {/* Amount */}
          <div className="px-4 py-3" style={{ borderRight: '1px solid var(--brand-borderSoft)' }}>
            <div className="text-[10px] uppercase tracking-wider muted mb-1">Amount</div>
            {editingAmount ? (
              <div className="flex flex-col gap-1 mt-0.5">
                <div className="flex items-center gap-1">
                  <select
                    value={currencyDraft}
                    onChange={e => setCurrencyDraft(e.target.value)}
                    className="rounded border px-1 py-0.5 text-[11px] h-7 w-16"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}>
                    <option value="USD">USD</option>
                    <option value="CAD">CAD</option>
                    <option value="INR">INR</option>
                    <option value="GBP">GBP</option>
                    <option value="AED">AED</option>
                  </select>
                  <input
                    type="text" inputMode="numeric" pattern="[0-9]*" min="0" value={amountDraft}
                    onChange={e => setAmountDraft(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="rounded border px-2 py-0.5 text-[12px] font-mono h-7"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)', width: 80 }}
                    autoFocus
                  />
                </div>
                <input
                  type="text" value={amountReason}
                  onChange={e => setAmountReason(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && amountReason.trim()) saveAmount.mutate(); if (e.key === 'Escape') setEditingAmount(false); }}
                  placeholder="Reason for change (required)"
                  className="rounded border px-2 py-0.5 text-[11px]"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)', width: 180 }}
                />
                <div className="flex gap-1">
                  <button onClick={() => saveAmount.mutate()} disabled={saveAmount.isPending || !amountReason.trim()}
                    className="text-[10px] px-2 py-0.5 rounded font-semibold"
                    style={{ background: 'var(--brand-accent)', color: 'white', opacity: !amountReason.trim() ? 0.5 : 1 }}>✓ Save</button>
                  <button onClick={() => { setEditingAmount(false); setAmountReason(''); }}
                    className="text-[10px] px-2 py-0.5 rounded"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--brand-textMuted)' }}>✕</button>
                </div>
              </div>
            ) : (
              <div className={`flex items-center gap-1.5 group/amt ${canEditAmountAccount ? 'cursor-pointer' : ''}`}
                onClick={() => { if (!canEditAmountAccount) return; setAmountDraft(String(r.cycleAmount || '')); setCurrencyDraft(r.currency || 'INR'); setEditingAmount(true); }}>
                {r.cycleAmount > 0
                  ? <span className="font-mono text-[13px] font-semibold">{r.currency} {r.cycleAmount.toLocaleString()}</span>
                  : <span className="text-[12px] muted italic">not set</span>
                }
                {canEditAmountAccount && <span className="text-[10px] opacity-0 group-hover/amt:opacity-100 transition-opacity" style={{ color: 'var(--accent-gold)' }}>edit</span>}
              </div>
            )}
            {!isManager && r.feedbackNeeded && (
              <div className="flex items-center gap-1 text-[10px] mt-1" style={{ color: 'var(--status-amber)' }}>
                <AlertTriangle size={9}/> Feedback needed
              </div>
            )}
          </div>

          {/* Latest comment */}
          <div className="px-4 py-3" style={{ borderRight: '1px solid var(--brand-borderSoft)' }}>
            <div className="text-[10px] uppercase tracking-wider muted mb-1">Latest comment</div>
            {r.latestComment ? (
              <>
                <div className="text-[12px] leading-snug line-clamp-2" style={{ color: 'var(--brand-text)' }}>
                  {r.latestComment.body}
                </div>
                <div className="text-[10px] muted mt-0.5">
                  {r.latestComment.authorName} · {timeAgo(r.latestComment.createdAt)}
                </div>
              </>
            ) : (
              <div className="text-[11px] muted italic">no comments</div>
            )}
            <button onClick={() => setShowComments(true)}
              className="inline-flex items-center gap-1 text-[11px] mt-1.5 font-medium hover:underline"
              style={{ color: 'var(--accent-gold)' }}>
              <MessageSquare size={10}/> View / add
            </button>
          </div>

          {/* Actions */}
          <div className="px-4 py-3 flex flex-col gap-1.5 justify-center">
            <Button size="sm" onClick={() => setShowEditDates(true)}
              title="Edit pay dates">
              ✏ Edit dates
            </Button>
            <Button size="sm"
              style={r.leverageUntil ? { background: 'rgba(245,158,11,0.15)', color: 'var(--status-amber)', border: '1px solid rgba(245,158,11,0.35)' } : {}}
              onClick={() => setShowLeverage(true)}
              title="Extend due date by max 3 days">
              ⟳ Leverage
            </Button>
            <Button size="sm" variant="primary" onClick={() => setShowAdvance(true)}
              title="Mark payment collected — rolls date forward">
              <CheckCircle2 size={11}/> Payment done
            </Button>
            {isManager && (
              <Button size="sm"
                style={r.isEmployerCall ? { background: 'rgba(249,168,212,0.3)', color: '#db2777', border: '1px solid #f9a8d4' } : {}}
                onClick={() => { setEmployerNameDraft(r.employerName || ''); setShowEmployerDialog(true); }}
                title="Mark as employer call (bulk invoice)">
                {r.isEmployerCall ? '🏢 Employer ✓' : '🏢 Employer'}
              </Button>
            )}
            <Button size="sm"
              style={r.feedbackNeeded ? { background: 'rgba(245,158,11,0.15)', color: 'var(--status-amber)', border: '1px solid rgba(245,158,11,0.35)' } : {}}
              onClick={() => feedbackTaken.mutate()}
              title="Mark feedback taken today">
              <MessageSquare size={11}/> Feedback{r.feedbackNeeded ? ' ⚠' : ''}
            </Button>
          </div>
        </div>
        {/* Payment history */}
        {r.payments && r.payments.length > 0 && (
          <div style={{ borderTop: '1px solid var(--brand-borderSoft)', padding: '8px 16px' }}>
            <div className="text-[10px] font-bold uppercase tracking-widest muted mb-2">Payment history</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {r.payments.map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11 }}>
                  <span className="font-mono font-semibold" style={{ minWidth: 80, color: 'var(--status-green)' }}>
                    {p.currency} {p.amount.toLocaleString()}
                  </span>
                  <span style={{ color: 'var(--brand-textSecondary)', minWidth: 64 }}>{fmtDate(p.paymentDate)}</span>
                  {p.receivedBy && <span className="muted">recorded by {p.receivedBy.name}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info strip: Phone | Email | Feedback Date | Account Name */}
        <div className="flex items-center gap-6 px-4 py-2 flex-wrap" style={{ borderTop: '1px solid var(--brand-borderSoft)', background: 'rgba(255,255,255,0.02)' }}>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="muted">Phone:</span>
            {r.clientPhone
              ? <a href={`tel:+${r.clientPhone}`} className="hover:underline font-mono" style={{ color: 'var(--brand-text)' }}>{r.clientPhone}</a>
              : <span className="muted">—</span>}
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="muted">Email:</span>
            {r.clientEmail
              ? <a href={`mailto:${r.clientEmail}`} className="hover:underline" style={{ color: 'var(--brand-text)' }}>{r.clientEmail}</a>
              : <span className="muted">—</span>}
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="muted">Feedback date:</span>
            <span style={{ color: r.lastFeedbackTakenAt ? 'var(--brand-text)' : 'var(--brand-textMuted)' }}>
              {r.lastFeedbackTakenAt ? fmtDate(r.lastFeedbackTakenAt) : '—'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="muted">Account:</span>
            {editingAccount ? (
              <div className="flex items-center gap-1">
                <input autoFocus value={accountDraft} onChange={e => setAccountDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveAccount.mutate(); if (e.key === 'Escape') setEditingAccount(false); }}
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)', borderRadius: 4, padding: '1px 6px', fontSize: 11, width: 140 }}
                />
                <button onClick={() => saveAccount.mutate()} style={{ color: 'var(--status-green)', fontSize: 13 }}>✓</button>
                <button onClick={() => setEditingAccount(false)} style={{ color: 'var(--brand-textMuted)', fontSize: 13 }}>✕</button>
              </div>
            ) : (
              <span
                style={{ color: 'var(--brand-text)', cursor: canEditAmountAccount ? 'pointer' : 'default' }}
                className={canEditAmountAccount ? 'hover:underline' : ''}
                onClick={() => { if (!canEditAmountAccount) return; setAccountDraft(r.accountName || ''); setEditingAccount(true); }}
                title={canEditAmountAccount ? 'Click to edit account name' : undefined}
              >
                {r.accountName || <span className="muted italic">— {canEditAmountAccount ? 'click to add' : ''}</span>}
              </span>
            )}
          </div>
        </div>
      </div>

      {showComments  && <CommentThread clientId={r.id} onClose={() => setShowComments(false)}/>}
      {showAdvance   && <AdvancePaymentModal r={r} onClose={() => setShowAdvance(false)}/>}
      {showLeverage  && <LeverageModal r={r} onClose={() => setShowLeverage(false)}/>}
      {showEditDates && <EditDatesModal r={r} onClose={() => setShowEditDates(false)}/>}
      {showEmployerDialog && createPortal(
        <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 9999, background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowEmployerDialog(false); }}>
          <div className="rounded-2xl p-5 w-[340px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}>
            <div className="font-bold text-sm mb-3">
              {r.isEmployerCall ? 'Remove employer call flag' : 'Mark as employer call'} — {r.name}
            </div>
            {!r.isEmployerCall && (
              <div className="form-row mb-4">
                <Label>Employer name (required)</Label>
                <input
                  type="text" value={employerNameDraft}
                  onChange={e => setEmployerNameDraft(e.target.value)}
                  placeholder="e.g. Infosys, TCS, Wipro…"
                  className="input w-full"
                  autoFocus
                />
                <div className="text-[11px] muted mt-1">Client will display as "{r.name} + {employerNameDraft || 'employer'}" in pink.</div>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button onClick={() => setShowEmployerDialog(false)}>Cancel</Button>
              {r.isEmployerCall
                ? <Button variant="primary" onClick={() => toggleEmployer.mutate(false)} disabled={toggleEmployer.isPending}>Remove flag</Button>
                : <Button variant="primary" disabled={!employerNameDraft.trim() || toggleEmployer.isPending} onClick={() => toggleEmployer.mutate(true)}
                    style={{ background: '#db2777' }}>Mark as employer call</Button>
              }
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ─── spreadsheet table view ───────────────────────────────────────────────────

function TableView({ rows }: { rows: Row[] }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const user = useAuth((s) => s.user);
  const canEditAmountAccount = ['founder', 'manager'].includes(user?.role || '');
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [editingAmount, setEditingAmount] = useState<string | null>(null);
  const [amountDraft, setAmountDraft] = useState('');
  const [currencyDraft, setCurrencyDraft] = useState('');
  const [amountReason, setAmountReason] = useState('');
  const [editingAccount, setEditingAccount] = useState<string | null>(null);
  const [accountDraft, setAccountDraft] = useState('');
  const [showComments, setShowComments] = useState<string | null>(null);
  const [showAdvance, setShowAdvance] = useState<Row | null>(null);
  const [showEditDates, setShowEditDates] = useState<Row | null>(null);

  const saveAmount = useMutation({
    mutationFn: ({ id }: { id: string }) => api.patch(`/follow-up-payments/${id}/amount`, { cycleAmount: Number(amountDraft), currency: currencyDraft, reason: amountReason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['follow-up-payments'] }); setEditingAmount(null); setAmountReason(''); showToast('Amount saved'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const saveCurrency = useMutation({
    mutationFn: ({ id, currency }: { id: string; currency: string }) => api.patch(`/follow-up-payments/${id}/currency`, { currency }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['follow-up-payments'] }); showToast('Currency updated'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const saveAccount = useMutation({
    mutationFn: ({ id }: { id: string }) => api.patch(`/follow-up-payments/${id}/account-name`, { accountName: accountDraft }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['follow-up-payments'] }); setEditingAccount(null); showToast('Account saved'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const saveNote = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.patch(`/follow-up-payments/${id}/note`, { note }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['follow-up-payments'] }); setEditingNote(null); showToast('Note saved'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const togglePending = useMutation({
    mutationFn: ({ id, pending }: { id: string; pending: boolean }) =>
      api.post(`/follow-up-payments/${id}/pending-vaibhav`, { pending }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['follow-up-payments'] }),
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const thStyle: React.CSSProperties = {
    padding: '8px 10px', textAlign: 'left', fontSize: 11,
    fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
    color: 'var(--brand-textMuted)', borderBottom: '2px solid var(--brand-border)',
    whiteSpace: 'nowrap', background: 'var(--bg-card)', position: 'sticky', top: 0, zIndex: 2,
  };

  return (
    <>
      <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--brand-border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={thStyle}>#</th>
              <th style={thStyle}>Client</th>
              <th style={thStyle}>Pay Date 1 (Next Due)</th>
              <th style={thStyle}>Pay Date 2 (After That)</th>
              <th style={thStyle}>Currency</th>
              <th style={thStyle}>Amount</th>
              <th style={thStyle}>Comments</th>
              <th style={thStyle}>Feedback / Notes</th>
              <th style={thStyle}>Account</th>
              <th style={thStyle}>Phone</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isPendingV = r.status === 'pending_vaibhav';
              const isOverdue = r.status === 'overdue';
              const isDueSoon = r.status === 'due_soon';
              const isDeferred = r.status === 'deferred';
              const isNoDate = r.status === 'no_date';
              const isEmployer = r.isEmployerCall;
              const rowBg = isEmployer
                ? 'rgba(249,168,212,0.1)'   // pink — employer call
                : isPendingV
                ? 'rgba(250,204,21,0.12)'   // yellow — pending Vaibhav
                : isOverdue
                ? 'rgba(239,68,68,0.08)'    // red tint — overdue
                : isDueSoon
                ? 'rgba(245,158,11,0.07)'   // amber tint — due soon
                : isDeferred
                ? 'rgba(139,92,246,0.07)'   // purple tint — deferred
                : isNoDate
                ? 'rgba(34,197,94,0.07)'    // green tint — no date = all paid
                : i % 2 === 0 ? 'var(--bg-card)' : 'rgba(255,255,255,0.02)';

              const nameColor = isEmployer ? '#db2777' : isPendingV ? '#ca8a04' : isOverdue ? 'var(--status-red)' : 'var(--brand-text)';

              const tdStyle: React.CSSProperties = {
                padding: '7px 10px',
                borderBottom: '1px solid var(--brand-borderSoft)',
                verticalAlign: 'middle',
                background: rowBg,
              };

              return (
                <tr key={r.id}>
                  <td style={{ ...tdStyle, color: 'var(--brand-textMuted)', width: 32, textAlign: 'center' }}>{i + 1}</td>

                  {/* Client */}
                  <td style={{ ...tdStyle, fontWeight: 600, color: nameColor, whiteSpace: 'nowrap' }}>
                    <Link to={`/clients/${r.id}`} className="hover:underline">
                      {r.name}{r.isEmployerCall && r.employerName ? ` + ${r.employerName}` : ''}
                    </Link>
                    {r.isEmployerCall && <span style={{ marginLeft: 4, fontSize: 10, background: 'rgba(249,168,212,0.3)', color: '#db2777', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>Employer</span>}
                  </td>

                  {/* Pay Date 1 (next due) */}
                  <td style={{ ...tdStyle, fontFamily: 'monospace', whiteSpace: 'nowrap',
                    color: isOverdue ? 'var(--status-red)' : isDueSoon ? 'var(--status-amber)' : 'var(--brand-text)',
                    fontWeight: isOverdue || isDueSoon ? 700 : 400 }}>
                    {r.payDate1 ? fmtDate(r.payDate1) : <span style={{ color: 'var(--brand-textMuted)' }}>NA</span>}
                  </td>

                  {/* Pay Date 2 (after that) */}
                  <td style={{ ...tdStyle, fontFamily: 'monospace', whiteSpace: 'nowrap', color: 'var(--brand-textMuted)' }}>
                    {r.payDate2 ? fmtDate(r.payDate2) : <span style={{ color: 'var(--brand-textMuted)' }}>—</span>}
                  </td>

                  {/* Currency */}
                  <td style={{ ...tdStyle }}>
                    {canEditAmountAccount ? (
                      <select
                        value={r.currency || 'USD'}
                        onChange={e => saveCurrency.mutate({ id: r.id, currency: e.target.value })}
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)', borderRadius: 4, padding: '2px 4px', fontSize: 11, width: 52 }}>
                        <option>USD</option><option>CAD</option><option>INR</option><option>GBP</option><option>AED</option>
                      </select>
                    ) : (
                      <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.currency || '—'}</span>
                    )}
                  </td>

                  {/* Amount */}
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 600 }}>
                    {editingAmount === r.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <select value={currencyDraft} onChange={e => setCurrencyDraft(e.target.value)}
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)', borderRadius: 4, padding: '1px 2px', fontSize: 10, width: 52 }}>
                            <option>USD</option><option>CAD</option><option>INR</option><option>GBP</option><option>AED</option>
                          </select>
                          <input type="text" value={amountDraft} onChange={e => setAmountDraft(e.target.value.replace(/[^0-9.]/g, ''))}
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)', borderRadius: 4, padding: '1px 4px', fontSize: 11, width: 60 }} autoFocus />
                        </div>
                        <input type="text" value={amountReason} onChange={e => setAmountReason(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && amountReason.trim()) saveAmount.mutate({ id: r.id }); if (e.key === 'Escape') setEditingAmount(null); }}
                          placeholder="Reason (required)"
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)', borderRadius: 4, padding: '1px 4px', fontSize: 10, width: 110 }} />
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button onClick={() => saveAmount.mutate({ id: r.id })} disabled={!amountReason.trim()} style={{ color: 'var(--status-green)', fontSize: 12 }}>✓</button>
                          <button onClick={() => setEditingAmount(null)} style={{ color: 'var(--brand-textMuted)', fontSize: 12 }}>✕</button>
                        </div>
                      </div>
                    ) : (
                      <span
                        onClick={() => { if (!canEditAmountAccount) return; setAmountDraft(String(r.cycleAmount || '')); setCurrencyDraft(r.currency || 'INR'); setAmountReason(''); setEditingAmount(r.id); }}
                        style={{ cursor: canEditAmountAccount ? 'pointer' : 'default' }}
                        title={canEditAmountAccount ? 'Click to edit' : undefined}
                      >
                        {r.cycleAmount > 0 ? `${r.currency} ${r.cycleAmount}` : <span style={{ color: 'var(--brand-textMuted)' }}>—</span>}
                      </span>
                    )}
                  </td>

                  {/* Comments (latest comment body) */}
                  <td style={{ ...tdStyle, maxWidth: 180 }}>
                    <div style={{ color: isPendingV ? '#ca8a04' : 'var(--brand-text)', lineHeight: 1.4 }}>
                      {isPendingV ? 'Payment pending on Vaibhav' : (r.latestComment?.body || <span style={{ color: 'var(--brand-textMuted)' }}>done</span>)}
                    </div>
                    <button onClick={() => setShowComments(r.id)}
                      className="text-[10px] hover:underline mt-0.5 block"
                      style={{ color: 'var(--accent-gold)' }}>
                      {r.latestComment ? 'view' : '+ add'}
                    </button>
                  </td>

                  {/* Feedback / followup note — inline editable */}
                  <td style={{ ...tdStyle, maxWidth: 200 }}>
                    {editingNote === r.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveNote.mutate({ id: r.id, note: noteDraft });
                            if (e.key === 'Escape') setEditingNote(null);
                          }}
                          style={{
                            background: 'var(--bg-input)', border: '1px solid var(--brand-border)',
                            color: 'var(--brand-text)', borderRadius: 4, padding: '2px 6px',
                            fontSize: 11, width: 140,
                          }}
                        />
                        <button onClick={() => saveNote.mutate({ id: r.id, note: noteDraft })}
                          style={{ color: 'var(--status-green)', fontSize: 13 }}>✓</button>
                        <button onClick={() => setEditingNote(null)}
                          style={{ color: 'var(--brand-textMuted)', fontSize: 13 }}>✕</button>
                      </div>
                    ) : (
                      <div
                        onClick={() => { setEditingNote(r.id); setNoteDraft(r.followupNote || ''); }}
                        className="cursor-pointer hover:opacity-80 group"
                        title="Click to edit"
                      >
                        {r.followupNote
                          ? <span style={{ color: r.followupNote.toLowerCase().includes('not available') || r.followupNote.toLowerCase().includes('unwell') ? 'var(--status-red)' : 'var(--brand-text)' }}>{r.followupNote}</span>
                          : <span style={{ color: 'var(--brand-textMuted)', fontStyle: 'italic' }} className="group-hover:opacity-100 opacity-40">+ add note</span>
                        }
                      </div>
                    )}
                  </td>

                  {/* Account */}
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: 11 }}>
                    {editingAccount === r.id ? (
                      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                        <input autoFocus value={accountDraft} onChange={e => setAccountDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveAccount.mutate({ id: r.id }); if (e.key === 'Escape') setEditingAccount(null); }}
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)', borderRadius: 4, padding: '1px 4px', fontSize: 11, width: 100 }} />
                        <button onClick={() => saveAccount.mutate({ id: r.id })} style={{ color: 'var(--status-green)', fontSize: 12 }}>✓</button>
                        <button onClick={() => setEditingAccount(null)} style={{ color: 'var(--brand-textMuted)', fontSize: 12 }}>✕</button>
                      </div>
                    ) : (
                      <span
                        onClick={() => { if (!canEditAmountAccount) return; setAccountDraft(r.accountName || ''); setEditingAccount(r.id); }}
                        style={{ color: 'var(--brand-textMuted)', cursor: canEditAmountAccount ? 'pointer' : 'default' }}
                        title={canEditAmountAccount ? 'Click to edit account name' : undefined}
                      >
                        {r.accountName || '—'}
                      </span>
                    )}
                  </td>

                  {/* Phone */}
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>
                    {r.clientPhone
                      ? <a href={`https://wa.me/${r.clientPhone}`} target="whatsapp_window" style={{ color: '#25D366' }}>{r.clientPhone}</a>
                      : <span style={{ color: 'var(--brand-textMuted)' }}>—</span>}
                  </td>

                  {/* Email */}
                  <td style={{ ...tdStyle, fontSize: 11 }}>
                    {r.clientEmail
                      ? <a href={`mailto:${r.clientEmail}`} style={{ color: 'var(--brand-textSecondary)' }}>{r.clientEmail}</a>
                      : <span style={{ color: 'var(--brand-textMuted)' }}>—</span>}
                  </td>

                  {/* Actions */}
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setShowEditDates(r)} title="Edit pay dates"
                        className="px-2 py-0.5 rounded text-[10px] font-semibold hover:opacity-80"
                        style={{ background: 'var(--bg-input)', color: 'var(--brand-textMuted)', border: '1px solid var(--brand-borderSoft)' }}>
                        ✏ Dates
                      </button>
                      <button onClick={() => setShowAdvance(r)} title="Record payment received"
                        className="px-2 py-0.5 rounded text-[10px] font-semibold hover:opacity-80"
                        style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--status-green)', border: '1px solid rgba(34,197,94,0.35)' }}>
                        ✓ Record
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showComments  && <CommentThread clientId={showComments} onClose={() => setShowComments(null)}/>}
      {showAdvance   && <AdvancePaymentModal r={showAdvance} onClose={() => setShowAdvance(null)}/>}
      {showEditDates && <EditDatesModal r={showEditDates} onClose={() => setShowEditDates(null)}/>}
    </>
  );
}

export function FollowUpPaymentsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'overdue' | 'due_soon' | 'pending_vaibhav' | 'deferred'>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [nagDismissed, setNagDismissed] = useState(false);
  const showToast = useUI((s) => s.showToast);
  const pageUser = useAuth((s) => s.user);

  const sendReport = useMutation({
    mutationFn: () => api.post('/internal/send-payment-report'),
    onSuccess: () => showToast('📧 Report sent to Vaibhav, Samita & Mitali', 'success'),
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed to send', 'error'),
  });

  const { data, isLoading } = useQuery<Row[]>({
    queryKey: ['follow-up-payments'],
    queryFn: () => api.get('/follow-up-payments').then((r) => r.data),
  });

  const filtered = useMemo(() => {
    let xs = data || [];
    if (search.trim()) {
      const q = search.toLowerCase();
      xs = xs.filter((r) => r.name.toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') xs = xs.filter((r) => r.status === statusFilter);
    return xs;
  }, [data, search, statusFilter]);

  const counts = useMemo(() => {
    const o = { all: 0, overdue: 0, due_soon: 0, pending_vaibhav: 0, feedback_needed: 0, deferred: 0 };
    for (const r of (data || [])) {
      o.all++;
      if (r.status === 'overdue')         o.overdue++;
      if (r.status === 'due_soon')        o.due_soon++;
      if (r.status === 'pending_vaibhav') o.pending_vaibhav++;
      if (r.status === 'deferred')        o.deferred++;
      if (r.feedbackNeeded)               o.feedback_needed++;
    }
    return o;
  }, [data]);

  // Clients with missing next-due-date OR missing amount — shown in nag modal
  const incompleteClients = useMemo(() => {
    if (!data) return [];
    return data.filter((r) => !r.payDate2 || !r.cycleAmount || r.cycleAmount === 0);
  }, [data]);

  const showNag = !nagDismissed && !isLoading && incompleteClients.length > 0
    && ['manager', 'founder'].includes(pageUser?.role || '');

  return (
    <>
      {showNag && <IncompleteNagModal clients={incompleteClients} onDone={() => setNagDismissed(true)} />}
      <Topbar
        title="Payment follow-up"
        subtitle={`${(data || []).length} active clients`}
        actions={
          <div className="flex items-center gap-2">
            {['founder', 'manager', 'lead'].includes(pageUser?.role || '') && (
              <Button
                variant="primary"
                onClick={() => sendReport.mutate()}
                disabled={sendReport.isPending}
                title="Send today's payment follow-up sheet to Vaibhav, Samita & Mitali"
                style={{ fontSize: 12, padding: '5px 12px' }}
              >
                {sendReport.isPending ? 'Sending…' : '📧 Send Report'}
              </Button>
            )}
            <Input
              placeholder="Search client…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-[220px]"
            />
            <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
              <button
                onClick={() => setViewMode('table')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors"
                style={{
                  background: viewMode === 'table' ? 'var(--brand-accent)' : 'var(--bg-card)',
                  color: viewMode === 'table' ? 'white' : 'var(--brand-textMuted)',
                }}>
                <Table2 size={13}/> Sheet
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors"
                style={{
                  background: viewMode === 'cards' ? 'var(--brand-accent)' : 'var(--bg-card)',
                  color: viewMode === 'cards' ? 'white' : 'var(--brand-textMuted)',
                }}>
                <LayoutList size={13}/> Cards
              </button>
            </div>
          </div>
        }
      />
      <Page>
        {/* KPI bar */}
        {(data || []).length > 0 && (
          <div className="card-hero mb-4 grid grid-cols-2 md:grid-cols-5 gap-6">
            <Stat label="Overdue"          value={counts.overdue}         color="var(--status-red)" />
            <Stat label="Due soon (≤3d)"   value={counts.due_soon}        color="var(--status-amber)" />
            <Stat label="Deferred"         value={counts.deferred}        color="var(--status-amber)" />
            <Stat label="Pending Vaibhav"  value={counts.pending_vaibhav} color="var(--status-amber)" />
            <Stat label="Feedback needed"  value={counts.feedback_needed} color="var(--status-amber)" />
          </div>
        )}

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2 mb-3">
          {([
            { k: 'all',             label: 'All',                n: counts.all },
            { k: 'overdue',         label: 'Overdue',            n: counts.overdue },
            { k: 'due_soon',        label: 'Due soon',           n: counts.due_soon },
            { k: 'deferred',        label: 'Deferred',           n: counts.deferred },
            { k: 'pending_vaibhav', label: 'Pending on Vaibhav', n: counts.pending_vaibhav },
          ] as const).map((f) => {
            const active = statusFilter === f.k;
            return (
              <button key={f.k} onClick={() => setStatusFilter(f.k as any)}
                className={`px-3 py-1 rounded-full text-[12px] font-medium border transition-all ${active ? '' : 'opacity-70 hover:opacity-100'}`}
                style={{
                  background: active ? 'var(--accent-goldSoft)' : 'var(--bg-card)',
                  borderColor: active ? 'var(--accent-gold)' : 'var(--brand-border)',
                  color: active ? 'var(--accent-gold)' : 'var(--brand-textSecondary)',
                }}>
                {f.label} <span className="ml-1 muted">· {f.n}</span>
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div className="muted text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={CheckCircle2} tone="green" title="All clear" description="No clients match this filter." />
        ) : viewMode === 'table' ? (
          <TableView rows={filtered} />
        ) : (
          <div className="space-y-0">
            {filtered.map((r) => <PayRow key={r.id} r={r}/>)}
          </div>
        )}
      </Page>
    </>
  );
}
