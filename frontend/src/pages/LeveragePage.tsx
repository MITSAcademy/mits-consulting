import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { useUI } from '@/store/ui';
import { Pill } from '@/components/ui/pill';
import { Link } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CheckCircle2 } from 'lucide-react';

export function LeveragePage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const user = useAuth((s) => s.user);
  const { data, isLoading } = useQuery({ queryKey: ['leverage'], queryFn: () => api.get('/leverage').then((r) => r.data) });
  const [confirm, setConfirm] = useState<{ id: string; decision: 'Approved' | 'Rejected'; clientName: string } | null>(null);

  const decide = useMutation({
    mutationFn: ({ id, decision }: any) => api.post(`/leverage/${id}/decision`, { decision }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leverage'] }); qc.invalidateQueries({ queryKey: ['nav-badges'] }); showToast('Decision recorded'); },
    onError: () => showToast('Failed to update', 'error'),
  });

  if (isLoading) return <Page><div className="muted text-sm p-6">Loading...</div></Page>;

  return (
    <>
      <Topbar title="Leverage requests" />
      <Page>
        <div className="callout">Auto-approved for ≤ 3 days. Anything longer needs Vaibhav.</div>
        {(data || []).length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            tone="green"
            title="No leverage requests"
            description="When a client asks for extra time beyond their committed date, the request appears here for approval."
          />
        ) : (
        <div className="table-card">
          <table>
            <thead><tr><th>Client</th><th>Days</th><th>Reason</th><th>New committed</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(data || []).map((l: any) => (
                <tr key={l.id} className="clickable">
                  <td><Link to={`/clients/${l.client.id}`} className="font-medium hover:underline">{l.client.name}</Link></td>
                  <td className="mono">{l.daysRequested}d</td>
                  <td className="text-[12px] muted">{l.reasonStated}</td>
                  <td className="mono text-[12px]">{l.newCommittedDate || '—'}</td>
                  <td><Pill color={l.status === 'Approved' || l.status === 'AutoApproved' ? 'green' : l.status === 'Rejected' ? 'red' : 'amber'}>{l.status}</Pill></td>
                  <td>
                    {l.status === 'PendingVaibhav' && user?.role === 'founder' && (
                      <div className="space-x-1">
                        <Button size="sm" variant="success" disabled={decide.isPending} onClick={() => setConfirm({ id: l.id, decision: 'Approved', clientName: l.client.name })}>Approve</Button>
                        <Button size="sm" variant="danger" disabled={decide.isPending} onClick={() => setConfirm({ id: l.id, decision: 'Rejected', clientName: l.client.name })}>Reject</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Page>
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => { decide.mutate({ id: confirm!.id, decision: confirm!.decision }); setConfirm(null); }}
        title={confirm?.decision === 'Approved' ? `Approve leverage for ${confirm?.clientName}?` : `Reject leverage for ${confirm?.clientName}?`}
        description={confirm?.decision === 'Approved'
          ? 'This grants the client extra time beyond their committed payment date.'
          : 'This rejects the request. The client will not receive the extra time they asked for.'}
        confirmLabel={confirm?.decision === 'Approved' ? 'Approve' : 'Reject'}
        confirmVariant={confirm?.decision === 'Approved' ? 'success' : 'danger'}
        loading={decide.isPending}
      />
    </>
  );
}
