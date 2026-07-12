import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { useUI } from '@/store/ui';
import { Pill } from '@/components/ui/pill';
import { EmptyState } from '@/components/EmptyState';
import { ClipboardCheck } from 'lucide-react';

export function EditRequestsPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const { data, isLoading } = useQuery({ queryKey: ['edit-requests'], queryFn: () => api.get('/edit-requests').then((r) => r.data) });

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/edit-requests/${id}/approve`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['edit-requests'] }); qc.invalidateQueries({ queryKey: ['nav-badges'] }); showToast('Approved'); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  const reject = useMutation({
    mutationFn: (id: string) => api.post(`/edit-requests/${id}/reject`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['edit-requests'] }); qc.invalidateQueries({ queryKey: ['nav-badges'] }); showToast('Rejected'); },
    onError: () => showToast('Failed to reject request', 'error'),
  });

  return (
    <>
      <Topbar title="Edit requests" subtitle={`${data?.length || 0}`} />
      <Page>
        {isLoading && <div className="muted text-sm p-6">Loading...</div>}
        {(data || []).length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            tone="green"
            title="No edit requests pending"
            description="When team members propose changes to client or trainer records, they appear here for approval."
          />
        ) : (
        <div className="table-card">
          <table>
            <thead><tr><th>Entity</th><th>Field</th><th>Old</th><th>New</th><th>By</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(data || []).map((r: any) => (
                <tr key={r.id} className="clickable">
                  <td className="font-medium">{r.entity} <span className="muted text-[11px]">{r.entityId.slice(0, 8)}</span></td>
                  <td className="mono text-[11px]">{r.field}</td>
                  <td className="text-[12px] muted">{r.oldValue || '—'}</td>
                  <td className="text-[12px]">{r.newValue || '—'}</td>
                  <td className="text-[12px]">{r.requestedBy?.name || '—'}</td>
                  <td><Pill color={r.status === 'Approved' ? 'green' : r.status === 'Rejected' ? 'red' : 'amber'}>{r.status}</Pill></td>
                  <td>
                    {r.status === 'Pending' && (
                      <div className="space-x-1">
                        <Button size="sm" variant="success" disabled={approve.isPending || reject.isPending} onClick={() => approve.mutate(r.id)}>Approve</Button>
                        <Button size="sm" variant="danger" disabled={approve.isPending || reject.isPending} onClick={() => reject.mutate(r.id)}>Reject</Button>
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
