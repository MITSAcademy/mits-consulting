import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { useUI } from '@/store/ui';
import { Pill } from '@/components/ui/pill';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Wallet } from 'lucide-react';

export function PayoutBatchesPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const { data, isLoading } = useQuery({ queryKey: ['payouts'], queryFn: () => api.get('/payouts').then((r) => r.data) });
  const [payConfirm, setPayConfirm] = useState<string | null>(null);

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/payouts/${id}/approve`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payouts'] }); showToast('Batch approved'); },
    onError: () => showToast('Failed to approve', 'error'),
  });
  const pay = useMutation({
    mutationFn: (id: string) => api.post(`/payouts/${id}/pay`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payouts'] }); showToast('Marked as paid'); },
    onError: () => showToast('Failed to mark paid', 'error'),
  });

  const payingBatch = payConfirm ? (data || []).find((b: any) => b.id === payConfirm) : null;

  return (
    <>
      <Topbar title="Payout batches" subtitle={`${data?.length || 0}`} />
      <Page>
        {isLoading && <div className="muted text-sm p-6">Loading...</div>}
        {(data || []).length === 0 ? (
          <EmptyState
            icon={Wallet}
            tone="grey"
            title="No payout batches yet"
            description='Create a batch from the Trainer Payouts page by selecting sessions and clicking "Create batch".'
          />
        ) : (
        <div className="table-card">
          <table>
            <thead><tr><th>Week</th><th>Sessions</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {(data || []).map((b: any) => (
                <tr key={b.id} className="clickable">
                  <td className="mono">{b.weekStart}</td>
                  <td className="mono">{b.sessionIds.length}</td>
                  <td className="mono font-semibold">₹{b.totalInr.toLocaleString()}</td>
                  <td><Pill color={b.status === 'Paid' ? 'green' : b.status === 'Approved' ? 'blue' : 'amber'}>{b.status}</Pill></td>
                  <td className="space-x-1">
                    {b.status === 'Pending' && <Button size="sm" variant="success" disabled={approve.isPending || pay.isPending} onClick={() => approve.mutate(b.id)}>Approve</Button>}
                    {b.status === 'Approved' && <Button size="sm" variant="primary" disabled={approve.isPending || pay.isPending} onClick={() => setPayConfirm(b.id)}>Mark paid</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Page>
      <ConfirmDialog
        open={!!payConfirm}
        onClose={() => setPayConfirm(null)}
        onConfirm={() => { pay.mutate(payConfirm!); setPayConfirm(null); }}
        title="Mark batch as paid?"
        description={payingBatch ? `This will record ₹${payingBatch.totalInr.toLocaleString()} as paid for ${payingBatch.sessionIds.length} sessions (week of ${payingBatch.weekStart}). This cannot be undone.` : 'This action cannot be undone.'}
        confirmLabel="Mark paid"
        confirmVariant="primary"
        loading={pay.isPending}
      />
    </>
  );
}
