/**
 * Mitali's payment follow-up dashboard.
 *
 * Replaces the "MITS Accounts (Managed by Mitali)" Google Sheet 1:1:
 *   Client | Payment Date 1 | Payment Date 2 | Amount | Comments | Feedback
 *
 * Plus quick actions on each row: edit her note inline, mark feedback taken
 * today, mark leverage asked, send calendar invite, jump into client.
 *
 * Visual cues mirror her sheet — pink-highlight for "Jadhav" (family group?
 * leave it as a soft indicator), amber row for "Payment pending on Vaibhav",
 * green tick column for "done", subtle red for overdue.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Pill } from '@/components/ui/pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUI } from '@/store/ui';
import { EmptyState } from '@/components/EmptyState';
import { Wallet, Search, MessageSquare, Gift, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

interface Row {
  id: string; name: string;
  currency: string; cycleAmount: number;
  engagementType: string; source: string | null;
  followupNote: string | null; followupNoteAt: string | null;
  lastFeedbackTakenAt: string | null; lastLeverageAskedAt: string | null;
  paymentPendingVaibhav: boolean;
  hostOwner: string | null;
  primaryTrainer: string | null;
  date1: { paymentDate: string; amount: number; kind: string } | null;
  date2: { paymentDate: string; amount: number; kind: string } | null;
  lastPaymentDate: string | null;
  daysSinceLast: number | null;
  status: 'pending_vaibhav' | 'paid' | 'overdue' | 'due_soon' | 'unknown';
  paymentCount: number;
}

function statusPill(s: Row['status']): { tone: 'amber' | 'red' | 'green' | 'blue' | 'grey'; label: string; Icon: any } {
  switch (s) {
    case 'pending_vaibhav': return { tone: 'amber', label: 'Pending on Vaibhav', Icon: AlertTriangle };
    case 'overdue':         return { tone: 'red',   label: 'Overdue',           Icon: AlertTriangle };
    case 'due_soon':        return { tone: 'amber', label: 'Due soon',          Icon: Clock };
    case 'paid':            return { tone: 'green', label: 'Done',              Icon: CheckCircle2 };
    case 'unknown':         return { tone: 'grey',  label: 'No payments yet',   Icon: Clock };
  }
}

function daysAgoLabel(date: string | null): string {
  if (!date) return '—';
  const d = Math.floor((Date.now() - Date.parse(date)) / 86_400_000);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d}d ago`;
  return date;
}

export function FollowUpPaymentsPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'overdue' | 'pending_vaibhav' | 'due_soon'>('all');

  const { data, isLoading } = useQuery<Row[]>({
    queryKey: ['follow-up-payments'],
    queryFn: () => api.get('/follow-up-payments').then((r) => r.data),
  });

  const filtered = useMemo(() => {
    let xs = data || [];
    if (search.trim()) {
      const q = search.toLowerCase();
      xs = xs.filter((r) => r.name.toLowerCase().includes(q) || (r.followupNote || '').toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') xs = xs.filter((r) => r.status === statusFilter);
    return xs;
  }, [data, search, statusFilter]);

  // Bucketed counts for the filter chips
  const counts = useMemo(() => {
    const o = { all: 0, overdue: 0, pending_vaibhav: 0, due_soon: 0 };
    for (const r of (data || [])) {
      o.all++;
      if (r.status === 'overdue')          o.overdue++;
      if (r.status === 'pending_vaibhav')  o.pending_vaibhav++;
      if (r.status === 'due_soon')         o.due_soon++;
    }
    return o;
  }, [data]);

  const feedbackTaken = useMutation({
    mutationFn: (id: string) => api.post(`/follow-up-payments/${id}/feedback-taken`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['follow-up-payments'] }); showToast('Feedback marked taken'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const leverageAsked = useMutation({
    mutationFn: (id: string) => api.post(`/follow-up-payments/${id}/leverage-asked`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['follow-up-payments'] }); showToast('Leverage ask logged'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const togglePending = useMutation({
    mutationFn: (vars: { id: string; pending: boolean }) =>
      api.post(`/follow-up-payments/${vars.id}/pending-vaibhav`, { pending: vars.pending }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['follow-up-payments'] }); showToast('Updated'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <>
      <Topbar
        title="Payment follow-up"
        subtitle={`${(data || []).length} active clients`}
        actions={
          <Input
            placeholder="Search client or note…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-[280px]"
          />
        }
      />
      <Page>
        {/* Filter chips */}
        <div className="flex flex-wrap gap-2 mb-3">
          {([
            { k: 'all',              label: 'All',                  tone: 'grey'  },
            { k: 'overdue',          label: 'Overdue',              tone: 'red'   },
            { k: 'pending_vaibhav',  label: 'Pending on Vaibhav',   tone: 'amber' },
            { k: 'due_soon',         label: 'Due soon',             tone: 'amber' },
          ] as const).map((f) => {
            const n = counts[f.k];
            const active = statusFilter === f.k;
            return (
              <button
                key={f.k}
                onClick={() => setStatusFilter(f.k as any)}
                className={`px-3 py-1 rounded-full text-[12px] font-medium border transition-all ${active ? '' : 'opacity-70 hover:opacity-100'}`}
                style={{
                  background: active ? 'var(--accent-goldSoft)' : 'var(--bg-card)',
                  borderColor: active ? 'var(--accent-gold)'    : 'var(--brand-border)',
                  color:       active ? 'var(--accent-gold)'    : 'var(--brand-textSecondary)',
                }}
              >
                {f.label} <span className="ml-1 muted">· {n}</span>
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div className="muted text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Wallet}
            tone={(data || []).length === 0 ? 'green' : 'grey'}
            title={(data || []).length === 0 ? "No active clients to follow up" : `No clients in this filter`}
            description={(data || []).length === 0 ? 'When clients move to Active or LeverageGranted they show up here for ongoing payment collection.' : 'Try a different filter or clear search.'}
          />
        ) : (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Payment Date 1</th>
                  <th>Payment Date 2</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Last touchpoints</th>
                  <th>Comments</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => <RowItem key={r.id} r={r} onPending={togglePending.mutate} onFeedback={feedbackTaken.mutate} onLeverage={leverageAsked.mutate} />)}
              </tbody>
            </table>
          </div>
        )}
      </Page>
    </>
  );
}

function RowItem({
  r,
  onPending,
  onFeedback,
  onLeverage,
}: {
  r: Row;
  onPending: (v: { id: string; pending: boolean }) => void;
  onFeedback: (id: string) => void;
  onLeverage: (id: string) => void;
}) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [editingNote, setEditingNote] = useState(false);
  const [noteVal, setNoteVal] = useState(r.followupNote || '');

  const saveNote = useMutation({
    mutationFn: () => api.patch(`/follow-up-payments/${r.id}/note`, { note: noteVal }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['follow-up-payments'] });
      showToast('Note saved');
      setEditingNote(false);
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Save failed', 'error'),
  });

  const s = statusPill(r.status);
  const SIcon = s.Icon;
  const rowBg = r.paymentPendingVaibhav ? 'rgba(245,158,11,0.06)' : undefined;

  return (
    <tr style={{ background: rowBg }}>
      <td>
        <Link to={`/clients/${r.id}`} className="font-semibold hover:underline" style={{ color: 'var(--brand-text)' }}>
          {r.name}
        </Link>
        <div className="text-[10.5px] muted mt-0.5">
          {r.engagementType}
          {r.primaryTrainer && <> · trainer: {r.primaryTrainer}</>}
          {r.hostOwner && <> · host: {r.hostOwner}</>}
        </div>
      </td>
      <td className="mono text-[12px]">
        {r.date1 ? (
          <>
            <div>{r.date1.paymentDate}</div>
            <div className="text-[10px] muted">{r.date1.kind} · {r.currency} {r.date1.amount}</div>
          </>
        ) : <span className="muted">—</span>}
      </td>
      <td className="mono text-[12px]">
        {r.date2 ? (
          <>
            <div>{r.date2.paymentDate}</div>
            <div className="text-[10px] muted">{r.date2.kind} · {r.currency} {r.date2.amount}</div>
          </>
        ) : <span className="muted">—</span>}
      </td>
      <td className="mono">{r.currency} {r.cycleAmount || 0}</td>
      <td>
        <Pill color={s.tone}>
          <SIcon size={11} className="mr-0.5"/>
          {s.label}
        </Pill>
        {r.daysSinceLast !== null && (
          <div className="text-[10px] muted mt-0.5">last pmt {r.daysSinceLast}d ago</div>
        )}
      </td>
      <td className="text-[11px]">
        <div className="flex items-center gap-1.5">
          <MessageSquare size={11} className="muted" />
          <span className="muted">feedback:</span>
          <span>{daysAgoLabel(r.lastFeedbackTakenAt)}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Gift size={11} className="muted" />
          <span className="muted">leverage:</span>
          <span>{daysAgoLabel(r.lastLeverageAskedAt)}</span>
        </div>
      </td>
      <td>
        {editingNote ? (
          <div className="flex flex-col gap-1">
            <Input
              value={noteVal}
              onChange={(e) => setNoteVal(e.target.value)}
              placeholder="e.g. cad · 1 hour daily · she paid rest amount"
              className="!text-[11px] !py-1"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveNote.mutate();
                if (e.key === 'Escape') { setEditingNote(false); setNoteVal(r.followupNote || ''); }
              }}
            />
            <div className="flex gap-1">
              <Button size="sm" variant="primary" onClick={() => saveNote.mutate()} disabled={saveNote.isPending}>Save</Button>
              <Button size="sm" onClick={() => { setEditingNote(false); setNoteVal(r.followupNote || ''); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEditingNote(true)} className="text-left text-[11px] hover:underline">
            {r.followupNote ? (
              <span>{r.followupNote}</span>
            ) : (
              <span className="muted italic">+ add note</span>
            )}
            {r.followupNoteAt && <div className="text-[9px] muted mt-0.5">edited {daysAgoLabel(r.followupNoteAt)}</div>}
          </button>
        )}
      </td>
      <td>
        <div className="flex flex-col gap-1">
          <Button size="sm" onClick={() => onFeedback(r.id)} title="Mark feedback taken today">
            <MessageSquare size={11}/> Feedback
          </Button>
          <Button size="sm" onClick={() => onLeverage(r.id)} title="Mark you asked for leverage / referral today">
            <Gift size={11}/> Leverage
          </Button>
          <Button
            size="sm"
            variant={r.paymentPendingVaibhav ? 'amber' : 'default'}
            onClick={() => onPending({ id: r.id, pending: !r.paymentPendingVaibhav })}
            title={r.paymentPendingVaibhav ? 'Clear "Pending on Vaibhav"' : 'Mark payment pending on Vaibhav'}
          >
            {r.paymentPendingVaibhav ? '✓ Pending V' : 'Pending V'}
          </Button>
        </div>
      </td>
    </tr>
  );
}
