import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Pill } from '@/components/ui/pill';
import { Link } from 'react-router-dom';
import { Calendar, CheckCircle2, XCircle, CircleDot } from 'lucide-react';

interface Props {
  /** Use one or the other */
  clientId?: string;
  trainerId?: string;
}

export function DemoHistoryCard({ clientId, trainerId }: Props) {
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
      </div>

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
