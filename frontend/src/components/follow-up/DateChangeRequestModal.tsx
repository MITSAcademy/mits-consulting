/**
 * Shown when Mitali clicks ✏ Dates.
 *
 * Path A (Client paid): directly records payment via advance-payment API — no approval needed.
 *   - Amount received + next due date (today or past only, no future dates)
 *   - Confirmation step before submitting
 * Path B (Leverage): submits a DCR for Vaibhav approval.
 *
 * If a pending leverage DCR exists → show locked state.
 * If last leverage DCR was rejected → show resubmit form.
 */
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Upload, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { useUI } from '@/store/ui';
import { Button } from '@/components/ui/button';
import { Label, Input } from '@/components/ui/input';

interface Row {
  id: string;
  name: string;
  currency: string;
  cycleAmount: number;
  payDate1: string | null;
  payDate2: string | null;
  payments?: { id: string; amount: number; currency: string; paymentDate: string }[];
}

interface DCR {
  id: string;
  type: string;
  status: string;
  proposedDate1: string | null;
  proposedDate2: string | null;
  rejectionNote: string | null;
  approvedByName: string | null;
  createdAt: string;
  summary30d: string | null;
  mitaliF15d: string | null;
  bhavneetF15d: string | null;
  lastSessionDate: string | null;
  issueDetail: string | null;
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

export default function DateChangeRequestModal({ r, onClose }: { r: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useUI(s => s.showToast);

  // Fetch existing pending leverage DCR for this client
  const { data: existing, isLoading } = useQuery<DCR | null>({
    queryKey: ['dcr-client', r.id],
    queryFn: () => api.get(`/date-change-requests/client/${r.id}`).then((d: any) => d.data),
  });

  // Find last rejected leverage DCR for resubmit
  const { data: allRequests } = useQuery<DCR[]>({
    queryKey: ['date-change-requests'],
    queryFn: () => api.get('/date-change-requests').then((d: any) => d.data),
  });
  const lastRejected = allRequests?.find(req => req.status === 'rejected' && req.type === 'leverage' && (req as any).clientId === r.id);

  const [path, setPath] = useState<'a' | 'b' | null>(null);

  // Path A — record payment directly
  const [amountReceived, setAmountReceived] = useState(String(r.cycleAmount || ''));
  const [newDueDate, setNewDueDate] = useState('');
  const [confirming, setConfirming] = useState(false);

  // Path B — leverage DCR
  const [date1, setDate1] = useState(r.payDate1 || '');
  const [date2, setDate2] = useState(r.payDate2 || '');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [summary30d, setSummary30d] = useState(lastRejected?.summary30d || '');
  const [mitaliF15d, setMitaliF15d] = useState(lastRejected?.mitaliF15d || '');
  const [bhavneetF15d, setBhavneetF15d] = useState(lastRejected?.bhavneetF15d || '');
  const [lastSessionDate, setLastSessionDate] = useState(lastRejected?.lastSessionDate || '');
  const [issueDetail, setIssueDetail] = useState(lastRejected?.issueDetail || '');
  const fileRef = useRef<HTMLInputElement>(null);

  const wordCount = issueDetail.trim().split(/\s+/).filter(Boolean).length;

  // Path A — directly records payment (no approval needed)
  const recordPayment = useMutation({
    mutationFn: () => api.post(`/follow-up-payments/${r.id}/advance-payment`, {
      newDate2: newDueDate,
      amountReceived: amountReceived ? Number(amountReceived) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['follow-up-payments'] });
      showToast(`Payment recorded ✓ — ${r.currency} ${amountReceived || r.cycleAmount} · next due ${fmtDate(newDueDate)}`);
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed to record payment', 'error'),
  });

  // Path B — submit leverage DCR
  const submitLeverage = useMutation({
    mutationFn: async () => {
      const body: any = {
        clientId: r.id,
        type: 'leverage',
        proposedDate1: date1 || null,
        proposedDate2: date2 || null,
        summary30d,
        mitaliF15d,
        bhavneetF15d,
        lastSessionDate: lastSessionDate || null,
        issueDetail,
        leverageScreenshot: screenshot || null,
      };
      if (lastRejected) return api.patch(`/date-change-requests/${lastRejected.id}`, body);
      return api.post('/date-change-requests', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['date-change-requests'] });
      qc.invalidateQueries({ queryKey: ['dcr-client', r.id] });
      showToast('Leverage request submitted — Vaibhav will review');
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed to submit', 'error'),
  });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Image must be under 2MB', 'error'); return; }
    const b64 = await toBase64(file);
    setScreenshot(b64);
  };

  const content = (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 9999, background: 'rgba(0,0,0,0.7)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-2xl w-full max-w-lg mx-4 overflow-y-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)', maxHeight: '90vh' }}>

        {/* Header */}
        <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid var(--brand-borderSoft)' }}>
          <div className="font-bold text-[15px]" style={{ color: 'var(--brand-text)' }}>
            {path === 'a' ? (confirming ? '✅ Confirm payment' : '💳 Record payment') : path === 'b' ? '⏳ Leverage request' : 'Payment dates'} — {r.name}
          </div>
          <div className="text-[12px] muted mt-0.5">
            Current dates: <strong>{fmtDate(r.payDate1)}</strong> / <strong>{fmtDate(r.payDate2)}</strong>
          </div>
        </div>

        <div className="px-5 py-4">
          {isLoading && <div className="muted text-[13px]">Checking existing requests…</div>}

          {/* Pending leverage DCR — locked */}
          {!isLoading && existing && existing.status === 'pending' && existing.type === 'leverage' && !path && (
            <div>
              <div className="rounded-xl px-4 py-4 text-center mb-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)' }}>
                <Clock size={24} style={{ color: '#fbbf24', margin: '0 auto 8px' }} />
                <div className="font-bold text-[13px]" style={{ color: '#fbbf24' }}>Leverage request pending Vaibhav's approval</div>
                <div className="text-[12px] muted mt-2">
                  Proposed: <strong>{fmtDate(existing.proposedDate1)}</strong> / <strong>{fmtDate(existing.proposedDate2)}</strong>
                </div>
                <div className="text-[11px] muted mt-3">Deferral dates are locked until approved or rejected.</div>
              </div>
              <div className="text-[12px] font-semibold mb-2" style={{ color: 'var(--brand-textSecondary)' }}>You can still record a payment:</div>
              <button onClick={() => setPath('a')}
                className="rounded-xl p-4 text-left transition-all hover:opacity-90 w-full"
                style={{ background: 'rgba(16,185,129,0.08)', border: '2px solid rgba(16,185,129,0.3)' }}>
                <div className="text-[20px] mb-1">💳</div>
                <div className="font-bold text-[13px]" style={{ color: '#10b981' }}>Client paid — record now</div>
                <div className="text-[11px] muted mt-0.5">Record amount received and set the next due date</div>
              </button>
            </div>
          )}

          {/* Rejected leverage — show resubmit banner */}
          {!isLoading && !existing && lastRejected && path === 'b' && (
            <div className="mb-4 rounded-lg px-3 py-2.5 text-[12px]" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
              <strong>Last request rejected</strong> by {lastRejected.approvedByName}
              {lastRejected.rejectionNote && <div className="mt-1 opacity-80">Reason: {lastRejected.rejectionNote}</div>}
              <div className="mt-1 opacity-70">Fix the issues below and resubmit.</div>
            </div>
          )}

          {/* Path selector */}
          {!isLoading && !path && !(existing && existing.status === 'pending' && existing.type === 'leverage') && (
            <div>
              <div className="text-[12px] font-semibold mb-3" style={{ color: 'var(--brand-textSecondary)' }}>What do you want to do?</div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setPath('a')}
                  className="rounded-xl p-4 text-left transition-all hover:opacity-90"
                  style={{ background: 'rgba(16,185,129,0.08)', border: '2px solid rgba(16,185,129,0.3)' }}>
                  <div className="text-[20px] mb-2">💳</div>
                  <div className="font-bold text-[13px]" style={{ color: '#10b981' }}>Client paid</div>
                  <div className="text-[11px] muted mt-1">Record payment received and set next due date</div>
                </button>
                <button onClick={() => setPath('b')}
                  className="rounded-xl p-4 text-left transition-all hover:opacity-90"
                  style={{ background: 'rgba(245,158,11,0.08)', border: '2px solid rgba(245,158,11,0.3)' }}>
                  <div className="text-[20px] mb-2">⏳</div>
                  <div className="font-bold text-[13px]" style={{ color: '#f59e0b' }}>Leverage / deferral</div>
                  <div className="text-[11px] muted mt-1">Client needs more time — request Vaibhav's approval</div>
                </button>
              </div>
            </div>
          )}

          {/* Path A — record payment (no approval) */}
          {path === 'a' && !confirming && (
            <div className="space-y-4">
              <div className="form-row">
                <Label>Amount received ({r.currency})</Label>
                <Input
                  type="number"
                  min="0"
                  value={amountReceived}
                  onChange={e => setAmountReceived(e.target.value)}
                  placeholder={String(r.cycleAmount || '')}
                />
              </div>
              <div className="form-row">
                <Label>Next payment due date</Label>
                <Input
                  type="date"
                  value={newDueDate}
                  min={todayISO()}
                  onChange={e => setNewDueDate(e.target.value)}
                />
                <div className="text-[11px] muted mt-1">Must be today or a future date.</div>
              </div>
              <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)', color: '#6ee7b7' }}>
                Payment is recorded immediately — no approval needed.
              </div>
            </div>
          )}

          {/* Path A — confirmation step */}
          {path === 'a' && confirming && (
            <div className="space-y-3">
              <div className="rounded-xl px-4 py-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.35)' }}>
                <div className="flex items-start gap-2 mb-3">
                  <AlertTriangle size={16} style={{ color: '#fbbf24', marginTop: 1, flexShrink: 0 }} />
                  <div className="font-bold text-[13px]" style={{ color: '#fbbf24' }}>Please double-check before confirming</div>
                </div>
                <div className="space-y-2 text-[12px]" style={{ color: 'var(--brand-textSecondary)' }}>
                  <div className="flex justify-between">
                    <span className="muted">Client:</span>
                    <strong style={{ color: 'var(--brand-text)' }}>{r.name}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="muted">Amount received:</span>
                    <strong style={{ color: '#10b981' }}>{r.currency} {amountReceived || r.cycleAmount}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="muted">Next due date:</span>
                    <strong style={{ color: 'var(--brand-text)' }}>{fmtDate(newDueDate)}</strong>
                  </div>
                </div>
                <div className="mt-3 text-[11px] muted">
                  Is the amount correct? Is the next due date right? This cannot be undone easily.
                </div>
              </div>
            </div>
          )}

          {/* Path B — leverage DCR */}
          {path === 'b' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="form-row">
                  <Label>Pay Date 1 (next due)</Label>
                  <Input type="date" value={date1} onChange={e => setDate1(e.target.value)} />
                </div>
                <div className="form-row">
                  <Label>Pay Date 2 (after that)</Label>
                  <Input type="date" value={date2} onChange={e => setDate2(e.target.value)} />
                </div>
              </div>

              <div className="form-row">
                <Label>Client summary — last 30 days *</Label>
                <textarea value={summary30d} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSummary30d(e.target.value)} rows={2} placeholder="How sessions went, client attitude, progress…"
                  className="w-full text-[12px] rounded-lg px-3 py-2 mt-1"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)', resize: 'vertical' }} />
              </div>

              <div className="form-row">
                <Label>Feedback you (Mitali) took — last 15 days *</Label>
                <textarea value={mitaliF15d} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMitaliF15d(e.target.value)} rows={2} placeholder="What did client say about training? Issues raised?"
                  className="w-full text-[12px] rounded-lg px-3 py-2 mt-1"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)', resize: 'vertical' }} />
              </div>

              <div className="form-row">
                <Label>Feedback Bhavneet took — last 15 days *</Label>
                <textarea value={bhavneetF15d} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBhavneetF15d(e.target.value)} rows={2} placeholder="What did Bhavneet report?"
                  className="w-full text-[12px] rounded-lg px-3 py-2 mt-1"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)', resize: 'vertical' }} />
              </div>

              <div className="form-row">
                <Label>Last session date *</Label>
                <Input type="date" value={lastSessionDate} onChange={e => setLastSessionDate(e.target.value)} />
              </div>

              <div className="form-row">
                <Label>Issue detail * <span className="muted font-normal">(min 50 words — {wordCount} written)</span></Label>
                <textarea value={issueDetail} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setIssueDetail(e.target.value)} rows={4}
                  placeholder="Explain in detail why the client needs more time. What is the exact situation? What did they say? What is your plan?"
                  className="w-full text-[12px] rounded-lg px-3 py-2 mt-1"
                  style={{
                    background: 'var(--bg-input)', resize: 'vertical', color: 'var(--brand-text)',
                    border: `1px solid ${wordCount > 0 && wordCount < 50 ? 'rgba(239,68,68,0.5)' : 'var(--brand-border)'}`,
                  }} />
                {wordCount > 0 && wordCount < 50 && (
                  <div className="text-[10px] mt-0.5" style={{ color: '#ef4444' }}>{50 - wordCount} more words needed</div>
                )}
              </div>

              <div className="form-row">
                <Label>Screenshot (optional)</Label>
                <div className="mt-1">
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
                  {screenshot ? (
                    <div>
                      <img src={screenshot} alt="Screenshot" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--brand-border)', maxHeight: 200, objectFit: 'cover' }} />
                      <button onClick={() => setScreenshot(null)} className="text-[11px] muted mt-1 hover:opacity-70">Remove</button>
                    </div>
                  ) : (
                    <button onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-3 rounded-lg w-full text-[12px] border border-dashed hover:opacity-80 transition-all"
                      style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-textMuted)' }}>
                      <Upload size={14} /> Attach screenshot
                    </button>
                  )}
                </div>
              </div>

              <div className="text-[11px] muted">→ Vaibhav will review and approve. Dates update on approval.</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex justify-between items-center gap-3" style={{ borderTop: '1px solid var(--brand-borderSoft)', paddingTop: 16 }}>
          <Button onClick={onClose}>Cancel</Button>
          <div className="flex items-center gap-2">
            {/* Path A step 1: go to confirm */}
            {path === 'a' && !confirming && (
              <Button
                variant="primary"
                disabled={!newDueDate || !amountReceived}
                onClick={() => setConfirming(true)}
              >
                Review & confirm →
              </Button>
            )}
            {/* Path A step 2: actually record */}
            {path === 'a' && confirming && (
              <>
                <Button onClick={() => setConfirming(false)}>← Edit</Button>
                <Button
                  variant="primary"
                  disabled={recordPayment.isPending}
                  onClick={() => recordPayment.mutate()}
                  style={{ background: '#10b981' }}
                >
                  {recordPayment.isPending ? 'Recording…' : '✓ Yes, record payment'}
                </Button>
              </>
            )}
            {/* Path B: submit leverage DCR */}
            {path === 'b' && (
              <Button
                variant="primary"
                disabled={
                  submitLeverage.isPending ||
                  (!date1 && !date2) ||
                  !summary30d || !mitaliF15d || !bhavneetF15d || !lastSessionDate || wordCount < 50
                }
                onClick={() => submitLeverage.mutate()}
              >
                {submitLeverage.isPending ? 'Submitting…' : 'Submit for approval'}
              </Button>
            )}
          </div>
          {path && !confirming && <button className="text-[11px] muted hover:opacity-70" onClick={() => setPath(null)}>← Back</button>}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
