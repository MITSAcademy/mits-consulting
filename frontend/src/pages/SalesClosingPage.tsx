import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useUI } from '@/store/ui';
import { Pill } from '@/components/ui/pill';

export function SalesClosingPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const { data } = useQuery({ queryKey: ['clients'], queryFn: () => api.get('/clients').then((r) => r.data) });
  const items = (data || []).filter((c: any) => ['DemoDone', 'SaleClosing'].includes(c.lifecycle));

  const move = useMutation({
    mutationFn: ({ id, lifecycle }: any) => api.post(`/clients/${id}/stage`, { lifecycle }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); showToast('Stage moved'); },
  });

  return (
    <>
      <Topbar title="Sales closing" subtitle={`${items.length} ready`} />
      <Page>
        <div className="table-card">
          <table>
            <thead><tr><th>Client</th><th>Stage</th><th>Engagement</th><th>Amount</th><th>Trainer</th><th>Actions</th></tr></thead>
            <tbody>
              {items.length === 0 ? <tr><td colSpan={6} className="text-center py-8 muted">No clients in sales close.</td></tr> :
              items.map((c: any) => (
                <tr key={c.id}>
                  <td><Link to={`/clients/${c.id}`} className="font-medium">{c.name}</Link></td>
                  <td><Pill color="amber">{c.lifecycle}</Pill></td>
                  <td>{c.engagementType}</td>
                  <td className="mono">{c.currency} {c.cycleAmount || 0}</td>
                  <td>{c.primaryTrainer?.name || '—'}</td>
                  <td>
                    {c.lifecycle === 'DemoDone' && (
                      <Button size="sm" onClick={() => move.mutate({ id: c.id, lifecycle: 'SaleClosing' })}>→ Sale closing</Button>
                    )}
                    {c.lifecycle === 'SaleClosing' && (
                      <Link to={`/fresh-payments`} className="btn btn-sm btn-primary">Record payment</Link>
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
