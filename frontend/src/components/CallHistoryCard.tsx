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
import { Select, Textarea, Label } from '@/components/ui/input';

interface CallRow {
  id: string;
  kind: string;
  outcome: string | null;
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

export function CallHistoryCard({ clientId }: { clientId: string }) {
  const { data, isLoading } = useQuery<CallRow[]>({
    queryKey: ['call-logs', { clientId }],
    queryFn: () => api.get('/call-logs', { params: { clientId, limit: 20 } }).then((r) => r.data),
  });

  return (
    <div className="card">
      <div className="card-h">
        <span>Call history{(data || []).length > 0 ? ` · ${(data || []).length}` : ''}</span>
        <LogCallInline clientId={clientId} />
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
                  <Pill color={c.kind === 'feedback' ? 'blue' : c.kind === 'leverage' ? 'purple' : c.kind === 'escalation' ? 'red' : 'grey'}>
                    {c.kind}
                  </Pill>
                  {statusTone && <Pill color={statusTone as any}>{c.status}</Pill>}
                  {c.outcome && <span className="muted">· {c.outcome}</span>}
                  {c.durationMinutes != null && <span className="muted">· {c.durationMinutes}min</span>}
                  <span className="muted ml-auto">{c.by.name} · {timeAgo(c.actualEndAt || c.actualStartAt || c.scheduledFor || c.calledAt)}</span>
                </div>
                {c.scheduledFor && c.status === 'scheduled' && (
                  <div className="mt-1 text-[11px] muted">
                    Scheduled for {new Date(c.scheduledFor).toLocaleString()}
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

function LogCallInline({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ kind: 'checkin', outcome: '', notes: '' });

  const create = useMutation({
    mutationFn: () =>
      api.post('/call-logs', { clientId, ...form, outcome: form.outcome || null, notes: form.notes || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['call-logs', { clientId }] });
      qc.invalidateQueries({ queryKey: ['follow-up-payments'] });
      showToast('Call logged');
      setOpen(false);
      setForm({ kind: 'checkin', outcome: '', notes: '' });
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" title="Log a call to this client">
          <Phone size={11}/> Log call
        </Button>
      </DialogTrigger>
      <DialogContent title="Log a call" description="Saved to call history, visible to the team.">
        <div className="grid md:grid-cols-2 gap-2">
          <div className="form-row">
            <Label>Kind</Label>
            <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="checkin">Check-in</option>
              <option value="feedback">Feedback</option>
              <option value="leverage">Leverage / referral ask</option>
              <option value="escalation">Escalation</option>
            </Select>
          </div>
          <div className="form-row">
            <Label>Outcome</Label>
            <Select value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })}>
              <option value="">—</option>
              <option value="answered">Answered</option>
              <option value="no_pickup">No pickup</option>
              <option value="rescheduled">Rescheduled</option>
              <option value="completed">Completed</option>
              <option value="escalated">Escalated</option>
            </Select>
          </div>
        </div>
        <div className="form-row">
          <Label>Notes</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="What was discussed, any follow-up needed." />
        </div>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Saving…' : 'Log call'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
