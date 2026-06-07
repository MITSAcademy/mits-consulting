import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Link } from 'react-router-dom';
import { Pill } from '@/components/ui/pill';
import { todayISO } from '@/lib/utils';
import { EmptyState } from '@/components/EmptyState';
import { RefreshCw } from 'lucide-react';

export function RenewalsPage() {
  const { data } = useQuery({ queryKey: ['clients'], queryFn: () => api.get('/clients').then((r) => r.data) });
  const today = todayISO();
  const active = (data || []).filter((c: any) => c.lifecycle === 'Active' && c.nextRenewalDue);
  const sorted = [...active].sort((a, b) => (a.nextRenewalDue || '').localeCompare(b.nextRenewalDue || ''));

  const overdue = sorted.filter((c) => c.nextRenewalDue < today).length;
  const dueWeek = sorted.filter((c) => {
    if (c.nextRenewalDue < today) return false;
    const d = new Date(c.nextRenewalDue).getTime() - Date.now();
    return d <= 7 * 86_400_000;
  }).length;

  return (
    <>
      <Topbar title="Renewals" subtitle={`${active.length} active · ${overdue} overdue · ${dueWeek} this week`} />
      <Page>
        <div className="table-card">
          <table>
            <thead><tr><th>Client</th><th>Next due</th><th>Sessions</th><th>Risk</th><th>Amount</th><th>Trainer</th></tr></thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={6}>
                  <EmptyState
                    icon={RefreshCw}
                    tone="green"
                    title="No renewals scheduled"
                    description="Active clients without a next renewal date will show up here once one is set."
                  />
                </td></tr>
              ) :
              sorted.map((c: any) => {
                const isOverdue = c.nextRenewalDue && c.nextRenewalDue < today;
                return (
                  <tr key={c.id} className="clickable">
                    <td><Link to={`/clients/${c.id}`} className="font-semibold hover:underline" style={{ color: 'var(--brand-text)' }}>{c.name}</Link></td>
                    <td className="mono">
                      <span style={{ color: isOverdue ? 'var(--status-red)' : 'var(--brand-text)', fontWeight: isOverdue ? 700 : 400 }}>
                        {c.nextRenewalDue}
                      </span>
                      {isOverdue && <Pill color="red" className="ml-2">overdue</Pill>}
                    </td>
                    <td className="mono">{c.sessionsUsed}/{c.sessionsPerCycle}</td>
                    <td><Pill color={c.churnRisk === 'Red' ? 'red' : c.churnRisk === 'Amber' ? 'amber' : 'green'}>{c.churnRisk}</Pill></td>
                    <td className="mono">{c.currency} {c.cycleAmount}</td>
                    <td>{c.primaryTrainer?.name || <span className="muted">—</span>}</td>
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
