import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Select } from '@/components/ui/input';
import { useUI } from '@/store/ui';
import { EmptyState } from '@/components/EmptyState';
import { Receipt } from 'lucide-react';

const STATUSES = ['Pending', 'InvoiceSent', 'ReceiptSent', 'Booked', 'Done'];

export function AccountsQueuePage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const { data, isLoading } = useQuery({ queryKey: ['accounts-queue'], queryFn: () => api.get('/accounts-queue').then((r) => r.data) });
  const upd = useMutation({
    mutationFn: ({ id, status }: any) => api.patch(`/accounts-queue/${id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts-queue'] }); showToast('Updated'); },
    onError: () => showToast('Failed to update stage', 'error'),
  });

  if (isLoading) return <Page><div className="muted text-sm p-6">Loading...</div></Page>;

  return (
    <>
      <Topbar title="Accounts queue" subtitle={`${data?.length || 0}`} />
      <Page>
        <div className="table-card">
          <table>
            <thead><tr><th>Client</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {(data || []).length === 0 ? (
                <tr><td colSpan={3}>
                  <EmptyState
                    icon={Receipt}
                    tone="green"
                    title="Nothing in the accounts queue"
                    description="When payments come in, they show up here for booking + invoicing."
                  />
                </td></tr>
              ) :
              (data || []).map((q: any) => (
                <tr key={q.id} className="clickable">
                  <td>
                    <span className="font-semibold" style={{ color: 'var(--brand-text)' }}>{q.client.name}</span>
                  </td>
                  <td className="mono">{q.client.currency} {q.client.cycleAmount}</td>
                  <td>
                    <Select className="!w-auto !py-1 !text-xs" value={q.status} disabled={upd.isPending} onChange={(e) => upd.mutate({ id: q.id, status: e.target.value })}>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </Select>
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
