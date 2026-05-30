import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Pill } from '@/components/ui/pill';
import { Link } from 'react-router-dom';
import { Calendar, CheckCircle2, XCircle, CircleDot, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { useUI } from '@/store/ui';

interface Props {
  /** Use one or the other */
  clientId?: string;
  trainerId?: string;
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

function BackfillDemoModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [f, setF] = useState({
    trainerId: '',
    actualDate: todayISO(),
    actualTimeIst: '',
    outcome: 'Positive',
    feedback: '',
    nextSteps: '',
  });
  // Trainer pool for the dropdown.
  const { data: trainers } = useQuery<any[]>({
    queryKey: ['trainers'],
    queryFn: () => api.get('/trainers').then((r) => r.data),
  });
  const save = useMutation({
    mutationFn: () => api.post(`/clients/${clientId}/demos/backfill`, {
      ...f,
      trainerId: f.trainerId || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['demos', { clientId, trainerId: undefined }] });
      qc.invalidateQueries({ queryKey: ['client', clientId] });
      showToast('Past demo added to history');
      onClose();
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title="Add past demo"
        description="Log a demo that happened offline or before the portal was in use. This is recorded as a history entry — it doesn't change the client's current lifecycle."
        className="max-w-2xl"
      >
        <div className="grid md:grid-cols-2 gap-2.5">
          <div className="form-row">
            <Label>Actual date *</Label>
            <Input type="date" value={f.actualDate} onChange={(e) => setF({ ...f, actualDate: e.target.value })} />
          </div>
          <div className="form-row">
            <Label>Actual time (IST)</Label>
            <Input type="time" value={f.actualTimeIst} onChange={(e) => setF({ ...f, actualTimeIst: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <Label>Trainer (optional)</Label>
          <Select value={f.trainerId} onChange={(e) => setF({ ...f, trainerId: e.target.value })}>
            <option value="">— pick from pool —</option>
            {(trainers || []).map((t) => (
              <option key={t.id} value={t.id}>{t.name}{t.skills ? ` · ${t.skills.slice(0, 50)}` : ''}</option>
            ))}
          </Select>
        </div>
        <div className="form-row">
          <Label>Outcome</Label>
          <Select value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })}>
            <option value="Positive">Positive</option>
            <option value="Neutral">Neutral</option>
            <option value="Negative">Negative</option>
          </Select>
        </div>
        <div className="form-row">
          <Label>Feedback / what happened</Label>
          <Textarea rows={3} value={f.feedback} onChange={(e) => setF({ ...f, feedback: e.target.value })} placeholder="What did the client say? Any notable points?" />
        </div>
        <div className="form-row">
          <Label>Next steps (optional)</Label>
          <Textarea rows={2} value={f.nextSteps} onChange={(e) => setF({ ...f, nextSteps: e.target.value })} placeholder="Follow-ups, if any" />
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!f.actualDate || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Add to history'}
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
              <div key={d.id} className="bg-bg-input rounded p-3 text-xs">
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
                {d.scheduledDate && d.actualDate && d.scheduledDate !== d.actualDate && (
                  <div className="muted text-[11px] mt-0.5">
                    Was scheduled for <Calendar size={10} className="inline-block"/> {d.scheduledDate} · rescheduled to {d.actualDate}
                  </div>
                )}
                {d.feedback && (
                  <div className="mt-1.5"><strong>Feedback:</strong> <span className="muted">{d.feedback}</span></div>
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
