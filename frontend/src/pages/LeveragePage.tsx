import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { useUI } from '@/store/ui';
import { Pill } from '@/components/ui/pill';
import { Link } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import { EmptyState } from '@/components/EmptyState';
import { CheckCircle2 } from 'lucide-react';

export function LeveragePage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const user = useAuth((s) => s.user);
  const { data } = useQuery({ queryKey: ['leverage'], queryFn: () => api.get('/leverage').then((r) => r.data) });
  const decide = useMutation({
    mutationFn: ({ id, decision }: any) => api.post(`/leverage/${id}/decision`, { decision }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leverage'] }); qc.invalidateQueries({ queryKey: ['nav-badges'] }); showToast('Decided'); },
  });

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
                        <Button size="sm" variant="success" onClick={() => decide.mutate({ id: l.id, decision: 'Approved' })}>Approve</Button>
                        <Button size="sm" variant="danger" onClick={() => decide.mutate({ id: l.id, decision: 'Rejected' })}>Reject</Button>
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
    </>
  );
}
