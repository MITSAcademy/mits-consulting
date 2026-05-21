import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { useUI } from '@/store/ui';
import { Pill } from '@/components/ui/pill';

export function EditRequestsPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const { data } = useQuery({ queryKey: ['edit-requests'], queryFn: () => api.get('/edit-requests').then((r) => r.data) });

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/edit-requests/${id}/approve`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['edit-requests'] }); qc.invalidateQueries({ queryKey: ['nav-badges'] }); showToast('Approved'); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });
  const reject = useMutation({
    mutationFn: (id: string) => api.post(`/edit-requests/${id}/reject`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['edit-requests'] }); qc.invalidateQueries({ queryKey: ['nav-badges'] }); showToast('Rejected'); },
  });

  return (
    <>
      <Topbar title="Edit requests" subtitle={`${data?.length || 0}`} />
      <Page>
        <div className="table-card">
          <table>
            <thead><tr><th>Entity</th><th>Field</th><th>Old</th><th>New</th><th>By</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(data || []).length === 0 ? <tr><td colSpan={7} className="text-center py-8 muted">No edit requests.</td></tr> :
              (data || []).map((r: any) => (
                <tr key={r.id}>
                  <td>{r.entity} <span className="muted text-xs">{r.entityId.slice(0, 8)}</span></td>
                  <td className="mono text-xs">{r.field}</td>
                  <td className="text-xs muted">{r.oldValue || '—'}</td>
                  <td className="text-xs">{r.newValue || '—'}</td>
                  <td>{r.requestedBy?.name || '—'}</td>
                  <td><Pill color={r.status === 'Approved' ? 'green' : r.status === 'Rejected' ? 'red' : 'amber'}>{r.status}</Pill></td>
                  <td>
                    {r.status === 'Pending' && (
                      <div className="space-x-1">
                        <Button size="sm" variant="success" onClick={() => approve.mutate(r.id)}>Approve</Button>
                        <Button size="sm" variant="danger" onClick={() => reject.mutate(r.id)}>Reject</Button>
                      </div>
                    )}
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
