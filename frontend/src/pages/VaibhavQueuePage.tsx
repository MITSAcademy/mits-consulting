import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useUI } from '@/store/ui';
import { Pill } from '@/components/ui/pill';

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
        <div className="callout">
          Clients flagged for Vaibhav to personally chase. Click a row to open, or unflag inline.
        </div>
        {pending.length === 0 ? (
          <div className="text-center py-12 muted">
            <div className="text-base font-semibold text-brand-text mb-1">Queue is clear.</div>
          </div>
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
