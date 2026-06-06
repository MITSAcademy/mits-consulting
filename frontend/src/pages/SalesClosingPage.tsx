import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useUI } from '@/store/ui';
import { Pill } from '@/components/ui/pill';
import { Inbox } from 'lucide-react';

/** Map engagementType → a sensible pill color. Keeps the table scannable. */
function engagementColor(t?: string): 'green' | 'blue' | 'purple' | 'grey' {
  if (t === 'Training') return 'green';
  if (t === 'Support')  return 'blue';
  if (t === 'TaskBased') return 'purple';
  return 'grey';
}

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
            <thead><tr><th>Client</th><th>Stage</th><th>Engagement</th><th>Amount</th><th>Trainer</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12">
                    <div className="flex flex-col items-center justify-center gap-2 muted">
                      <Inbox size={32} className="opacity-40" />
                      <div className="text-sm">No clients in sales close.</div>
                      <div className="text-[11px]">New clients arrive here automatically after a positive demo feedback.</div>
                    </div>
                  </td>
                </tr>
              ) :
              items.map((c: any) => (
                <tr key={c.id} className="clickable">
                  <td>
                    <Link to={`/clients/${c.id}`} className="font-semibold hover:underline" style={{ color: 'var(--brand-text)' }}>
                      {c.name}
                    </Link>
                  </td>
                  <td><Pill color={c.lifecycle === 'SaleClosing' ? 'amber' : 'blue'}>{c.lifecycle === 'SaleClosing' ? 'Sale closing' : 'Demo done'}</Pill></td>
                  <td><Pill color={engagementColor(c.engagementType)}>{c.engagementType || '—'}</Pill></td>
                  <td className="mono">{c.currency} {c.cycleAmount || 0}</td>
                  <td>{c.primaryTrainer?.name || <span className="muted">—</span>}</td>
                  <td className="text-right">
                    {c.lifecycle === 'DemoDone' && (
                      <Button size="sm" onClick={() => move.mutate({ id: c.id, lifecycle: 'SaleClosing' })}>→ Sale closing</Button>
                    )}
                    {c.lifecycle === 'SaleClosing' && (
                      <Link to={`/fresh-payments`} className="btn btn-sm btn-gold">Record payment</Link>
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
