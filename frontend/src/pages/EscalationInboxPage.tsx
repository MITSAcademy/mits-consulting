import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { useUI } from '@/store/ui';
import { AlertCircle, CheckCircle2, Calendar, User, Users } from 'lucide-react';

interface EscalationSession {
  scheduledFor: string;
  status: string;
}

interface Escalation {
  id: string;
  name: string;
  client: { id: string; name: string; lifecycle: string } | null;
  trainer: { id: string; name: string } | null;
  hostedByDefault: { id: string; name: string } | null;
  sessions: EscalationSession[];
}

function EscalationCard({ escalation, onResolved }: { escalation: Escalation; onResolved: () => void }) {
  const [resolving, setResolving] = useState(false);
  const [notes, setNotes] = useState('');
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();

  const resolve = useMutation({
    mutationFn: () => api.post(`/escalations/${escalation.id}/resolve`, { notes }),
    onSuccess: () => {
      showToast('Escalation resolved');
      qc.invalidateQueries({ queryKey: ['escalations'] });
      onResolved();
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed to resolve', 'error'),
  });

  const lastSession = escalation.sessions[0];

  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertCircle size={16} style={{ color: 'var(--status-red)', flexShrink: 0 }} />
          <div>
            <div className="font-semibold text-[14px]">{escalation.client?.name || 'Unknown client'}</div>
            <div className="text-[11px] muted capitalize mt-0.5">{escalation.client?.lifecycle}</div>
          </div>
        </div>
        {!resolving && (
          <Button variant="primary" onClick={() => setResolving(true)}>
            Resolve
          </Button>
        )}
      </div>

      {/* Details */}
      <div className="flex flex-wrap gap-4 text-[12px]">
        {escalation.trainer && (
          <div className="flex items-center gap-1.5" style={{ color: 'var(--brand-textSecondary)' }}>
            <User size={12} />
            <span>Trainer: <span className="font-medium" style={{ color: 'var(--brand-text)' }}>{escalation.trainer.name}</span></span>
          </div>
        )}
        {escalation.hostedByDefault && (
          <div className="flex items-center gap-1.5" style={{ color: 'var(--brand-textSecondary)' }}>
            <Users size={12} />
            <span>Host: <span className="font-medium" style={{ color: 'var(--brand-text)' }}>{escalation.hostedByDefault.name}</span></span>
          </div>
        )}
        {lastSession && (
          <div className="flex items-center gap-1.5" style={{ color: 'var(--brand-textSecondary)' }}>
            <Calendar size={12} />
            <span>Last session: <span className="font-medium" style={{ color: 'var(--brand-text)' }}>
              {new Date(lastSession.scheduledFor).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span></span>
          </div>
        )}
      </div>

      {/* Resolve form */}
      {resolving && (
        <div className="space-y-3 pt-1 border-t" style={{ borderColor: 'var(--brand-borderSoft)' }}>
          <div className="text-[12px] font-medium" style={{ color: 'var(--brand-textSecondary)' }}>Resolution notes (optional)</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe how this escalation was resolved…"
            rows={3}
            className="input w-full resize-none text-[13px]"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button onClick={() => { setResolving(false); setNotes(''); }}>Cancel</Button>
            <Button
              variant="primary"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate()}
            >
              {resolve.isPending ? 'Resolving…' : (
                <><CheckCircle2 size={13} className="mr-1" />Confirm resolve</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EscalationInboxPage() {
  const { data: escalations = [], isLoading } = useQuery<Escalation[]>({
    queryKey: ['escalations'],
    queryFn: () => api.get('/escalations').then((r) => r.data),
    refetchInterval: 60_000,
  });

  return (
    <>
      <Topbar
        title="Escalation Inbox"
        subtitle={escalations.length > 0 ? `${escalations.length} unresolved` : undefined}
      />
      <Page>
        <div className="callout">
          Trainings where a demo escalation has been requested. Review and resolve each case after taking action.
        </div>

        {isLoading ? (
          <div className="muted text-[13px] py-12 text-center">Loading escalations…</div>
        ) : escalations.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <CheckCircle2 size={32} style={{ color: 'var(--status-green)' }} />
            <div className="text-[15px] font-medium">All clear!</div>
            <div className="text-[13px] muted">No unresolved escalations.</div>
          </div>
        ) : (
          <div className="space-y-4">
            {escalations.map((e) => (
              <EscalationCard key={e.id} escalation={e} onResolved={() => {}} />
            ))}
          </div>
        )}
      </Page>
    </>
  );
}
