import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Link } from 'react-router-dom';
import { Pill } from '@/components/ui/pill';
import { todayISO } from '@/lib/utils';

export function RenewalsPage() {
  const { data } = useQuery({ queryKey: ['clients'], queryFn: () => api.get('/clients').then((r) => r.data) });
  const today = todayISO();
  const active = (data || []).filter((c: any) => c.lifecycle === 'Active' && c.nextRenewalDue);
  const sorted = [...active].sort((a, b) => (a.nextRenewalDue || '').localeCompare(b.nextRenewalDue || ''));

  return (
    <>
      <Topbar title="Renewals" subtitle={`${active.length} active clients`} />
      <Page>
        <div className="table-card">
          <table>
            <thead><tr><th>Client</th><th>Next due</th><th>Sessions</th><th>Risk</th><th>Amount</th><th>Trainer</th></tr></thead>
            <tbody>
              {sorted.map((c: any) => {
                const overdue = c.nextRenewalDue && c.nextRenewalDue < today;
                return (
                  <tr key={c.id} className="clickable">
                    <td><Link to={`/clients/${c.id}`} className="font-medium">{c.name}</Link></td>
                    <td className={`mono ${overdue ? 'text-brand-red' : ''}`}>{c.nextRenewalDue}</td>
                    <td className="mono">{c.sessionsUsed}/{c.sessionsPerCycle}</td>
                    <td><Pill color={c.churnRisk === 'Red' ? 'red' : c.churnRisk === 'Amber' ? 'amber' : 'green'}>{c.churnRisk}</Pill></td>
                    <td className="mono">{c.currency} {c.cycleAmount}</td>
                    <td>{c.primaryTrainer?.name || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Page>
    </>
  );
}
