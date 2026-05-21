import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Link } from 'react-router-dom';
import { Pill } from '@/components/ui/pill';
import { MessageCircle } from 'lucide-react';

/**
 * Samita's queue — clients sitting in `FeedbackPending` after their demo finished.
 * From here Samita clicks into each client and records Positive / Negative / NeedTime.
 */
export function FeedbackPendingPage() {
  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get('/clients').then((r) => r.data),
  });

  const pending = ((clients || []) as any[]).filter((c) => c.lifecycle === 'FeedbackPending');
  // Also surface DemoDone clients in case the auto-handoff was skipped (e.g. seed data)
  const stuck = ((clients || []) as any[]).filter((c) => c.lifecycle === 'DemoDone');

  function row(c: any) {
    return (
      <div key={c.id} className="bg-bg-input rounded p-3">
        <div className="flex justify-between items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link to={`/clients/${c.id}`} className="font-semibold text-sm hover:underline">{c.name}</Link>
              {c.primaryTrainer && <Pill>Trainer: {c.primaryTrainer.name}</Pill>}
              {c.demoActualDate && <span className="text-xs muted">demo done {c.demoActualDate}</span>}
            </div>
            <div className="text-xs muted mt-0.5">
              {c.intakeOwner && <>Intake: <strong>{c.intakeOwner.name}</strong> · </>}
              {c.demoOutcome && <>Anjali noted: <strong>{c.demoOutcome}</strong> · </>}
              {c.demoFeedback && <>Notes: <em>{c.demoFeedback.slice(0, 80)}{c.demoFeedback.length > 80 ? '…' : ''}</em></>}
            </div>
          </div>
          <Link to={`/clients/${c.id}`} className="btn btn-sm btn-primary">
            <MessageCircle size={12}/> Take feedback →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Topbar
        title="Feedback queue · Samita"
        subtitle={`${pending.length} awaiting Samita's feedback${stuck.length ? ` · ${stuck.length} still in DemoDone (legacy)` : ''}`}
      />
      <Page>
        <div className="callout">
          After Anjali marks a demo as <em>done</em>, the client lands here for Samita to record the client's post-demo response.
          The feedback choice auto-routes the client: <strong>Positive → Roshni · Negative → recruiters · Need time → Hold (3-day reminder)</strong>.
        </div>

        {pending.length === 0 && stuck.length === 0 && (
          <div className="text-center py-12 muted">
            <MessageCircle size={32} className="inline-block mb-2 opacity-50"/>
            <div className="text-base font-semibold text-brand-text mb-1">No demos awaiting feedback ✓</div>
            <div>Samita's queue is clear.</div>
          </div>
        )}

        {pending.length > 0 && (
          <div className="card mb-3" style={{ borderColor: '#F59E0B' }}>
            <div className="card-h" style={{ color: '#F59E0B' }}>
              <span>Awaiting feedback</span>
              <Pill color="amber">{pending.length}</Pill>
            </div>
            <div className="space-y-2">{pending.map(row)}</div>
          </div>
        )}

        {stuck.length > 0 && (
          <div className="card">
            <div className="card-h">
              <span>Still in DemoDone (older data)</span>
              <Pill>{stuck.length}</Pill>
            </div>
            <div className="text-xs muted mb-2">
              These demos finished before the FeedbackPending stage existed (or auto-handoff was skipped). You can still record feedback on each — opens the same modal.
            </div>
            <div className="space-y-2">{stuck.map(row)}</div>
          </div>
        )}
      </Page>
    </>
  );
}
