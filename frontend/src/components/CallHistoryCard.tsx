/**
 * Call history card for the client detail page.
 *
 * Shows the last N calls logged against a client, plus a small "Log call"
 * button so check-ins can be added right from the client page. The card
 * collapses to "No calls yet" when empty.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import { useUI } from '@/store/ui';
import { Phone } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input, Select, Textarea, Label } from '@/components/ui/input';

interface CallRow {
  id: string;
  kind: string;
  activityType: string | null;
  outcome: string | null;
  sessionTookPlace: boolean | null;
  cancellationReason: string | null;
  durationMinutes: number | null;
  notes: string | null;
  feedback: string | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'missed' | string;
  scheduledFor: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  calledAt: string;
  by: { id: string; name: string };
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function CallHistoryCard({ clientId, role }: { clientId: string; role?: string }) {
  const { data, isLoading } = useQuery<CallRow[]>({
    queryKey: ['call-logs', { clientId }],
    queryFn: () => api.get('/call-logs', { params: { clientId, limit: 20 } }).then((r) => r.data),
  });

  return (
    <div className="card">
      <div className="card-h">
        <span>Call history{(data || []).length > 0 ? ` · ${(data || []).length}` : ''}</span>
        <LogCallInline clientId={clientId} role={role} />
      </div>
      {isLoading ? (
        <div className="muted text-sm">Loading…</div>
      ) : (data || []).length === 0 ? (
        <div className="muted text-sm">No calls logged for this client yet.</div>
      ) : (
        <div className="space-y-1.5">
          {(data || []).map((c) => {
            const statusTone =
              c.status === 'scheduled' ? 'amber' :
              c.status === 'in_progress' ? 'green' :
              c.status === 'missed' ? 'red' : null;
            return (
              <div
                key={c.id}
                className="rounded p-2 text-[12px]"
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--brand-borderSoft)',
                  ...(statusTone ? { borderLeft: `3px solid ${statusTone === 'amber' ? 'var(--status-amber)' : statusTone === 'green' ? 'var(--status-green)' : 'var(--status-red)'}` } : {}),
                }}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  {c.activityType ? (
                    <Pill color={c.activityType === 'training' ? 'blue' : 'purple'}>
                      {c.activityType === 'training' ? 'Training' : 'Session'}
                    </Pill>
                  ) : (
                    <Pill color={c.kind === 'feedback' ? 'blue' : c.kind === 'leverage' ? 'purple' : c.kind === 'escalation' ? 'red' : 'grey'}>
                      {c.kind}
                    </Pill>
                  )}
                  {statusTone && <Pill color={statusTone as any}>{c.status}</Pill>}
                  {c.sessionTookPlace === false && <Pill color="red">Not conducted</Pill>}
                  {c.sessionTookPlace === true && <Pill color="green">Conducted</Pill>}
                  {c.outcome && <span className="muted">· {c.outcome}</span>}
                  {c.durationMinutes != null && <span className="muted">· {c.durationMinutes}min</span>}
                  <span className="muted ml-auto">{c.by.name} · {timeAgo(c.actualEndAt || c.actualStartAt || c.scheduledFor || c.calledAt)}</span>
                </div>
                {c.scheduledFor && c.status === 'scheduled' && (
                  <div className="mt-1 text-[11px] muted">
                    Scheduled for {new Date(c.scheduledFor).toLocaleString()}
                  </div>
                )}
                {c.cancellationReason && (
                  <div className="mt-1 text-[11.5px] leading-snug" style={{ color: 'var(--status-red)' }}>
                    <span className="font-semibold">Reason:</span> {c.cancellationReason}
                  </div>
                )}
                {c.feedback && (
                  <div className="mt-1 text-[11.5px] leading-snug" style={{ color: 'var(--brand-text)' }}>
                    <span className="muted">Feedback:</span> {c.feedback}
                  </div>
                )}
                {c.notes && c.notes !== c.feedback && (
                  <div className="mt-1 text-[11.5px] muted leading-snug">{c.notes}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type LogForm = {
  kind: string;
  activityType: string;
  outcome: string;
  sessionTookPlace: '' | 'yes' | 'no';
  durationMinutes: string;
  cancellationReason: string;
  notes: string;
};

const DEFAULT_FORM: LogForm = {
  kind: 'checkin',
  activityType: '',
  outcome: '',
  sessionTookPlace: '',
  durationMinutes: '',
  cancellationReason: '',
  notes: '',
};

function LogCallInline({ clientId, role }: { clientId: string; role?: string }) {
  const hideSessionTypes = role === 'account_manager' || role === 'lead';
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<LogForm>(DEFAULT_FORM);

  const patch = (p: Partial<LogForm>) => setForm((f) => ({ ...f, ...p }));

  const isActivityLog = form.activityType === 'training' || form.activityType === 'session';
  const sessionDidNotTakePlace = form.sessionTookPlace === 'no';
  const sessionTookPlace = form.sessionTookPlace === 'yes' ? true : form.sessionTookPlace === 'no' ? false : null;

  // Duration hint: training ~70-80 min, session = user-entered
  const durationPlaceholder = form.activityType === 'training' ? 'e.g. 75 (standard ~70–80 min)' : 'Enter actual duration in minutes';

  const canSubmit = isActivityLog
    ? (form.sessionTookPlace !== '' &&
        (sessionTookPlace === true ? !!form.durationMinutes : !!form.cancellationReason))
    : true;

  const create = useMutation({
    mutationFn: () => {
      const payload: any = {
        clientId,
        kind: isActivityLog ? form.activityType : form.kind,
        activityType: form.activityType || null,
        outcome: form.outcome || null,
        notes: form.notes || null,
      };
      if (isActivityLog) {
        payload.sessionTookPlace = sessionTookPlace;
        if (sessionTookPlace === true && form.durationMinutes) {
          payload.durationMinutes = Number(form.durationMinutes);
        }
        if (sessionTookPlace === false) {
          payload.cancellationReason = form.cancellationReason;
          payload.durationMinutes = 0;
        }
      }
      return api.post('/call-logs', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['call-logs', { clientId }] });
      qc.invalidateQueries({ queryKey: ['follow-up-payments'] });
      showToast('Activity logged');
      setOpen(false);
      setForm(DEFAULT_FORM);
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(DEFAULT_FORM); }}>
      <DialogTrigger asChild>
        <Button size="sm" title="Log a call or activity for this client">
          <Phone size={11}/> Log activity
        </Button>
      </DialogTrigger>
      <DialogContent title="Log activity" description="Log a call, training, or session for this client.">

        {/* Activity Type */}
        <div className="form-row">
          <Label>Activity type *</Label>
          <Select value={form.activityType} onChange={(e) => patch({ activityType: e.target.value, sessionTookPlace: '', durationMinutes: '', cancellationReason: '' })}>
            <option value="">— select type —</option>
            {!hideSessionTypes && <option value="training">Training</option>}
            {!hideSessionTypes && <option value="session">Session</option>}
            {!hideSessionTypes && <option value="">─────</option>}
            <option value="__call__">Call / Check-in</option>
          </Select>
        </div>

        {/* Call fields (non-activity) */}
        {!isActivityLog && (
          <div className="grid md:grid-cols-2 gap-2">
            <div className="form-row">
              <Label>Kind</Label>
              <Select value={form.kind} onChange={(e) => patch({ kind: e.target.value })}>
                <option value="checkin">Check-in</option>
                <option value="feedback">Feedback</option>
                <option value="leverage">Leverage / referral ask</option>
                <option value="escalation">Escalation</option>
              </Select>
            </div>
            <div className="form-row">
              <Label>Outcome</Label>
              <Select value={form.outcome} onChange={(e) => patch({ outcome: e.target.value })}>
                <option value="">—</option>
                <option value="answered">Answered</option>
                <option value="no_pickup">No pickup</option>
                <option value="rescheduled">Rescheduled</option>
                <option value="completed">Completed</option>
                <option value="escalated">Escalated</option>
              </Select>
            </div>
          </div>
        )}

        {/* Training / Session fields */}
        {isActivityLog && (
          <>
            {/* Did session take place? */}
            <div className="form-row">
              <Label>Did the {form.activityType} take place on the scheduled date? *</Label>
              <div className="flex gap-3 mt-1">
                {(['yes', 'no'] as const).map((v) => (
                  <label
                    key={v}
                    className="flex items-center gap-1.5 cursor-pointer text-sm font-medium"
                    style={{ color: form.sessionTookPlace === v ? (v === 'yes' ? 'var(--status-green)' : 'var(--status-red)') : 'var(--brand-textMuted)' }}
                  >
                    <input
                      type="radio"
                      name="sessionTookPlace"
                      value={v}
                      checked={form.sessionTookPlace === v}
                      onChange={() => patch({ sessionTookPlace: v, durationMinutes: '', cancellationReason: '' })}
                      style={{ accentColor: v === 'yes' ? 'var(--status-green)' : 'var(--status-red)' }}
                    />
                    {v === 'yes' ? 'Yes' : 'No'}
                  </label>
                ))}
              </div>
            </div>

            {/* If YES: duration */}
            {form.sessionTookPlace === 'yes' && (
              <div className="form-row">
                <Label>
                  Duration (minutes) *
                  {form.activityType === 'training' && (
                    <span className="ml-1.5 text-[11px] font-normal" style={{ color: 'var(--brand-textMuted)' }}>
                      standard training: ~70–80 min
                    </span>
                  )}
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={480}
                  value={form.durationMinutes}
                  onChange={(e) => patch({ durationMinutes: e.target.value })}
                  placeholder={durationPlaceholder}
                />
              </div>
            )}

            {/* If NO: cancellation reason */}
            {sessionDidNotTakePlace && (
              <div className="form-row">
                <Label>Reason for non-conduct *</Label>
                <Textarea
                  rows={2}
                  value={form.cancellationReason}
                  onChange={(e) => patch({ cancellationReason: e.target.value })}
                  placeholder="e.g. Client cancelled last minute, trainer unavailable, technical issues…"
                />
              </div>
            )}
          </>
        )}

        {/* Notes — always visible */}
        <div className="form-row">
          <Label>Notes {isActivityLog ? '(optional)' : ''}</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="Any additional notes or context." />
        </div>

        <DialogFooter>
          <Button onClick={() => { setOpen(false); setForm(DEFAULT_FORM); }}>Cancel</Button>
          <Button variant="primary" disabled={create.isPending || !canSubmit} onClick={() => create.mutate()}>
            {create.isPending ? 'Saving…' : 'Log activity'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
