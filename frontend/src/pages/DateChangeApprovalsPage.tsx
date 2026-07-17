/**
 * Approval inbox for date change requests.
 * Samita sees payment_received requests.
 * Vaibhav sees leverage requests.
 * Both see all pending.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { useUI } from '@/store/ui';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';

interface DCR {
  id: string;
  type: 'payment_received' | 'leverage';
  status: 'pending' | 'approved' | 'rejected';
  requestedByName: string;
  proposedDate1: string | null;
  proposedDate2: string | null;
  createdAt: string;
  // Path A
  linkedPaymentId: string | null;
  screenshotBase64: string | null;
  amountExpected: number | null;
  amountActual: number | null;
  paymentDoneDate: string | null;
  // Path B
  summary30d: string | null;
  mitaliF15d: string | null;
  bhavneetF15d: string | null;
  lastSessionDate: string | null;
  issueDetail: string | null;
  leverageScreenshot: string | null;
  // Approval
  approvedByName: string | null;
  approvedAt: string | null;
  rejectionNote: string | null;
  client: { id: string; name: string; payDate1: string | null; payDate2: string | null };
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: '#f59e0b',
    approved: '#10b981',
    rejected: '#ef4444',
  };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
      background: `${colors[status] || '#6b7280'}20`,
      color: colors[status] || '#6b7280',
      textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>{status}</span>
  );
}

function RequestCard({ r, canApprove }: { r: DCR; canApprove: boolean }) {
  const qc = useQueryClient();
  const showToast = useUI(s => s.showToast);
  const [expanded, setExpanded] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [newNextDue, setNewNextDue] = useState('');

  const todayISO = () => new Date().toISOString().slice(0, 10);

  const approve = useMutation({
    mutationFn: (): Promise<any> => api.post(`/date-change-requests/${r.id}/approve`, r.type === 'payment_received' ? { newNextDueDate: newNextDue } : {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['date-change-requests'] }); showToast('Approved — dates updated ✓'); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  const reject = useMutation({
    mutationFn: () => api.post(`/date-change-requests/${r.id}/reject`, { rejectionNote: rejectNote }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['date-change-requests'] }); setRejecting(false); showToast('Rejected — Mitali notified'); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const typeLabel = r.type === 'payment_received' ? '💳 Payment Received' : '⏳ Leverage Request';
  const borderColor = r.type === 'payment_received' ? '#10b981' : '#f59e0b';

  return (
    <div className="card mb-3" style={{ borderLeft: `3px solid ${borderColor}` }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-[14px]" style={{ color: 'var(--brand-text)' }}>{r.client.name}</span>
          <span className="text-[11px]" style={{ color: 'var(--brand-textMuted)' }}>{typeLabel}</span>
          <StatusBadge status={r.status} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] muted">{new Date(r.createdAt).toLocaleDateString('en-IN')}</span>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </div>

      {/* Summary row */}
      <div className="flex flex-wrap gap-4 mt-2 text-[12px]" style={{ color: 'var(--brand-textSecondary)' }}>
        <span>By: <strong>{r.requestedByName}</strong></span>
        {r.type === 'payment_received' ? (
          <>
            <span>Paid: <strong>{r.amountActual != null ? `${r.client.currency || 'USD'} ${r.amountActual}` : '—'}</strong> on <strong>{fmtDate(r.paymentDoneDate)}</strong></span>
            <span>→ Next due: <strong>{fmtDate(r.proposedDate1)}</strong></span>
          </>
        ) : (
          <>
            <span>Current: <strong>{fmtDate(r.client.payDate1)}</strong> / <strong>{fmtDate(r.client.payDate2)}</strong></span>
            <span>→ Proposed: <strong>{fmtDate(r.proposedDate1)}</strong> / <strong>{fmtDate(r.proposedDate2)}</strong></span>
          </>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--brand-borderSoft)' }}>
          {r.type === 'payment_received' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-[12px]">
                <div className="rounded-lg px-3 py-2" style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}>
                  <div className="text-[10px] uppercase tracking-wider muted mb-1">Expected</div>
                  <div className="font-mono font-semibold" style={{ color: 'var(--brand-text)' }}>
                    {r.amountExpected != null ? `${r.client.currency || 'USD'} ${r.amountExpected}` : '—'}
                  </div>
                </div>
                <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)' }}>
                  <div className="text-[10px] uppercase tracking-wider muted mb-1">Actual received</div>
                  <div className="font-mono font-bold" style={{ color: '#10b981' }}>
                    {r.amountActual != null ? `${r.client.currency || 'USD'} ${r.amountActual}` : '—'}
                  </div>
                </div>
                <div className="rounded-lg px-3 py-2" style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}>
                  <div className="text-[10px] uppercase tracking-wider muted mb-1">Payment date</div>
                  <div className="font-semibold" style={{ color: 'var(--brand-text)' }}>{fmtDate(r.paymentDoneDate)}</div>
                </div>
              </div>
              <div className="text-[12px]" style={{ color: 'var(--brand-textSecondary)' }}>
                <span className="muted">New next due date:</span> <strong>{fmtDate(r.proposedDate1)}</strong>
              </div>
              {r.screenshotBase64 && (
                <div>
                  <div className="text-[11px] muted mb-1">Payment screenshot:</div>
                  <img src={r.screenshotBase64} alt="Payment proof" style={{ maxWidth: 400, borderRadius: 8, border: '1px solid var(--brand-border)' }} />
                </div>
              )}
              {!r.screenshotBase64 && (
                <div className="text-[12px] muted italic">No screenshot attached.</div>
              )}
            </div>
          ) : (
            <div className="space-y-3 text-[12px]">
              {r.summary30d && <div><span className="font-semibold" style={{ color: 'var(--brand-textSecondary)' }}>Client summary (30 days):</span><p className="mt-1 muted">{r.summary30d}</p></div>}
              {r.mitaliF15d && <div><span className="font-semibold" style={{ color: 'var(--brand-textSecondary)' }}>Mitali feedback (15 days):</span><p className="mt-1 muted">{r.mitaliF15d}</p></div>}
              {r.bhavneetF15d && <div><span className="font-semibold" style={{ color: 'var(--brand-textSecondary)' }}>Bhavneet feedback (15 days):</span><p className="mt-1 muted">{r.bhavneetF15d}</p></div>}
              {r.lastSessionDate && <div><span className="font-semibold" style={{ color: 'var(--brand-textSecondary)' }}>Last session:</span> {fmtDate(r.lastSessionDate)}</div>}
              {r.issueDetail && <div><span className="font-semibold" style={{ color: 'var(--brand-textSecondary)' }}>Issue detail:</span><p className="mt-1 muted whitespace-pre-wrap">{r.issueDetail}</p></div>}
              {r.leverageScreenshot && (
                <div>
                  <div className="text-[11px] muted mb-1">Screenshot:</div>
                  <img src={r.leverageScreenshot} alt="Screenshot" style={{ maxWidth: 400, borderRadius: 8, border: '1px solid var(--brand-border)' }} />
                </div>
              )}
            </div>
          )}

          {/* Rejection note if already rejected */}
          {r.status === 'rejected' && r.rejectionNote && (
            <div className="mt-3 px-3 py-2 rounded-lg text-[12px]" style={{ background: 'rgba(239,68,68,0.08)', color: '#fca5a5' }}>
              <strong>Rejection reason:</strong> {r.rejectionNote}
            </div>
          )}

          {/* Approval actions */}
          {r.status === 'pending' && canApprove && (
            <div className="mt-4 flex items-start gap-3 flex-wrap">
              {!rejecting ? (
                <>
                  {r.type === 'payment_received' && (
                    <div className="w-full mb-2">
                      <div className="text-[11px] font-semibold mb-1" style={{ color: 'var(--brand-textSecondary)' }}>Set new next due date for client *</div>
                      <input
                        type="date"
                        value={newNextDue}
                        min={todayISO()}
                        onChange={e => setNewNextDue(e.target.value)}
                        className="text-[12px] rounded-lg px-3 py-1.5"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}
                      />
                    </div>
                  )}
                  <Button variant="primary" size="sm"
                    disabled={approve.isPending || (r.type === 'payment_received' && !newNextDue)}
                    onClick={() => approve.mutate()}>
                    <CheckCircle2 size={12} /> {approve.isPending ? 'Approving…' : r.type === 'payment_received' ? 'Confirm payment & update date' : 'Approve & update dates'}
                  </Button>
                  <Button size="sm" onClick={() => setRejecting(true)}>
                    <XCircle size={12} /> Reject
                  </Button>
                </>
              ) : (
                <div className="flex flex-col gap-2 w-full max-w-sm">
                  <textarea
                    autoFocus
                    value={rejectNote}
                    onChange={e => setRejectNote(e.target.value)}
                    placeholder="Reason for rejection (shown to Mitali)…"
                    rows={2}
                    className="w-full text-[12px] rounded-lg px-3 py-2"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)', resize: 'none' }}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="primary" disabled={reject.isPending} onClick={() => reject.mutate()}
                      style={{ background: 'rgba(239,68,68,0.8)' }}>
                      {reject.isPending ? 'Rejecting…' : 'Confirm reject'}
                    </Button>
                    <Button size="sm" onClick={() => setRejecting(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {r.status !== 'pending' && (
            <div className="mt-3 text-[11px] muted">
              {r.status === 'approved' ? '✓' : '✗'} {r.approvedByName} · {r.approvedAt ? new Date(r.approvedAt).toLocaleDateString('en-IN') : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DateChangeApprovalsPage() {
  const user = useAuth(s => s.user);
  const [tab, setTab] = useState<'pending' | 'history'>('pending');

  const { data = [], isLoading } = useQuery<DCR[]>({
    queryKey: ['date-change-requests'],
    queryFn: () => api.get('/date-change-requests').then((r: any) => r.data),
  });

  const canApprove = ['founder', 'manager', 'demo_lead'].includes(user?.role || '');

  const pending = data.filter(r => r.status === 'pending');
  const history = data.filter(r => r.status !== 'pending');

  const shown = tab === 'pending' ? pending : history;

  return (
    <>
      <Topbar
        title="Date change approvals"
        subtitle="Payment date change requests from Mitali"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => setTab('pending')}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all"
              style={{
                background: tab === 'pending' ? 'rgba(251,191,36,0.15)' : 'var(--bg-card)',
                borderColor: tab === 'pending' ? 'rgba(251,191,36,0.4)' : 'var(--brand-border)',
                color: tab === 'pending' ? '#fbbf24' : 'var(--brand-textSecondary)',
              }}>
              <Clock size={11} style={{ display: 'inline', marginRight: 4 }} />
              Pending · {pending.length}
            </button>
            <button onClick={() => setTab('history')}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all"
              style={{
                background: tab === 'history' ? 'rgba(99,102,241,0.15)' : 'var(--bg-card)',
                borderColor: tab === 'history' ? 'rgba(99,102,241,0.4)' : 'var(--brand-border)',
                color: tab === 'history' ? '#a5b4fc' : 'var(--brand-textSecondary)',
              }}>
              History · {history.length}
            </button>
          </div>
        }
      />
      <Page>
        {isLoading && <div className="muted text-[13px]">Loading…</div>}
        {!isLoading && shown.length === 0 && (
          <div className="card p-8 text-center">
            <CheckCircle2 size={32} style={{ color: 'var(--status-green)', margin: '0 auto 12px' }} />
            <div className="text-[14px] font-semibold" style={{ color: 'var(--brand-text)' }}>
              {tab === 'pending' ? 'No pending requests' : 'No history yet'}
            </div>
            <div className="text-[12px] muted mt-1">
              {tab === 'pending' ? 'All date change requests have been handled.' : 'Approved/rejected requests will appear here.'}
            </div>
          </div>
        )}
        {shown.map((r: DCR) => (
          <RequestCard key={r.id} r={r} canApprove={canApprove} />
        ))}
      </Page>
    </>
  );
}
