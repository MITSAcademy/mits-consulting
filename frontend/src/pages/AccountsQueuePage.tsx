import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Select } from '@/components/ui/input';
import { useUI } from '@/store/ui';
import { Pill } from '@/components/ui/pill';

const STATUSES = ['Pending', 'InvoiceSent', 'ReceiptSent', 'Booked', 'Done'];

export function AccountsQueuePage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const { data } = useQuery({ queryKey: ['accounts-queue'], queryFn: () => api.get('/accounts-queue').then((r) => r.data) });
  const upd = useMutation({
    mutationFn: ({ id, status }: any) => api.patch(`/accounts-queue/${id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts-queue'] }); showToast('Updated'); },
  });

  return (
    <>
      <Topbar title="Accounts queue" subtitle={`${data?.length || 0}`} />
      <Page>
        <div className="table-card">
          <table>
            <thead><tr><th>Client</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {(data || []).length === 0 ? <tr><td colSpan={3} className="text-center py-8 muted">No items in queue.</td></tr> :
              (data || []).map((q: any) => (
                <tr key={q.id}>
                  <td>{q.client.name}</td>
                  <td className="mono">{q.client.currency} {q.client.cycleAmount}</td>
                  <td>
                    <Select className="!w-auto !py-1 !text-xs" value={q.status} onChange={(e) => upd.mutate({ id: q.id, status: e.target.value })}>
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
