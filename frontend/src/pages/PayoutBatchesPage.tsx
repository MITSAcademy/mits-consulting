import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { useUI } from '@/store/ui';
import { Pill } from '@/components/ui/pill';

export function PayoutBatchesPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const { data } = useQuery({ queryKey: ['payouts'], queryFn: () => api.get('/payouts').then((r) => r.data) });
  const approve = useMutation({ mutationFn: (id: string) => api.post(`/payouts/${id}/approve`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['payouts'] }); showToast('Approved'); } });
  const pay = useMutation({ mutationFn: (id: string) => api.post(`/payouts/${id}/pay`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['payouts'] }); showToast('Paid'); } });

  return (
    <>
      <Topbar title="Payout batches" subtitle={`${data?.length || 0}`} />
      <Page>
        <div className="table-card">
          <table>
            <thead><tr><th>Week</th><th>Sessions</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {(data || []).length === 0 ? <tr><td colSpan={5} className="text-center py-8 muted">No batches.</td></tr> :
              (data || []).map((b: any) => (
                <tr key={b.id}>
                  <td className="mono">{b.weekStart}</td>
                  <td className="mono">{b.sessionIds.length}</td>
                  <td className="mono">₹{b.totalInr.toLocaleString()}</td>
                  <td><Pill color={b.status === 'Paid' ? 'green' : b.status === 'Approved' ? 'blue' : 'amber'}>{b.status}</Pill></td>
                  <td className="space-x-1">
                    {b.status === 'Pending' && <Button size="sm" variant="success" onClick={() => approve.mutate(b.id)}>Approve</Button>}
                    {b.status === 'Approved' && <Button size="sm" variant="primary" onClick={() => pay.mutate(b.id)}>Mark paid</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Page>
    </>
  );
}
