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
  Send, Pin, Trash2, Users
} from 'lucide-react';
import { minFutureDate, maxTodayDate } from '@/lib/utils';

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
  hostOwner: string | null;
  clientPhone: string | null;
  clientGroupLink: string | null;
  primaryTrainer: { id: string; name: string; phone: string | null; groupLink: string | null } | null;
  trainingId: string | null;
  trainingName: string | null;
  latestComment: LatestComment | null;
  feedbackNeeded: boolean;
  status: 'pending_vaibhav' | 'paid' | 'overdue' | 'due_soon' | 'no_date';
  paymentCount: number;
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

  const adv = useMutation({
    mutationFn: () => api.post(`/follow-up-payments/${r.id}/advance-payment`, { newDate2 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['follow-up-payments'] });
      showToast(`Payment done ✓ — next due ${fmtDate(newDate2)}`);
      onClose();
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const content = (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 9999, background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-2xl p-5 w-[340px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}>
        <div className="font-bold text-sm mb-1">Mark payment done — {r.name}</div>
        <div className="muted text-[11px] mb-4">
          Current due date: <strong>{fmtDate(r.payDate2)}</strong> → moves to Pay Date 1.<br/>
          Set the next due date below.
        </div>
        <div className="form-row">
          <Label>Next payment due date</Label>
          <Input type="date" value={newDate2} min={todayISO()} onChange={(e) => setNewDate2(e.target.value)} />
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
            <Input type="date" value={date1} max={maxTodayDate()} onChange={(e) => setDate1(e.target.value)} />
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

  const saveAmount = useMutation({
    mutationFn: () => api.patch(`/follow-up-payments/${r.id}/amount`, { cycleAmount: Number(amountDraft), currency: currencyDraft }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['follow-up-payments'] }); setEditingAmount(false); showToast('Amount saved'); },
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
    r.status === 'overdue'  ? 'var(--status-red)' :
    r.status === 'due_soon' ? 'var(--status-amber)' :
    'var(--brand-borderSoft)';

  return (
    <>
      <div className="rounded-xl mb-2" style={{
        background: 'var(--bg-card)',
        border: `1px solid ${borderColor}`,
        overflow: 'hidden',
      }}>
        {/* Top row: name + status badge + nav links */}
        <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--brand-borderSoft)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <Link to={`/clients/${r.id}`} className="font-bold text-[14px] hover:underline truncate" style={{ color: 'var(--brand-text)' }}>
              {r.name}
            </Link>
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
            <div className="text-[10px] uppercase tracking-wider muted mb-1">Last paid</div>
            <div className="font-mono text-[13px] font-semibold">{fmtDate(r.payDate1)}</div>
            {r.payDate1 && <div className="text-[10px] muted mt-0.5">{daysAgoLabel(r.payDate1)}</div>}
            {!r.payDate1 && <div className="text-[10px] muted mt-0.5">—</div>}
          </div>

          {/* Pay Date 2 */}
          <div className="px-4 py-3" style={{ borderRight: '1px solid var(--brand-borderSoft)' }}>
            <div className="text-[10px] uppercase tracking-wider muted mb-1">Next due</div>
            <div className={`font-mono text-[13px] font-bold ${
              r.status === 'overdue' ? 'text-red-400' :
              r.status === 'due_soon' ? 'text-amber-400' : ''}`}>
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
              <div className="flex items-center gap-1 mt-0.5">
                <select
                  value={currencyDraft}
                  onChange={e => setCurrencyDraft(e.target.value)}
                  className="rounded border px-1 py-0.5 text-[11px] h-7 w-16"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}>
                  <option value="INR">INR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                  <option value="AED">AED</option>
                </select>
                <input
                  type="number" min="0" value={amountDraft}
                  onChange={e => setAmountDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveAmount.mutate(); if (e.key === 'Escape') setEditingAmount(false); }}
                  className="rounded border px-2 py-0.5 text-[12px] font-mono w-24 h-7"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
                  autoFocus
                />
                <button onClick={() => saveAmount.mutate()} disabled={saveAmount.isPending}
                  className="text-[10px] px-2 py-0.5 rounded font-semibold"
                  style={{ background: 'var(--brand-accent)', color: 'white' }}>✓</button>
                <button onClick={() => setEditingAmount(false)}
                  className="text-[10px] px-2 py-0.5 rounded"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--brand-textMuted)' }}>✕</button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 group/amt cursor-pointer"
                onClick={() => { setAmountDraft(String(r.cycleAmount || '')); setCurrencyDraft(r.currency || 'INR'); setEditingAmount(true); }}>
                {r.cycleAmount > 0
                  ? <span className="font-mono text-[13px] font-semibold">{r.currency} {r.cycleAmount.toLocaleString()}</span>
                  : <span className="text-[12px] muted italic">not set</span>
                }
                <span className="text-[10px] opacity-0 group-hover/amt:opacity-100 transition-opacity" style={{ color: 'var(--accent-gold)' }}>edit</span>
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
            <Button size="sm" variant="primary" onClick={() => setShowAdvance(true)}
              title="Mark payment collected — rolls date forward">
              <CheckCircle2 size={11}/> Payment done
            </Button>
            <Button size="sm"
              style={r.leverageUntil ? { background: 'rgba(245,158,11,0.15)', color: 'var(--status-amber)', border: '1px solid rgba(245,158,11,0.35)' } : {}}
              onClick={() => setShowLeverage(true)}
              title="Extend due date by max 3 days">
              ⟳ Leverage
            </Button>
            {!isManager && (
              <>
                <Button size="sm"
                  style={r.feedbackNeeded ? { background: 'rgba(245,158,11,0.15)', color: 'var(--status-amber)', border: '1px solid rgba(245,158,11,0.35)' } : {}}
                  onClick={() => feedbackTaken.mutate()}
                  title="Mark feedback taken today">
                  <MessageSquare size={11}/> Feedback{r.feedbackNeeded ? ' ⚠' : ''}
                </Button>
                <Button size="sm"
                  style={r.paymentPendingVaibhav ? { background: 'rgba(245,158,11,0.15)', color: 'var(--status-amber)', border: '1px solid rgba(245,158,11,0.35)' } : {}}
                  onClick={() => togglePending.mutate()}
                  title="Flag this payment as pending on Vaibhav">
                  {r.paymentPendingVaibhav ? '✓ Pending V' : 'Pending V'}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {showComments  && <CommentThread clientId={r.id} onClose={() => setShowComments(false)}/>}
      {showAdvance   && <AdvancePaymentModal r={r} onClose={() => setShowAdvance(false)}/>}
      {showLeverage  && <LeverageModal r={r} onClose={() => setShowLeverage(false)}/>}
      {showEditDates && <EditDatesModal r={r} onClose={() => setShowEditDates(false)}/>}
    </>
  );
}

export function FollowUpPaymentsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'overdue' | 'due_soon' | 'pending_vaibhav'>('all');

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
    const o = { all: 0, overdue: 0, due_soon: 0, pending_vaibhav: 0, feedback_needed: 0 };
    for (const r of (data || [])) {
      o.all++;
      if (r.status === 'overdue')         o.overdue++;
      if (r.status === 'due_soon')        o.due_soon++;
      if (r.status === 'pending_vaibhav') o.pending_vaibhav++;
      if (r.feedbackNeeded)               o.feedback_needed++;
    }
    return o;
  }, [data]);

  return (
    <>
      <Topbar
        title="Payment follow-up"
        subtitle={`${(data || []).length} active clients`}
        actions={
          <Input
            placeholder="Search client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-[240px]"
          />
        }
      />
      <Page>
        {/* KPI bar */}
        {(data || []).length > 0 && (
          <div className="card-hero mb-4 grid grid-cols-2 md:grid-cols-4 gap-6">
            <Stat label="Overdue"          value={counts.overdue}         color="var(--status-red)" />
            <Stat label="Due soon (≤3d)"   value={counts.due_soon}        color="var(--status-amber)" />
            <Stat label="Pending Vaibhav"  value={counts.pending_vaibhav} color="var(--status-amber)" />
            <Stat label="Feedback needed"  value={counts.feedback_needed} color="var(--status-amber)" />
          </div>
        )}

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2 mb-3">
          {([
            { k: 'all',             label: 'All',              n: counts.all },
            { k: 'overdue',         label: 'Overdue',          n: counts.overdue },
            { k: 'due_soon',        label: 'Due soon',         n: counts.due_soon },
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
        ) : (
          <div className="space-y-0">
            {filtered.map((r) => <PayRow key={r.id} r={r}/>)}
          </div>
        )}
      </Page>
    </>
  );
}
