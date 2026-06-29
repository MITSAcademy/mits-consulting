import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Pill } from '@/components/ui/pill';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { ClipboardList, Plus, X, Download, ThumbsUp, ThumbsDown, Minus } from 'lucide-react';
import { useState } from 'react';
import { useUI } from '@/store/ui';
import { todayISO, minPastDate, maxTodayDate, minFutureDate } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import { Link } from 'react-router-dom';

const LOG_ROLES = ['founder', 'manager', 'lead', 'staff', 'account_manager', 'payment_processor'];
const HOUR_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const MINUTE_OPTIONS = [0, 15, 30, 45];
function durationToDecimal(h: number, m: number) { return h + m / 60; }
function decimalToDuration(d: number) { const h = Math.floor(d); const m = Math.round((d - h) * 60); return { h, m }; }
type Feedback = 'positive' | 'neutral' | 'negative';

const FEEDBACK_STYLE: Record<Feedback, { label: string; color: string; bg: string }> = {
  positive: { label: 'Positive', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  neutral:  { label: 'Neutral',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  negative: { label: 'Negative', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

function FeedbackPicker({ value, onChange }: { value: Feedback | ''; onChange: (v: Feedback) => void }) {
  return (
    <div className="flex gap-2">
      {(Object.entries(FEEDBACK_STYLE) as [Feedback, typeof FEEDBACK_STYLE[Feedback]][]).map(([key, s]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
          style={{
            background: value === key ? s.bg : 'transparent',
            borderColor: value === key ? s.color : 'var(--brand-border)',
            color: value === key ? s.color : 'var(--brand-textMuted)',
          }}
        >
          {key === 'positive' && <ThumbsUp size={11} />}
          {key === 'neutral'  && <Minus size={11} />}
          {key === 'negative' && <ThumbsDown size={11} />}
          {s.label}
        </button>
      ))}
    </div>
  );
}

function LogSessionForm({ prefillTrainerId = '', prefillClientId = '', onDone }: {
  prefillTrainerId?: string;
  prefillClientId?: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [trainerId, setTrainerId] = useState(prefillTrainerId);
  const [clientId, setClientId] = useState(prefillClientId);
  const [date, setDate] = useState(todayISO());
  const [durH, setDurH] = useState(1);
  const [durM, setDurM] = useState(0);
  const days = String(durationToDecimal(durH, durM));
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState<Feedback | ''>('');
  const [overrideAmount, setOverrideAmount] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  const user = useAuth((s) => s.user)!;
  const isAM = user.role === 'account_manager';
  const [sessionHappened, setSessionHappened] = useState(true);

  // For AM: clients already backend-scoped to their hostOwnerId; use paginated response
  const { data: clientsResp } = useQuery({
    queryKey: ['clients-active'],
    queryFn: () =>
      api.get('/clients', isAM ? {} : {}).then((r) => {
        const arr = Array.isArray(r.data) ? r.data : (r.data?.data || []);
        return arr.filter((c: any) => ['Active', 'LeverageGranted'].includes(c.lifecycle))
                  .sort((a: any, b: any) => a.name.localeCompare(b.name));
      }),
  });
  const clients = (clientsResp as any[]) || [];

  // For AM: only show trainers linked to their clients as primaryTrainer
  const { data: allTrainers } = useQuery({
    queryKey: ['trainers-active'],
    queryFn: () => api.get('/trainers').then((r) => r.data.filter((t: any) => t.active)),
  });
  const trainers = isAM
    ? (() => {
        const trainerIds = new Set(clients.map((c: any) => c.primaryTrainerId).filter(Boolean));
        return (allTrainers || []).filter((t: any) => trainerIds.has(t.id));
      })()
    : (allTrainers || []);

  const selectedTrainer = trainers.find((t: any) => t.id === trainerId);
  const selectedClient = clients.find((c: any) => c.id === clientId);
  const defaultRate = selectedTrainer?.defaultRateInr || 0;
  const rateModel = selectedTrainer?.rateModel || 'per_session';
  const effectiveHourlyRate = rateModel === 'per_session' ? defaultRate / 2 : defaultRate;
  const total = overrideAmount && customAmount
    ? Math.round(parseFloat(customAmount) || 0)
    : Math.round((parseFloat(days) || 0) * effectiveHourlyRate);

  const canSubmit = !!trainerId && (sessionHappened ? (!!feedback && durationToDecimal(durH, durM) > 0) : true)
    && (!overrideAmount || (!!customAmount && !!overrideReason.trim()));

  const create = useMutation({
    mutationFn: () => {
      if (!trainerId) throw new Error('Select a trainer');
      if (sessionHappened && !feedback) throw new Error('Select session feedback');
      if (sessionHappened && overrideAmount && !overrideReason.trim()) throw new Error('Reason required for amount override');
      const effectiveRate = overrideAmount && customAmount
        ? Math.round(parseFloat(customAmount) / (parseFloat(days) || 1))
        : defaultRate;
      const finalNotes = overrideAmount && overrideReason
        ? `[Override: ${overrideReason}]${notes ? ' · ' + notes : ''}`
        : notes || undefined;
      return api.post('/session-logs', {
        trainerId,
        clientId: clientId || undefined,
        date,
        hours: sessionHappened ? (parseFloat(days) || 0) : 0,
        rateSnapshot: effectiveRate || defaultRate || 1200,
        rateModel: selectedTrainer?.rateModel || 'per_session',
        amountInr: sessionHappened && overrideAmount && customAmount ? Math.round(parseFloat(customAmount)) : undefined,
        feedback: sessionHappened ? feedback : undefined,
        notes: finalNotes,
        sessionHappened,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session-logs'] });
      showToast(sessionHappened ? 'Session logged' : 'No-show logged');
      onDone();
    },
    onError: (e: any) => showToast(e.message || e.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <div className="card mb-4">
      <div className="card-h mb-3">
        <Plus size={14} />
        <span className="font-bold">Log session</span>
        <button className="ml-auto muted hover:text-white" onClick={onDone}><X size={14} /></button>
      </div>
      {/* Session Happened? */}
      <div className="mb-3 flex items-center gap-3">
        <span className="label mb-0">Session happened?</span>
        <div className="flex gap-1.5">
          {[true, false].map((val) => (
            <button key={String(val)} type="button"
              onClick={() => setSessionHappened(val)}
              className="px-3 py-1 rounded-lg text-[12px] font-semibold border transition-all"
              style={{
                background: sessionHappened === val ? (val ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)') : 'transparent',
                borderColor: sessionHappened === val ? (val ? '#22c55e' : '#ef4444') : 'var(--brand-border)',
                color: sessionHappened === val ? (val ? '#22c55e' : '#ef4444') : 'var(--brand-textMuted)',
              }}>
              {val ? 'Yes' : 'No — client no-show'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="label">Client (optional)</label>
          <select className="input" value={clientId} onChange={(e) => {
            const cid = e.target.value;
            setClientId(cid);
            if (cid) {
              const client = clients.find((c: any) => c.id === cid);
              if (client?.primaryTrainerId && !trainerId) setTrainerId(client.primaryTrainerId);
            }
          }}>
            <option value="">— no specific client —</option>
            {clients.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {selectedClient && selectedClient.phoneCode && selectedClient.phoneDigits && (
            <div className="text-[11px] muted mt-0.5">
              Client: <span className="mono">{selectedClient.phoneCode}{selectedClient.phoneDigits}</span>
            </div>
          )}
        </div>
        <div>
          <label className="label">Trainer *</label>
          <select className="input" value={trainerId} onChange={(e) => { setTrainerId(e.target.value); setOverrideAmount(false); setCustomAmount(''); }}>
            <option value="">— select trainer —</option>
            {trainers.map((t: any) => {
              const phone = t.phoneDigits ? `${t.phoneCode || ''}${t.phoneDigits}` : null;
              const tag = t.seqId ? `#${t.seqId}` : null;
              const suffix = [tag, phone].filter(Boolean).join(' · ');
              return (
                <option key={t.id} value={t.id}>
                  {t.name}{suffix ? ` (${suffix})` : ''}{t.defaultRateInr ? ` · ₹${t.defaultRateInr}/session` : ''}
                </option>
              );
            })}
          </select>
          {selectedTrainer && (
            <div className="text-[11px] muted mt-0.5 flex gap-2">
              {selectedTrainer.seqId && <span>#{selectedTrainer.seqId}</span>}
              {selectedTrainer.phoneDigits && (
                <span className="mono">{selectedTrainer.phoneCode}{selectedTrainer.phoneDigits}</span>
              )}
              {selectedTrainer.email && <span>{selectedTrainer.email}</span>}
            </div>
          )}
        </div>
        <div>
          <label className="label">Date *</label>
          <input type="date" className="input" value={date} min={minPastDate()} max={maxTodayDate()} onChange={(e) => setDate(e.target.value)} />
        </div>
        {sessionHappened && (
          <div>
            <label className="label">Duration *</label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <select className="input" value={durH} onChange={(e) => setDurH(Number(e.target.value))}>
                  {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{h}h</option>)}
                </select>
              </div>
              <div className="flex-1">
                <select className="input" value={durM} onChange={(e) => setDurM(Number(e.target.value))}>
                  {MINUTE_OPTIONS.map((m) => <option key={m} value={m}>{String(m).padStart(2,'0')}m</option>)}
                </select>
              </div>
            </div>
            {durationToDecimal(durH, durM) === 0 && (
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--status-amber)' }}>Set a duration greater than 0</div>
            )}
          </div>
        )}
      </div>

      {/* Feedback — required only when session happened */}
      {sessionHappened && (
        <div className="mb-3">
          <label className="label">Session feedback *</label>
          <FeedbackPicker value={feedback} onChange={setFeedback} />
          {!feedback && <div className="text-[11px] mt-1" style={{ color: 'var(--status-amber)' }}>Required before logging</div>}
        </div>
      )}

      {/* Rate summary + override toggle — only when session happened */}
      {sessionHappened && selectedTrainer && (
        <div className="callout mb-3 text-xs flex items-center justify-between gap-3">
          <span>
            Rate: <strong>₹{defaultRate.toLocaleString()}</strong>/session ·
            Duration: <strong>{durH}h {durM > 0 ? `${durM}m` : ''}</strong>{' '}
            ({parseFloat(days) || 0} sessions) ·
            Total: <strong>₹{total.toLocaleString()}</strong>
            {overrideAmount && customAmount && (
              <span className="ml-1" style={{ color: 'var(--status-amber)' }}>
                {' '}(overridden from ₹{Math.round((parseFloat(days) || 0) * defaultRate).toLocaleString()})
              </span>
            )}
          </span>
          <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0" style={{ color: overrideAmount ? 'var(--status-amber)' : undefined }}>
            <input type="checkbox" checked={overrideAmount}
              onChange={(e) => { setOverrideAmount(e.target.checked); if (!e.target.checked) { setCustomAmount(''); setOverrideReason(''); } }} />
            <span className="text-[11px]">Override amount</span>
          </label>
        </div>
      )}

      {sessionHappened && overrideAmount && (
        <div className="grid grid-cols-2 gap-3 mb-3 p-3 rounded-lg" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <div>
            <label className="label" style={{ color: 'var(--status-amber)' }}>Custom total ₹ *</label>
            <input type="number" className="input" placeholder={`Default: ₹${Math.round((parseFloat(days) || 0) * defaultRate)}`}
              value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} />
          </div>
          <div>
            <label className="label" style={{ color: 'var(--status-amber)' }}>Reason *</label>
            <input type="text" className="input" placeholder="e.g. partial session, negotiated rate"
              value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
          </div>
        </div>
      )}

      <div className="mb-3">
        <label className="label">Notes (optional)</label>
        <input type="text" className="input" placeholder="e.g. mock interview, Java session"
          value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" disabled={!canSubmit || create.isPending} onClick={() => create.mutate()}>
          {sessionHappened ? 'Log session' : 'Log no-show'}
        </Button>
      </div>
    </div>
  );
}

/* ── My clients panel (left sidebar for account_manager) ──────────────────── */

function MyClientsPanel({ onSelect }: { onSelect: (trainerId: string, clientId: string) => void }) {
  const { data: clientsRaw } = useQuery({
    queryKey: ['clients-active'],
    queryFn: () => api.get('/clients').then((r) => {
      const arr = Array.isArray(r.data) ? r.data : (r.data?.data || []);
      return arr.filter((c: any) => ['Active', 'LeverageGranted'].includes(c.lifecycle))
                .sort((a: any, b: any) => a.name.localeCompare(b.name));
    }),
  });
  const clients = (clientsRaw as any[]) || [];

  return (
    <div className="flex-shrink-0 rounded-xl border overflow-hidden" style={{ width: 220, background: 'var(--bg-card)', borderColor: 'var(--brand-border)' }}>
      <div className="px-3 py-2 border-b text-xs font-bold uppercase tracking-wide" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-textMuted)' }}>
        My clients
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 500 }}>
        {clients.length === 0 && (
          <div className="text-[11px] muted p-3">No active clients assigned yet.</div>
        )}
        {clients.map((c: any) => (
          <button
            key={c.id}
            onClick={() => c.primaryTrainerId && onSelect(c.primaryTrainerId, c.id)}
            className="w-full text-left px-3 py-2 border-b transition-colors"
            style={{ borderColor: 'var(--brand-borderSoft)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-cardHover)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <div className="font-medium text-xs truncate" style={{ color: 'var(--brand-text)' }}>{c.name}</div>
            <div className="text-[10px] muted truncate mt-0.5">
              {c.primaryTrainer?.name
                ? <span style={{ color: 'var(--accent-gold)' }}>{c.primaryTrainer.name}</span>
                : <span className="italic">No trainer assigned</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Status helpers ──────────────────────────────────────────────────────── */

const STATUS_COLOR: Record<string, 'green' | 'blue' | 'amber' | 'grey'> = {
  Paid: 'green', PaymentApproved: 'blue', ReadyForFinal: 'amber', Logged: 'grey',
};

function FeedbackBadge({ value }: { value?: string | null }) {
  if (!value) return null;
  const s = FEEDBACK_STYLE[value as Feedback];
  if (!s) return null;
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: s.bg, color: s.color }}>
      {value}
    </span>
  );
}

/* ── PDF export ─────────────────────────────────────────────────────────── */

function exportPdf(logs: any[]) {
  const rows = logs.map((l) => `
    <tr>
      <td>${l.date}</td>
      <td>${l.trainer?.name || '—'}</td>
      <td>${l.client?.name || '—'}</td>
      <td>${(() => { const h = Math.floor(l.hours); const m = Math.round((l.hours - h) * 60); return `${h}h${m > 0 ? ` ${m}m` : ''}`; })()}</td>
      <td>₹${l.rateSnapshot?.toLocaleString()}</td>
      <td>₹${l.amountInr?.toLocaleString()}</td>
      <td>${l.feedback || '—'}</td>
      <td>${l.status}</td>
      <td>${l.notes || '—'}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Session Logs — MITS</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 20px; }
    h1 { font-size: 16px; margin-bottom: 4px; }
    p { font-size: 11px; color: #666; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f3f4f6; text-align: left; padding: 6px 8px; font-size: 11px; border: 1px solid #e5e7eb; }
    td { padding: 5px 8px; border: 1px solid #e5e7eb; font-size: 11px; }
    tr:nth-child(even) td { background: #fafafa; }
  </style></head><body>
  <h1>MITS Consulting — Session Logs</h1>
  <p>Exported ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · ${logs.length} entries</p>
  <table>
    <thead><tr><th>Date</th><th>Trainer</th><th>Client</th><th>Duration</th><th>Rate</th><th>Amount</th><th>Feedback</th><th>Status</th><th>Notes</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  </body></html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.print();
  }
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export function SessionLogsPage() {
  const user = useAuth((s) => s.user)!;
  const canLog = LOG_ROLES.includes(user.role);
  const isAM = user.role === 'account_manager';
  const [showForm, setShowForm] = useState(false);
  const [prefillTrainer, setPrefillTrainer] = useState('');
  const [prefillClient, setPrefillClient] = useState('');

  const { data } = useQuery({
    queryKey: ['session-logs'],
    queryFn: () => api.get('/session-logs').then((r) => r.data),
  });

  function openFormFor(trainerId: string, clientId: string) {
    setPrefillTrainer(trainerId);
    setPrefillClient(clientId);
    setShowForm(true);
  }

  return (
    <>
      <Topbar
        title="Session logs"
        subtitle={`${data?.length || 0}`}
        actions={
          <div className="flex gap-2">
            {data && data.length > 0 && (
              <Button onClick={() => exportPdf(data)}>
                <Download size={14} /> Export PDF
              </Button>
            )}
            {canLog && !showForm && (
              <Button variant="primary" onClick={() => { setPrefillTrainer(''); setPrefillClient(''); setShowForm(true); }}>
                <Plus size={14} /> Log session
              </Button>
            )}
          </div>
        }
      />
      <Page>
        <div className="flex gap-4 items-start">
          {/* Left panel — my clients (account_manager) */}
          {isAM && (
            <MyClientsPanel onSelect={(tid, cid) => openFormFor(tid, cid)} />
          )}

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {showForm && (
              <LogSessionForm
                prefillTrainerId={prefillTrainer}
                prefillClientId={prefillClient}
                onDone={() => setShowForm(false)}
              />
            )}
            {(data || []).length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                tone="grey"
                title="No session logs yet"
                description="Use the Log session button above, or click a client on the left to pre-fill."
              />
            ) : (
              <div className="table-card">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Trainer</th>
                      <th>Client</th>
                      <th>Duration</th>
                      <th>Rate</th>
                      <th>Amount</th>
                      <th>Feedback</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data || []).map((l: any) => (
                      <tr key={l.id}>
                        <td className="mono text-[12px]">{l.date}</td>
                        <td className="font-medium">{l.trainer?.name}</td>
                        <td className="muted">
                          {l.client
                            ? <Link to={`/clients/${l.client.id}`} className="hover:underline">{l.client.name}</Link>
                            : '—'}
                        </td>
                        <td className="mono">
                          {l.sessionHappened === false
                            ? <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>No Show</span>
                            : (() => { const {h, m} = decimalToDuration(l.hours); return `${h}h${m > 0 ? ` ${m}m` : ''}`; })()}
                        </td>
                        <td className="mono text-[12px]">₹{l.rateSnapshot?.toLocaleString()}</td>
                        <td className="mono font-semibold">{l.sessionHappened === false ? <span className="muted text-[12px]">₹0</span> : `₹${l.amountInr?.toLocaleString()}`}</td>
                        <td><FeedbackBadge value={l.feedback} /></td>
                        <td><Pill color={STATUS_COLOR[l.status] || 'grey'}>{l.status}</Pill></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Page>
    </>
  );
}
