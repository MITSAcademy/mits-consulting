import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { checkMilestone, incrementCount } from '@/lib/milestones';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { ClipboardList, Download, ThumbsUp, ThumbsDown, Minus, Search } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useUI } from '@/store/ui';
import { todayISO, minPastDate, maxTodayDate } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Label, Select, Input } from '@/components/ui/input';

const LOG_ROLES = ['founder', 'manager', 'lead', 'staff', 'account_manager', 'payment_processor'];
const HOUR_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => i);
function durationToDecimal(h: number, m: number) { return h + m / 60; }
function decimalToDuration(d: number) { const h = Math.floor(d); const m = Math.round((d - h) * 60); return { h, m }; }
type Feedback = 'positive' | 'neutral' | 'negative';

const FEEDBACK_STYLE: Record<Feedback, { label: string; color: string; bg: string }> = {
  positive: { label: 'Positive', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  neutral:  { label: 'Neutral',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  negative: { label: 'Negative', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

function FeedbackBadge({ value }: { value?: string | null }) {
  if (!value) return null;
  const s = FEEDBACK_STYLE[value as Feedback];
  if (!s) return null;
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

/* ── Inline feedback picker (compact, 3 buttons) ─────────────────────────── */
function FeedbackPicker({ value, onChange }: { value: Feedback | ''; onChange: (v: Feedback) => void }) {
  return (
    <div className="flex gap-1">
      {(Object.entries(FEEDBACK_STYLE) as [Feedback, (typeof FEEDBACK_STYLE)[Feedback]][]).map(([key, s]) => (
        <button
          key={key} type="button" title={s.label}
          onClick={() => onChange(key)}
          className="flex items-center gap-0.5 px-1.5 py-1 rounded text-[10px] font-semibold border transition-all"
          style={{
            background: value === key ? s.bg : 'transparent',
            borderColor: value === key ? s.color : 'var(--brand-border)',
            color: value === key ? s.color : 'var(--brand-textMuted)',
          }}
        >
          {key === 'positive' && <ThumbsUp size={9} />}
          {key === 'neutral'  && <Minus size={9} />}
          {key === 'negative' && <ThumbsDown size={9} />}
        </button>
      ))}
    </div>
  );
}

/* ── Inline log row state per training ──────────────────────────────────────
   Each active training gets its own inline row in the "Log a session" table.
   State is keyed by regularTraining id.
────────────────────────────────────────────────────────────────────────────*/
interface RowState {
  _trainerSearch?: string;
  sessionHappened: boolean;
  cancelledBy: 'trainer' | 'client' | '';
  date: string;
  durH: number;
  durM: number;
  feedback: Feedback | '';
  notes: string;
  trainerId: string; // pre-filled from training, editable
}

function defaultRow(trainerId: string): RowState {
  return { sessionHappened: true, cancelledBy: '', date: todayISO(), durH: 1, durM: 0, feedback: '', notes: '', trainerId };
}

/* ── Edit dialog for existing logs ─────────────────────────────────────────*/
function EditLogDialog({ log, onClose }: { log: any; onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [sessionHappened, setSessionHappened] = useState<boolean>(log.sessionHappened !== false);
  const [cancelledBy, setCancelledBy] = useState<string>(log.cancelledBy || '');
  const [durH, setDurH] = useState(() => decimalToDuration(log.hours || 0).h);
  const [durM, setDurM] = useState(() => decimalToDuration(log.hours || 0).m);
  const [feedback, setFeedback] = useState<Feedback | ''>(log.feedback || '');
  const [date, setDate] = useState(log.date || todayISO());

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/session-logs/${log.id}`, {
        sessionHappened,
        cancelledBy: !sessionHappened ? (cancelledBy || null) : null,
        hours: sessionHappened ? durationToDecimal(durH, durM) : 0,
        feedback: sessionHappened ? (feedback || null) : null,
        date,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session-logs'] });
      showToast('Session updated');
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`Edit session — ${log.client?.name || log.trainer?.name}`}>
        <div className="space-y-3">
          <div>
            <Label>Session happened?</Label>
            <div className="flex gap-2 mt-1">
              {[true, false].map((val) => (
                <button key={String(val)} type="button"
                  onClick={() => { setSessionHappened(val); if (val) setCancelledBy(''); }}
                  className="px-3 py-1 rounded-lg text-[12px] font-semibold border transition-all"
                  style={{
                    background: sessionHappened === val ? (val ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)') : 'transparent',
                    borderColor: sessionHappened === val ? (val ? '#22c55e' : '#ef4444') : 'var(--brand-border)',
                    color: sessionHappened === val ? (val ? '#22c55e' : '#ef4444') : 'var(--brand-textMuted)',
                  }}>
                  {val ? 'Yes' : 'No — cancelled'}
                </button>
              ))}
            </div>
          </div>
          {!sessionHappened && (
            <div>
              <Label>Cancelled by</Label>
              <Select value={cancelledBy} onChange={(e) => setCancelledBy(e.target.value)} style={{ marginTop: 4 }}>
                <option value="">— select —</option>
                <option value="trainer">Trainer</option>
                <option value="client">Client</option>
              </Select>
            </div>
          )}
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          {sessionHappened && (
            <div>
              <Label>Duration</Label>
              <div className="flex gap-2 mt-1">
                <select className="input flex-1" value={durH} onChange={(e) => setDurH(Number(e.target.value))}>
                  {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{h}h</option>)}
                </select>
                <select className="input flex-1" value={durM} onChange={(e) => setDurM(Number(e.target.value))}>
                  {MINUTE_OPTIONS.map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}m</option>)}
                </select>
              </div>
            </div>
          )}
          {sessionHappened && (
            <div>
              <Label>Session feedback</Label>
              <div className="mt-1 flex gap-2">
                {(Object.entries(FEEDBACK_STYLE) as [Feedback, (typeof FEEDBACK_STYLE)[Feedback]][]).map(([key, s]) => (
                  <button key={key} type="button"
                    onClick={() => setFeedback(key)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                    style={{
                      background: feedback === key ? s.bg : 'transparent',
                      borderColor: feedback === key ? s.color : 'var(--brand-border)',
                      color: feedback === key ? s.color : 'var(--brand-textMuted)',
                    }}>
                    {key === 'positive' && <ThumbsUp size={11} />}
                    {key === 'neutral'  && <Minus size={11} />}
                    {key === 'negative' && <ThumbsDown size={11} />}
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── PDF export ─────────────────────────────────────────────────────────── */
function exportPdf(logs: any[]) {
  const rows = logs.map((l) => {
    const { h, m } = decimalToDuration(l.hours || 0);
    const dur = l.sessionHappened === false ? '—' : `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    return `<tr>
      <td>${l.client?.name || '—'}</td>
      <td>${l.trainer?.name || '—'}</td>
      <td>${l.client?.hostOwner?.name || '—'}</td>
      <td>${l.sessionHappened === false ? 'No' : 'Yes'}</td>
      <td>${l.cancelledBy || '—'}</td>
      <td>${l.date}</td>
      <td>${dur}</td>
      <td>${l.feedback || '—'}</td>
      <td>${l.status}</td>
    </tr>`;
  }).join('');

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
    <thead><tr><th>Client</th><th>Trainer</th><th>Coordinator</th><th>Session</th><th>Cancelled By</th><th>Date</th><th>Duration</th><th>Feedback</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  </body></html>`;

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); win.print(); }
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export function SessionLogsPage() {
  const user = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const canLog = LOG_ROLES.includes(user.role);

  // Existing session logs
  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ['session-logs'],
    queryFn: () => api.get('/session-logs').then((r) => r.data),
  });

  // Active trainings (same source as My Sessions) — used for the inline log table
  const { data: trainings, isLoading: trainingsLoading } = useQuery({
    queryKey: ['my-sessions-sheet'],
    queryFn: () => api.get('/regular-trainings/my-sessions').then((r) => r.data),
    enabled: canLog,
  });

  // All active trainers for the trainer dropdown
  const { data: allTrainers } = useQuery({
    queryKey: ['trainers-active'],
    queryFn: () => api.get('/trainers').then((r) => r.data.filter((t: any) => t.active)),
    enabled: canLog,
  });

  // History search + pagination
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PAGE_SIZE = 30;

  const filteredLogs = useMemo(() => {
    const all = logs || [];
    const q = historySearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter((l: any) =>
      l.client?.name?.toLowerCase().includes(q) ||
      l.trainer?.name?.toLowerCase().includes(q) ||
      (l.date || '').includes(q)
    );
  }, [logs, historySearch]);

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // One row per active training — avoids merging clients with identical names.
  // Trainings without a linked client record still appear, using the training name as fallback.
  const clientRows = useMemo(() => {
    const list = (trainings || []) as any[];
    // Count how many trainings share each client name to detect duplicates
    const nameCounts: Record<string, number> = {};
    for (const t of list) {
      const name = t.client?.name || t.name;
      if (name) nameCounts[name] = (nameCounts[name] || 0) + 1;
    }
    return list.map((t) => {
      const baseName = t.client?.name || t.name || 'Unknown';
      let suffix = '';
      if (nameCounts[baseName] > 1) {
        // Always use trainer first name — phone may be identical when same client has 2 trainings
        if (t.trainer?.name) suffix = ` (${t.trainer.name.split(' ')[0]})`;
      }
      return {
        trainingId: t.id,
        clientId: t.client?.id || null,
        clientName: baseName + suffix,
        trainerId: t.trainer?.id || '',
        trainerName: t.trainer?.name || '',
        coordinator: t.hostedByDefault?.name || '',
      };
    });
  }, [trainings]);

  // Inline row state keyed by trainingId
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [editLog, setEditLog] = useState<any>(null);

  const delLog = useMutation({
    mutationFn: (id: string) => api.delete(`/session-logs/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['session-logs'] }); showToast('Deleted'); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  function getRow(trainingId: string, defaultTrainerId: string): RowState {
    return rows[trainingId] ?? defaultRow(defaultTrainerId);
  }

  function setRow(trainingId: string, patch: Partial<RowState>, defaultTrainerId: string) {
    setRows((prev) => ({
      ...prev,
      [trainingId]: { ...getRow(trainingId, defaultTrainerId), ...patch },
    }));
  }

  async function submitRow(cr: typeof clientRows[0]) {
    const row = getRow(cr.trainingId, cr.trainerId);
    if (!row.trainerId) { showToast('Select a trainer', 'error'); return; }
    if (row.sessionHappened && !row.feedback) { showToast('Select session feedback', 'error'); return; }
    if (row.sessionHappened && durationToDecimal(row.durH, row.durM) === 0) { showToast('Set a duration > 0', 'error'); return; }

    setSubmitting((p) => ({ ...p, [cr.trainingId]: true }));
    try {
      const trainer = (allTrainers as any[] || []).find((t: any) => t.id === row.trainerId);
      const defaultRate = trainer?.defaultRateInr || 0;
      const rateModel = trainer?.rateModel || 'per_session';
      const hours = row.sessionHappened ? durationToDecimal(row.durH, row.durM) : 0;
      const effectiveHourlyRate = rateModel === 'per_session' ? defaultRate / 2 : defaultRate;
      await api.post('/session-logs', {
        trainerId: row.trainerId,
        clientId: cr.clientId,
        date: row.date,
        hours,
        rateSnapshot: defaultRate || 0,
        rateModel,
        amountInr: undefined,
        feedback: row.sessionHappened ? row.feedback : undefined,
        notes: row.notes || undefined,
        sessionHappened: row.sessionHappened,
        cancelledBy: !row.sessionHappened ? (row.cancelledBy || undefined) : undefined,
      });
      qc.invalidateQueries({ queryKey: ['session-logs'] });
      showToast(row.sessionHappened ? 'Session logged' : 'No-show logged');
      if (row.sessionHappened) {
        const count = incrementCount('sessions_logged');
        checkMilestone('sessions_logged', count, showToast);
      }
      // Reset this row to defaults
      setRows((prev) => { const n = { ...prev }; delete n[cr.trainingId]; return n; });
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Failed', 'error');
    } finally {
      setSubmitting((p) => { const n = { ...p }; delete n[cr.trainingId]; return n; });
    }
  }

  const inlineSel: React.CSSProperties = {
    fontSize: 11, padding: '3px 6px', borderRadius: 6,
    border: '1px solid var(--brand-border)',
    background: 'var(--bg-input)', color: 'var(--brand-text)',
  };

  return (
    <>
      <Topbar
        title="Session logs"
        subtitle={`${logs?.length || 0} entries`}
        actions={
          <div className="flex gap-2">
            {logs && logs.length > 0 && (
              <Button onClick={() => exportPdf(logs)}>
                <Download size={14} /> Export PDF
              </Button>
            )}
          </div>
        }
      />
      <Page>

        {/* Shared trainer datalist — rendered once, shared by all inline rows */}
        <datalist id="trainer-datalist">
          {(allTrainers as any[] || []).map((t: any) => (
            <option key={t.id} value={t.name} />
          ))}
        </datalist>

        {/* ── Section 1: Inline log table ─────────────────────────────────── */}
        {canLog && trainingsLoading && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--brand-textMuted)', marginBottom: 10 }}>Log a session</div>
            <div className="table-card" style={{ padding: '16px 20px' }}>
              {[...Array(5)].map((_, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
                  <div style={{ height: 28, borderRadius: 6, background: 'var(--bg-input)', flex: '0 0 120px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  <div style={{ height: 28, borderRadius: 6, background: 'var(--bg-input)', flex: '0 0 120px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  <div style={{ height: 28, borderRadius: 6, background: 'var(--bg-input)', flex: 1, animation: 'pulse 1.5s ease-in-out infinite' }} />
                </div>
              ))}
            </div>
          </div>
        )}
        {canLog && !trainingsLoading && clientRows.length === 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--brand-textMuted)', marginBottom: 10 }}>Log a session</div>
            <EmptyState icon={ClipboardList} tone="grey" title="No clients assigned" description="You don't have any active client trainings assigned yet. Contact your coordinator." />
          </div>
        )}
        {canLog && clientRows.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--brand-textMuted)', marginBottom: 10 }}>
              Log a session
            </div>
            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 130 }}>Client</th>
                    <th style={{ minWidth: 130 }}>Trainer</th>
                    <th style={{ minWidth: 90 }}>Coordinator</th>
                    <th style={{ minWidth: 100 }}>Session Happened</th>
                    <th style={{ minWidth: 100 }}>Cancelled By</th>
                    <th style={{ minWidth: 110 }}>Date</th>
                    <th style={{ minWidth: 120 }}>Duration</th>
                    <th style={{ minWidth: 120 }}>Feedback</th>
                    <th style={{ minWidth: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {clientRows.map((cr) => {
                    const row = getRow(cr.trainingId, cr.trainerId);
                    const busy = submitting[cr.trainingId];
                    const canSubmit = !!row.trainerId &&
                      (row.sessionHappened ? (!!row.feedback && durationToDecimal(row.durH, row.durM) > 0) : true);
                    return (
                      <tr key={cr.trainingId}>
                        {/* Client */}
                        <td>
                          {cr.clientId
                            ? <Link to={`/clients/${cr.clientId}`} className="font-medium text-[12px] hover:underline">{cr.clientName}</Link>
                            : <span className="font-medium text-[12px]">{cr.clientName}</span>
                          }
                        </td>

                        {/* Trainer — typeahead backed by shared datalist (avoids N×M DOM nodes) */}
                        <td>
                          {(() => {
                            const trainers = (allTrainers as any[] || []);
                            const picked = trainers.find((t: any) => t.id === row.trainerId);
                            return (
                              <input
                                list="trainer-datalist"
                                style={inlineSel}
                                placeholder="— select —"
                                value={picked ? picked.name : (row._trainerSearch ?? '')}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const match = trainers.find((t: any) => t.name === val);
                                  setRow(cr.trainingId, { trainerId: match ? match.id : '', _trainerSearch: val } as any, cr.trainerId);
                                }}
                              />
                            );
                          })()}
                        </td>

                        {/* Coordinator */}
                        <td className="text-[11px] muted">{cr.coordinator || '—'}</td>

                        {/* Session Happened */}
                        <td>
                          <select style={inlineSel} value={row.sessionHappened ? 'yes' : 'no'}
                            onChange={(e) => {
                              const yes = e.target.value === 'yes';
                              setRow(cr.trainingId, { sessionHappened: yes, cancelledBy: yes ? '' : row.cancelledBy }, cr.trainerId);
                            }}>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </select>
                        </td>

                        {/* Cancelled By */}
                        <td>
                          {!row.sessionHappened ? (
                            <select style={inlineSel} value={row.cancelledBy}
                              onChange={(e) => setRow(cr.trainingId, { cancelledBy: e.target.value as any }, cr.trainerId)}>
                              <option value="">— select —</option>
                              <option value="trainer">Trainer</option>
                              <option value="client">Client</option>
                            </select>
                          ) : <span className="muted text-[11px]">—</span>}
                        </td>

                        {/* Date */}
                        <td>
                          <input type="date" style={{ ...inlineSel, width: 110 }}
                            value={row.date} min={minPastDate()} max={maxTodayDate()}
                            onChange={(e) => setRow(cr.trainingId, { date: e.target.value }, cr.trainerId)} />
                        </td>

                        {/* Duration */}
                        <td>
                          {row.sessionHappened ? (
                            <div className="flex gap-1 items-center">
                              <select style={{ ...inlineSel, width: 52 }} value={row.durH}
                                onChange={(e) => setRow(cr.trainingId, { durH: Number(e.target.value) }, cr.trainerId)}>
                                {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{h}h</option>)}
                              </select>
                              <select style={{ ...inlineSel, width: 56 }} value={row.durM}
                                onChange={(e) => setRow(cr.trainingId, { durM: Number(e.target.value) }, cr.trainerId)}>
                                {MINUTE_OPTIONS.map((m) => <option key={m} value={m}>{String(m).padStart(2,'0')}m</option>)}
                              </select>
                            </div>
                          ) : <span className="muted text-[11px]">—</span>}
                        </td>

                        {/* Feedback */}
                        <td>
                          {row.sessionHappened
                            ? <FeedbackPicker value={row.feedback} onChange={(v) => setRow(cr.trainingId, { feedback: v }, cr.trainerId)} />
                            : <span className="muted text-[11px]">—</span>}
                        </td>

                        {/* Log button + validation hint */}
                        <td style={{ minWidth: 90 }}>
                          <div className="flex flex-col gap-1">
                            <Button size="sm" variant="primary"
                              disabled={!canSubmit || busy}
                              title={!canSubmit && !busy ? (
                                !row.trainerId ? 'Select a trainer first' :
                                row.sessionHappened && durationToDecimal(row.durH, row.durM) === 0 ? 'Set session duration' :
                                row.sessionHappened && !row.feedback ? 'Pick a feedback rating' : ''
                              ) : ''}
                              onClick={() => submitRow(cr)}>
                              {busy ? '…' : 'Log'}
                            </Button>
                            {!canSubmit && !busy && (
                              <span style={{ fontSize: 10, color: 'var(--brand-textMuted)', lineHeight: 1.3 }}>
                                {!row.trainerId ? 'Select trainer' :
                                 row.sessionHappened && durationToDecimal(row.durH, row.durM) === 0 ? 'Set duration' :
                                 row.sessionHappened && !row.feedback ? 'Pick feedback' : ''}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Section 2: Existing session logs ───────────────────────────── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--brand-textMuted)' }}>
              Session history {(logs || []).length > 0 && (
                <span style={{ fontWeight: 400 }}>
                  · {historySearch ? `${filteredLogs.length} of ${(logs || []).length}` : `${(logs || []).length}`} entries
                </span>
              )}
            </div>
            {(logs || []).length > 0 && (
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--brand-textMuted)', pointerEvents: 'none' }} />
                <input
                  className="input"
                  value={historySearch}
                  onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(1); }}
                  placeholder="Search client, trainer, date…"
                  style={{ paddingLeft: 26, fontSize: 12, width: 220 }}
                />
              </div>
            )}
          </div>
          {logsLoading ? (
            <div className="table-card" style={{ padding: '16px 20px' }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} style={{ display: 'flex', gap: 16, marginBottom: 12, alignItems: 'center' }}>
                  <div style={{ height: 20, borderRadius: 4, background: 'var(--bg-input)', flex: '0 0 100px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  <div style={{ height: 20, borderRadius: 4, background: 'var(--bg-input)', flex: '0 0 80px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  <div style={{ height: 20, borderRadius: 4, background: 'var(--bg-input)', flex: 1, animation: 'pulse 1.5s ease-in-out infinite' }} />
                  <div style={{ height: 20, borderRadius: 4, background: 'var(--bg-input)', flex: '0 0 60px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                </div>
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            (logs || []).length === 0
              ? <EmptyState icon={ClipboardList} tone="grey" title="Ready to log your first session?"
                  description="Pick a client from the table above and tap 'Log session' — it takes under 30 seconds." />
              : <EmptyState icon={Search} tone="grey" title="No matching logs"
                  description={`No session logs match "${historySearch}". Try a different client name, trainer name, or date.`} />
          ) : (
            <>
              <div className="table-card" style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Client Name</th>
                      <th>Trainer Name</th>
                      <th>Assigned Coordinator</th>
                      <th>Session Happened</th>
                      <th>Cancelled By</th>
                      <th>Date</th>
                      <th>Duration (HH:MM)</th>
                      <th>Session Feedback</th>
                      <th>Session Logged</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE).map((l: any) => {
                      const { h, m } = decimalToDuration(l.hours || 0);
                      const dur = l.sessionHappened === false
                        ? '—'
                        : `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
                      const coordinator = l.client?.hostOwner?.name || '—';
                      const isDeleting = deleteConfirm === l.id;
                      return (
                        <tr key={l.id} style={isDeleting ? { background: 'rgba(239,68,68,0.06)' } : undefined}>
                          <td>
                            {l.client
                              ? <Link to={`/clients/${l.client.id}`} className="hover:underline font-medium text-[12px]">{l.client.name}</Link>
                              : <span className="muted text-[12px]">—</span>}
                          </td>
                          <td className="text-[12px]">{l.trainer?.name || '—'}</td>
                          <td className="text-[12px] muted">{coordinator}</td>
                          <td>
                            {l.sessionHappened === false
                              ? <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>No</span>
                              : <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>Yes</span>}
                          </td>
                          <td className="text-[12px] capitalize muted">{l.cancelledBy || '—'}</td>
                          <td className="mono text-[12px]">{l.date}</td>
                          <td className="mono text-[12px]">{dur}</td>
                          <td>
                            {l.sessionHappened === false
                              ? <span className="muted text-[11px]">—</span>
                              : <FeedbackBadge value={l.feedback} />}
                          </td>
                          <td>
                            <div className="flex items-center gap-1">
                              <span style={{ fontSize: 14 }}>🟢</span>
                              <span className="text-[11px] font-semibold" style={{ color: '#22c55e' }}>Logged</span>
                            </div>
                          </td>
                          <td>
                            {isDeleting ? (
                              <div className="flex items-center gap-1">
                                <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600, whiteSpace: 'nowrap' }}>Delete?</span>
                                <Button size="sm" variant="danger" onClick={() => { setDeleteConfirm(null); delLog.mutate(l.id); }}>Yes</Button>
                                <Button size="sm" onClick={() => setDeleteConfirm(null)}>No</Button>
                              </div>
                            ) : (
                              <div className="flex gap-1">
                                <Button size="sm" onClick={() => setEditLog(l)}>Edit</Button>
                                <Button size="sm" variant="danger" onClick={() => setDeleteConfirm(l.id)}>Delete</Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              {filteredLogs.length > HISTORY_PAGE_SIZE && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 }}>
                  <Button size="sm" variant="ghost" onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage === 1}>← Prev</Button>
                  <span style={{ fontSize: 12, color: 'var(--brand-textMuted)' }}>
                    Page {historyPage} of {Math.ceil(filteredLogs.length / HISTORY_PAGE_SIZE)}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setHistoryPage(p => Math.min(Math.ceil(filteredLogs.length / HISTORY_PAGE_SIZE), p + 1))} disabled={historyPage >= Math.ceil(filteredLogs.length / HISTORY_PAGE_SIZE)}>Next →</Button>
                </div>
              )}
            </>
          )}
        </div>
      </Page>

      {editLog && <EditLogDialog log={editLog} onClose={() => setEditLog(null)} />}
    </>
  );
}
