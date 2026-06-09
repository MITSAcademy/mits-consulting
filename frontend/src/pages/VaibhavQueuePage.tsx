import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useUI } from '@/store/ui';
import { Pill } from '@/components/ui/pill';
import { EmptyState } from '@/components/EmptyState';
import { CheckCircle2, Send } from 'lucide-react';

function BriefingTrigger() {
  const showToast = useUI((s) => s.showToast);

  const trigger = useMutation({
    mutationFn: ({ team, shift }: { team: string; shift: string }) =>
      api.post('/briefing/trigger', { team, shift }),
    onSuccess: (_r, { team }) => showToast(`${team === 'team1' ? 'Team 1 (Aman/Kanchan)' : 'Team 2 (Anjali/Taran)'} briefing sent`),
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed to send briefing', 'error'),
  });

  const sending = trigger.isPending;

  return (
    <div className="card mb-4">
      <div className="card-h mb-3">
        <Send size={14} />
        <span className="font-bold">Send status briefing</span>
        <span className="muted text-xs">Trigger on-demand email to any team</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--brand-borderSoft)' }}>
          <div className="text-xs font-semibold mb-1">Team 1 · Recruiters</div>
          <div className="text-[11px] muted mb-2">Aman & Kanchan — sourcing pipeline</div>
          <div className="flex gap-2">
            <Button size="sm" disabled={sending} onClick={() => trigger.mutate({ team: 'team1', shift: 'morning' })}>Morning</Button>
            <Button size="sm" disabled={sending} onClick={() => trigger.mutate({ team: 'team1', shift: 'evening' })}>Evening</Button>
          </div>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--brand-borderSoft)' }}>
          <div className="text-xs font-semibold mb-1">Team 2 · Demo intake</div>
          <div className="text-[11px] muted mb-2">Anjali & Taran — demo pipeline</div>
          <div className="flex gap-2">
            <Button size="sm" disabled={sending} onClick={() => trigger.mutate({ team: 'team2', shift: 'morning' })}>Morning</Button>
            <Button size="sm" disabled={sending} onClick={() => trigger.mutate({ team: 'team2', shift: 'evening' })}>Evening</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function VaibhavQueuePage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const { data } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get('/clients').then((r) => r.data),
  });
  const pending = (data || []).filter((c: any) => c.paymentPendingVaibhav);

  const unflag = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/clients/${id}`, { paymentPendingVaibhav: false, pendingVaibhavSince: null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['metrics/home'] });
      qc.invalidateQueries({ queryKey: ['nav-badges'] });
      showToast('Unflagged');
    },
  });

  return (
    <>
      <Topbar title="Pending on Vaibhav" subtitle={`${pending.length}`} />
      <Page>
        <BriefingTrigger />
        <div className="callout gold">
          Clients flagged for Vaibhav to personally chase. Click a row to open, or unflag inline.
        </div>
        {pending.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            tone="green"
            title="Queue is clear"
            description="Nothing waiting on you right now. Nice work."
          />
        ) : (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Engagement</th>
                  <th>Amount</th>
                  <th>Source</th>
                  <th>Bank</th>
                  <th>Since</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((c: any) => (
                  <tr key={c.id} className="clickable">
                    <td>
                      <Link to={`/clients/${c.id}`} className="font-medium">
                        {c.name}
                      </Link>
                    </td>
                    <td>
                      <Pill color={c.engagementType === 'Training' ? 'purple' : 'grey'}>
                        {c.engagementType}
                      </Pill>
                    </td>
                    <td className="mono">
                      {c.currency} {c.cycleAmount}
                    </td>
                    <td>{c.source || '—'}</td>
                    <td>
                      <Pill>{c.bankAccount?.label || '—'}</Pill>
                    </td>
                    <td className="mono text-brand-amber">{c.pendingVaibhavSince || '—'}</td>
                    <td>
                      <Button size="sm" onClick={() => unflag.mutate(c.id)}>
                        Unflag
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Page>
    </>
  );
}
