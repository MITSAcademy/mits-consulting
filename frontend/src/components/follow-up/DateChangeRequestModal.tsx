/**
 * Shown when Mitali clicks ✏ Dates.
 *
 * If a pending request exists → show its status (locked).
 * If last request was rejected → show resubmit form pre-filled.
 * Otherwise → show new request form with Path A / Path B choice.
 */
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, CheckCircle2, XCircle, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { useUI } from '@/store/ui';
import { Button } from '@/components/ui/button';
import { Label, Input } from '@/components/ui/input';

interface Row {
  id: string;
  name: string;
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
  // Path B fields for resubmit
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

export default function DateChangeRequestModal({ r, onClose }: { r: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useUI(s => s.showToast);

  // Fetch existing pending/rejected request for this client
  const { data: existing, isLoading } = useQuery<DCR | null>({
    queryKey: ['dcr-client', r.id],
    queryFn: () => api.get(`/date-change-requests/client/${r.id}`).then((d: any) => d.data),
  });

  // Also fetch all requests to find last rejected
  const { data: allRequests } = useQuery<DCR[]>({
    queryKey: ['date-change-requests'],
    queryFn: () => api.get('/date-change-requests').then((d: any) => d.data),
  });
  const lastRejected = allRequests?.find(req => req.status === 'rejected' && (req as any).clientId === r.id);

  const [path, setPath] = useState<'a' | 'b' | null>(null);
  const [date1, setDate1] = useState(r.payDate1 || '');
  const [date2, setDate2] = useState(r.payDate2 || '');
  const [linkedPaymentId, setLinkedPaymentId] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [summary30d, setSummary30d] = useState(lastRejected?.summary30d || '');
  const [mitaliF15d, setMitaliF15d] = useState(lastRejected?.mitaliF15d || '');
  const [bhavneetF15d, setBhavneetF15d] = useState(lastRejected?.bhavneetF15d || '');
  const [lastSessionDate, setLastSessionDate] = useState(lastRejected?.lastSessionDate || '');
  const [issueDetail, setIssueDetail] = useState(lastRejected?.issueDetail || '');
  const fileRef = useRef<HTMLInputElement>(null);

  const wordCount = issueDetail.trim().split(/\s+/).filter(Boolean).length;

  const submit = useMutation({
    mutationFn: async () => {
      const body: any = {
        clientId: r.id,
        type: path === 'a' ? 'payment_received' : 'leverage',
        proposedDate1: date1 || null,
        proposedDate2: date2 || null,
      };
      if (path === 'a') {
        body.linkedPaymentId = linkedPaymentId || null;
        body.screenshotBase64 = screenshot || null;
      } else {
        body.summary30d = summary30d;
        body.mitaliF15d = mitaliF15d;
        body.bhavneetF15d = bhavneetF15d;
        body.lastSessionDate = lastSessionDate || null;
        body.issueDetail = issueDetail;
        body.leverageScreenshot = screenshot || null;
      }
      // Resubmit or new
      if (lastRejected) {
        return api.patch(`/date-change-requests/${lastRejected.id}`, body);
      }
      return api.post('/date-change-requests', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['date-change-requests'] });
      qc.invalidateQueries({ queryKey: ['dcr-client', r.id] });
      showToast('Request submitted — waiting for approval');
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
          <div className="font-bold text-[15px]" style={{ color: 'var(--brand-text)' }}>Change payment dates — {r.name}</div>
          <div className="text-[12px] muted mt-0.5">
            Current: <strong>{fmtDate(r.payDate1)}</strong> / <strong>{fmtDate(r.payDate2)}</strong>
          </div>
        </div>

        <div className="px-5 py-4">
          {isLoading && <div className="muted text-[13px]">Checking existing requests…</div>}

          {/* Pending request — locked */}
          {!isLoading && existing && existing.status === 'pending' && (
            <div className="rounded-xl px-4 py-4 text-center" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)' }}>
              <Clock size={24} style={{ color: '#fbbf24', margin: '0 auto 8px' }} />
              <div className="font-bold text-[13px]" style={{ color: '#fbbf24' }}>Request pending approval</div>
              <div className="text-[12px] muted mt-2">
                Proposed: <strong>{fmtDate(existing.proposedDate1)}</strong> / <strong>{fmtDate(existing.proposedDate2)}</strong>
              </div>
              <div className="text-[12px] muted mt-1">
                Type: {existing.type === 'payment_received' ? '💳 Payment received' : '⏳ Leverage'}
              </div>
              <div className="text-[11px] muted mt-3">Dates are locked until approved or rejected.</div>
            </div>
          )}

          {/* Rejected — show resubmit banner + pre-filled form */}
          {!isLoading && !existing && lastRejected && (
            <div className="mb-4 rounded-lg px-3 py-2.5 text-[12px]" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
              <strong>Last request rejected</strong> by {lastRejected.approvedByName}
              {lastRejected.rejectionNote && <div className="mt-1 opacity-80">Reason: {lastRejected.rejectionNote}</div>}
              <div className="mt-1 opacity-70">Fix the issues below and resubmit.</div>
            </div>
          )}

          {/* New request form */}
          {!isLoading && !existing && (
            <>
              {/* Proposed dates */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="form-row">
                  <Label>Pay Date 1 (next due)</Label>
                  <Input type="date" value={date1} onChange={e => setDate1(e.target.value)} />
                </div>
                <div className="form-row">
                  <Label>Pay Date 2 (after that)</Label>
                  <Input type="date" value={date2} onChange={e => setDate2(e.target.value)} />
                </div>
              </div>

              {/* Path selector */}
              {!path && (
                <div>
                  <div className="text-[12px] font-semibold mb-3" style={{ color: 'var(--brand-textSecondary)' }}>Why are you changing the dates?</div>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setPath('a')}
                      className="rounded-xl p-4 text-left transition-all hover:opacity-90"
                      style={{ background: 'rgba(16,185,129,0.08)', border: '2px solid rgba(16,185,129,0.3)' }}>
                      <div className="text-[20px] mb-2">💳</div>
                      <div className="font-bold text-[13px]" style={{ color: '#10b981' }}>Client paid</div>
                      <div className="text-[11px] muted mt-1">I collected a payment and need to move the dates forward</div>
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

              {/* Path A — Payment received */}
              {path === 'a' && (
                <div className="space-y-4">
                  <div className="text-[12px] font-semibold mb-1" style={{ color: '#10b981' }}>💳 Payment received — link proof</div>

                  {/* Recent payments to link */}
                  {r.payments && r.payments.length > 0 && (
                    <div>
                      <Label>Link a recorded payment</Label>
                      <select value={linkedPaymentId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setLinkedPaymentId(e.target.value)}
                        className="w-full text-[12px] rounded-lg px-3 py-2 mt-1"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)', color: 'var(--brand-text)' }}>
                        <option value="">— Select payment —</option>
                        {r.payments.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.currency} {p.amount} · {p.paymentDate?.slice(0, 10)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Screenshot */}
                  <div>
                    <Label>Payment screenshot (optional but recommended)</Label>
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

                  <div className="text-[11px] muted">→ Samita will review and approve. Dates update on approval.</div>
                </div>
              )}

              {/* Path B — Leverage */}
              {path === 'b' && (
                <div className="space-y-3">
                  <div className="text-[12px] font-semibold" style={{ color: '#f59e0b' }}>⏳ Leverage request — fill all fields</div>

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
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex justify-between items-center gap-3" style={{ borderTop: '1px solid var(--brand-borderSoft)', paddingTop: 16 }}>
          <Button onClick={onClose}>Cancel</Button>
          {!isLoading && !existing && path && (
            <Button
              variant="primary"
              disabled={
                submit.isPending ||
                (!date1 && !date2) ||
                (path === 'b' && (!summary30d || !mitaliF15d || !bhavneetF15d || !lastSessionDate || wordCount < 50))
              }
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? 'Submitting…' : 'Submit for approval'}
            </Button>
          )}
          {path && <button className="text-[11px] muted hover:opacity-70" onClick={() => setPath(null)}>← Change type</button>}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
