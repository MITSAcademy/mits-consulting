import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUI } from '@/store/ui';
import { Pill } from '@/components/ui/pill';

export function RawLeadsPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const { data } = useQuery({ queryKey: ['raw-leads'], queryFn: () => api.get('/raw-leads').then((r) => r.data) });

  const upd = useMutation({
    mutationFn: ({ id, ...rest }: any) => api.patch(`/raw-leads/${id}`, rest),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['raw-leads'] }),
  });
  const promote = useMutation({
    mutationFn: (id: string) => api.post(`/raw-leads/${id}/promote`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['raw-leads'] }); qc.invalidateQueries({ queryKey: ['clients'] }); showToast('Promoted to client'); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <>
      <Topbar title="Raw leads inbox" subtitle={`${data?.length || 0}`} />
      <Page>
        <div className="callout">Clean each row (name, phone, skill) then promote to a Client.</div>
        <div className="table-card">
          <table>
            <thead><tr><th>Raw</th><th>Name</th><th>Phone</th><th>Skill</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(data || []).length === 0 ? <tr><td colSpan={6} className="text-center py-8 muted">Inbox empty.</td></tr> :
              (data || []).map((r: any) => (
                <tr key={r.id}>
                  <td className="text-xs muted max-w-[200px] truncate" title={r.raw}>{r.raw}</td>
                  <td><Input defaultValue={r.cleanedName || ''} onBlur={(e) => upd.mutate({ id: r.id, cleanedName: e.target.value })} /></td>
                  <td><Input defaultValue={r.cleanedPhone || ''} onBlur={(e) => upd.mutate({ id: r.id, cleanedPhone: e.target.value })} /></td>
                  <td><Input defaultValue={r.cleanedSkill || ''} onBlur={(e) => upd.mutate({ id: r.id, cleanedSkill: e.target.value })} /></td>
                  <td><Pill color={r.status === 'Processed' ? 'green' : 'amber'}>{r.status}</Pill></td>
                  <td>{r.status === 'Pending' && <Button size="sm" variant="primary" onClick={() => promote.mutate(r.id)}>Promote</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Page>
    </>
  );
}
