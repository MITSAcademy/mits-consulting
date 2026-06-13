import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Pill } from '@/components/ui/pill';
import { Link } from 'react-router-dom';
import { Calendar, CheckCircle2, XCircle, CircleDot, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { useUI } from '@/store/ui';
import { minPastDate, maxTodayDate } from '@/lib/utils';

interface Props {
  /** Use one or the other */
  clientId?: string;
  trainerId?: string;
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

interface TrainerRow {
  _key: number;
  trainerId: string;
  trainerSearch: string;
  outcome: string;
  trainerOutcome: string;
  feedback: string;
  nextSteps: string;
}

let _rowKey = 0;
function newRow(): TrainerRow {
  return { _key: ++_rowKey, trainerId: '', trainerSearch: '', outcome: 'Positive', trainerOutcome: '', feedback: '', nextSteps: '' };
}

function TrainerFeedbackRow({
  row,
  trainers,
  onChange,
  onRemove,
  canRemove,
  index,
}: {
  row: TrainerRow;
  trainers: any[];
  onChange: (patch: Partial<TrainerRow>) => void;
  onRemove: () => void;
  canRemove: boolean;
  index: number;
}) {
  const filtered = useMemo(() => {
    const q = row.trainerSearch.trim().toLowerCase();
    if (!q) return trainers;
    return trainers.filter((t: any) =>
      `${t.name || ''} ${t.skills || ''} ${t.phoneDigits || ''}`.toLowerCase().includes(q)
    );
  }, [trainers, row.trainerSearch]);

  const selected = trainers.find((t: any) => t.id === row.trainerId);

  const outcomeColor =
    row.trainerOutcome === 'Selected'    ? '#22c55e' :
    row.trainerOutcome === 'Shortlisted' ? '#f59e0b' :
    row.trainerOutcome === 'Rejected'    ? '#ef4444' :
    'var(--brand-textMuted)';

  return (
    <div
      className="rounded-xl p-3 space-y-2"
      style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}
    >
      {/* Row header */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--brand-textSecondary)' }}>
          Resource {index + 1}
          {selected && <span className="ml-1.5 normal-case font-semibold" style={{ color: 'var(--accent-gold)' }}>— {selected.name}</span>}
        </span>
        {canRemove && (
          <button
            onClick={onRemove}
            className="text-[10px] font-semibold px-2 py-0.5 rounded"
            style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--status-red)', border: 'none', cursor: 'pointer' }}
          >
            Remove
          </button>
        )}
      </div>

      {/* Trainer picker */}
      <div>
        <Label>Trainer</Label>
        <Input
          placeholder="Search by name, skill, or phone…"
          value={row.trainerSearch}
          onChange={(e) => onChange({ trainerSearch: e.target.value })}
          className="mb-1"
        />
        <Select value={row.trainerId} onChange={(e) => onChange({ trainerId: e.target.value })}>
          <option value="">— pick trainer —</option>
          {selected && !filtered.some((t) => t.id === selected.id) && (
            <option value={selected.id}>{selected.name}{selected.skills ? ` · ${selected.skills.slice(0, 50)}` : ''}</option>
          )}
          {filtered.map((t: any) => (
            <option key={t.id} value={t.id}>{t.name}{t.skills ? ` · ${t.skills.slice(0, 50)}` : ''}</option>
          ))}
        </Select>
      </div>

      {/* Outcome + Client decision side-by-side */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Overall outcome</Label>
          <Select value={row.outcome} onChange={(e) => onChange({ outcome: e.target.value })}>
            <option value="Positive">Positive</option>
            <option value="Neutral">Neutral</option>
            <option value="Negative">Negative</option>
          </Select>
        </div>
        <div>
          <Label>Client's decision</Label>
          <Select
            value={row.trainerOutcome}
            onChange={(e) => onChange({ trainerOutcome: e.target.value })}
            style={{ color: row.trainerOutcome ? outcomeColor : undefined, fontWeight: row.trainerOutcome ? 600 : undefined }}
          >
            <option value="">— pending —</option>
            <option value="Selected">Selected ✓</option>
            <option value="Shortlisted">Shortlisted</option>
            <option value="Rejected">Rejected ✗</option>
            <option value="PendingClientFeedback">Pending client feedback</option>
          </Select>
        </div>
      </div>

      {/* Feedback */}
      <div>
        <Label>Client feedback for this resource</Label>
        <Textarea
          rows={2}
          value={row.feedback}
          onChange={(e) => onChange({ feedback: e.target.value })}
          placeholder="What did the client say about this trainer specifically?"
        />
      </div>

      {/* Next steps */}
      <div>
        <Label>Next steps (optional)</Label>
        <Input
          value={row.nextSteps}
          onChange={(e) => onChange({ nextSteps: e.target.value })}
          placeholder="e.g. Client wants another demo, shortlisted for final round…"
        />
      </div>
    </div>
  );
}

function BackfillDemoModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);

  const [actualDate, setActualDate] = useState(todayISO());
  const [actualTimeIst, setActualTimeIst] = useState('');
  const [rows, setRows] = useState<TrainerRow[]>([newRow()]);

  const { data: trainers = [] } = useQuery<any[]>({
    queryKey: ['trainers'],
    queryFn: () => api.get('/trainers').then((r) => r.data),
  });

  function patchRow(key: number, patch: Partial<TrainerRow>) {
    setRows((prev) => prev.map((r) => r._key === key ? { ...r, ...patch } : r));
  }
  function removeRow(key: number) {
    setRows((prev) => prev.filter((r) => r._key !== key));
  }

  const [saving, setSaving] = useState(false);
  async function save() {
    if (!actualDate) return;
    setSaving(true);
    try {
      for (const row of rows) {
        await api.post(`/clients/${clientId}/demos/backfill`, {
          trainerId: row.trainerId || undefined,
          actualDate,
          actualTimeIst: actualTimeIst || undefined,
          outcome: row.outcome,
          trainerOutcome: row.trainerOutcome || undefined,
          feedback: row.feedback || undefined,
          nextSteps: row.nextSteps || undefined,
        });
      }
      qc.invalidateQueries({ queryKey: ['demos', { clientId, trainerId: undefined }] });
      qc.invalidateQueries({ queryKey: ['client', clientId] });
      showToast(`${rows.length} past demo${rows.length > 1 ? 's' : ''} added to history`);
      onClose();
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title="Add past demo"
        description="Log a demo session with separate feedback for each resource. Each trainer gets their own outcome and client feedback."
        className="max-w-2xl"
      >
        {/* Date + time — shared across all trainers in this session */}
        <div className="grid md:grid-cols-2 gap-2.5 mb-1">
          <div className="form-row">
            <Label>Actual date *</Label>
            <Input type="date" value={actualDate} min={minPastDate()} max={maxTodayDate()} onChange={(e) => setActualDate(e.target.value)} />
          </div>
          <div className="form-row">
            <Label>Actual time (IST)</Label>
            <Input type="time" value={actualTimeIst} onChange={(e) => setActualTimeIst(e.target.value)} />
          </div>
        </div>

        {/* Per-trainer rows */}
        <div className="space-y-3 my-2 max-h-[50vh] overflow-y-auto pr-1">
          {rows.map((row, idx) => (
            <TrainerFeedbackRow
              key={row._key}
              row={row}
              trainers={trainers}
              onChange={(patch) => patchRow(row._key, patch)}
              onRemove={() => removeRow(row._key)}
              canRemove={rows.length > 1}
              index={idx}
            />
          ))}
        </div>

        <button
          onClick={() => setRows((prev) => [...prev, newRow()])}
          className="w-full py-2 text-[12px] font-semibold rounded-lg transition-all"
          style={{
            background: 'transparent',
            border: '1px dashed var(--brand-borderSoft)',
            color: 'var(--accent-gold)',
            cursor: 'pointer',
          }}
        >
          + Add another resource
        </button>

        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!actualDate || saving} onClick={save}>
            {saving ? 'Saving…' : `Add ${rows.length} resource${rows.length > 1 ? 's' : ''} to history`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DemoHistoryCard({ clientId, trainerId }: Props) {
  const [backfillOpen, setBackfillOpen] = useState(false);
  const path = clientId ? `/clients/${clientId}/demos` : `/trainers/${trainerId}/demos`;
  const { data } = useQuery({
    queryKey: ['demos', { clientId, trainerId }],
    queryFn: () => api.get(path).then((r) => r.data),
    enabled: !!(clientId || trainerId),
  });

  const demos = (data || []) as any[];
  const counts = {
    total: demos.length,
    done: demos.filter((d) => d.status === 'Done').length,
    cancelled: demos.filter((d) => d.status === 'Cancelled').length,
    scheduled: demos.filter((d) => d.status === 'Scheduled' || d.status === 'Rescheduled').length,
    positive: demos.filter((d) => d.outcome === 'Positive').length,
  };

  return (
    <div className="card">
      <div className="card-h">
        <span>Demo history</span>
        <span className="muted normal-case text-xs">
          {counts.total} total
          {counts.done > 0 && ` · ${counts.done} done`}
          {counts.cancelled > 0 && ` · ${counts.cancelled} cancelled`}
          {counts.scheduled > 0 && ` · ${counts.scheduled} upcoming`}
        </span>
        {clientId && (
          <Button size="sm" className="ml-auto" onClick={() => setBackfillOpen(true)} title="Log a demo that happened offline / before the portal">
            <Plus size={12}/> Add past demo
          </Button>
        )}
      </div>
      {backfillOpen && clientId && (
        <BackfillDemoModal clientId={clientId} onClose={() => setBackfillOpen(false)} />
      )}

      {demos.length === 0 ? (
        <div className="muted text-sm">No demos yet.</div>
      ) : (
        <div className="space-y-2 max-h-[420px] overflow-y-auto">
          {demos.map((d) => {
            const icon = d.status === 'Done'
              ? <CheckCircle2 size={14} className="text-brand-green" />
              : d.status === 'Cancelled'
              ? <XCircle size={14} className="text-brand-red" />
              : <CircleDot size={14} className="text-brand-amber" />;
            return (
              <div key={d.id} className="rounded-xl p-3 text-xs" style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}>
                <div className="flex items-center gap-2 flex-wrap">
                  {icon}
                  <strong className="text-sm">
                    {d.actualDate || d.scheduledDate || 'No date'}
                    {(d.actualTimeIst || d.scheduledTimeIst) && ` · ${d.actualTimeIst || d.scheduledTimeIst} IST`}
                  </strong>
                  <Pill color={d.status === 'Done' ? 'green' : d.status === 'Cancelled' ? 'red' : 'amber'}>
                    {d.status}
                  </Pill>
                  {d.outcome && (
                    <Pill color={d.outcome === 'Positive' ? 'green' : d.outcome === 'Negative' ? 'red' : 'amber'}>
                      {d.outcome}
                    </Pill>
                  )}
                </div>
                <div className="muted mt-1">
                  {clientId && d.trainer && (
                    <>
                      <strong>Trainer:</strong>{' '}
                      <Link to={`/trainers/${d.trainer.id}`} className="text-brand-blue hover:underline">
                        {d.trainer.name}
                      </Link>
                      {d.trainer.skills && <span className="ml-1">· {d.trainer.skills.split(',').slice(0, 3).join(', ')}</span>}
                    </>
                  )}
                  {trainerId && d.client && (
                    <>
                      <strong>Client:</strong>{' '}
                      <Link to={`/clients/${d.client.id}`} className="text-brand-blue hover:underline">
                        {d.client.name}
                      </Link>
                      {d.client.intakeSkillHint && <span className="ml-1">· {d.client.intakeSkillHint}</span>}
                    </>
                  )}
                  {d.conductedBy && (
                    <span> · conducted by {d.conductedBy.name}</span>
                  )}
                </div>
                {/* Per-trainer client decision badge */}
                {d.trainerOutcome && (() => {
                  const tc =
                    d.trainerOutcome === 'Selected'             ? '#22c55e' :
                    d.trainerOutcome === 'Shortlisted'          ? '#f59e0b' :
                    d.trainerOutcome === 'Rejected'             ? '#ef4444' :
                    d.trainerOutcome === 'PendingClientFeedback'? '#94a3b8' :
                    '#94a3b8';
                  const label =
                    d.trainerOutcome === 'PendingClientFeedback' ? 'Pending feedback' : d.trainerOutcome;
                  return (
                    <div className="mt-1.5">
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase"
                        style={{ background: tc + '22', color: tc, border: `1px solid ${tc}44` }}
                      >
                        {label}
                      </span>
                    </div>
                  );
                })()}
                {d.scheduledDate && d.actualDate && d.scheduledDate !== d.actualDate && (
                  <div className="muted text-[11px] mt-0.5">
                    Was scheduled for <Calendar size={10} className="inline-block"/> {d.scheduledDate} · rescheduled to {d.actualDate}
                  </div>
                )}
                {d.feedback && (
                  <div className="mt-1.5"><strong>Client feedback:</strong> <span className="muted">{d.feedback}</span></div>
                )}
                {d.nextSteps && (
                  <div className="mt-0.5"><strong>Next steps:</strong> <span className="muted">{d.nextSteps}</span></div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
