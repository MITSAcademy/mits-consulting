import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Link } from 'react-router-dom';
import { Pill } from '@/components/ui/pill';
import { useAuth } from '@/store/auth';
import { EmptyState } from '@/components/EmptyState';
import { LayoutGrid } from 'lucide-react';

const STAGE_ORDER = ['DemoDone', 'FeedbackPending', 'SaleClosing', 'SaleWon', 'Active'];

function stageLabel(s: string) {
  if (s === 'DemoDone') return 'Demo done';
  if (s === 'FeedbackPending') return 'Feedback pending';
  if (s === 'SaleClosing') return 'Sale closing';
  if (s === 'SaleWon') return 'Sale won';
  if (s === 'Active') return 'Active';
  return s;
}

function stagePillColor(s: string): 'amber' | 'blue' | 'green' | 'purple' | 'grey' {
  if (s === 'DemoDone' || s === 'FeedbackPending') return 'blue';
  if (s === 'SaleClosing') return 'amber';
  if (s === 'SaleWon') return 'purple';
  if (s === 'Active') return 'green';
  return 'grey';
}

function subStatusPillColor(ss: string): 'amber' | 'green' | 'grey' | 'blue' | 'red' {
  if (ss === 'RP') return 'blue';
  if (ss === 'CP') return 'amber';
  if (ss === 'C') return 'amber';
  if (ss === 'DP') return 'red';
  if (ss === 'JBT-Paid' || ss === 'Training-Paid') return 'green';
  if (ss === 'JBT-EmployerLater' || ss === 'Training-EmployerLater') return 'green';
  return 'grey';
}

function pendingAction(c: any): { label: string; urgent: boolean } {
  const ss = c.saleClosingSubStatus;
  const lc = c.lifecycle;

  if (lc === 'DemoDone' || lc === 'FeedbackPending') return { label: 'Start closing', urgent: false };
  if (lc === 'SaleClosing') {
    if (!ss || ss === 'RP') return { label: 'Call client — move from RP', urgent: true };
    if (ss === 'CP') return { label: 'Revisit in 3 days — move to C', urgent: false };
    if (ss === 'C') return { label: 'Follow up daily — waiting for payment', urgent: true };
    if (ss === 'DP') return { label: 'Dropped — no follow-up', urgent: false };
    if (ss === 'JBT-EmployerLater' || ss === 'Training-EmployerLater') return { label: 'Send engagement letter', urgent: false };
  }
  if (lc === 'SaleWon') {
    if (!c.engagementLetterSentAt) return { label: 'Send engagement letter', urgent: true };
    if (!c.whatsappGroupRenamedAt) return { label: 'Rename WA group', urgent: false };
    return { label: 'Activate client', urgent: false };
  }
  if (lc === 'Active') return { label: 'Active — with Mitali', urgent: false };
  return { label: '—', urgent: false };
}

function daysSince(iso?: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function SalesClosingPage() {
  const user = useAuth((s) => s.user)!;
  const { data } = useQuery({ queryKey: ['clients'], queryFn: () => api.get('/clients').then((r) => r.data) });

  const all = (data || []) as any[];
  const items = all
    .filter((c: any) => {
      const inStage = STAGE_ORDER.includes(c.lifecycle);
      if (!inStage) return false;
      // sales_closer sees only their own clients
      if (user.role === 'sales_closer') return c.salesOwnerId === user.id;
      return true;
    })
    .sort((a: any, b: any) => STAGE_ORDER.indexOf(a.lifecycle) - STAGE_ORDER.indexOf(b.lifecycle));

  const counts = STAGE_ORDER.reduce((acc, s) => {
    acc[s] = items.filter((c: any) => c.lifecycle === s).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <>
      <Topbar
        title="My pipeline"
        subtitle={`${items.length} client${items.length !== 1 ? 's' : ''} across closing stages`}
      />
      <Page>
        {/* Summary strip */}
        {items.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-4">
            {STAGE_ORDER.filter(s => counts[s] > 0).map(s => (
              <div key={s} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}>
                <span style={{ color: 'var(--brand-textMuted)' }}>{stageLabel(s)}</span>
                <span className="px-1.5 py-px rounded-full text-[10px] font-bold"
                  style={{ background: 'var(--accent-gold)', color: '#0F1115' }}>{counts[s]}</span>
              </div>
            ))}
          </div>
        )}

        {items.length === 0 ? (
          <EmptyState
            icon={LayoutGrid}
            tone="gold"
            title="No clients in your pipeline"
            description="Clients appear here once they reach Demo Done and move through closing to Active."
          />
        ) : (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Stage</th>
                  <th>Sub-status</th>
                  <th>Engagement</th>
                  <th>Amount</th>
                  <th>Days in stage</th>
                  <th>Pending action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c: any) => {
                  const { label, urgent } = pendingAction(c);
                  const days = daysSince(c.stageEnteredAt);
                  return (
                    <tr key={c.id} className="clickable">
                      <td>
                        <Link to={`/clients/${c.id}`} className="font-semibold hover:underline"
                          style={{ color: 'var(--brand-text)' }}>
                          {c.name}
                        </Link>
                      </td>
                      <td><Pill color={stagePillColor(c.lifecycle)}>{stageLabel(c.lifecycle)}</Pill></td>
                      <td>
                        {c.saleClosingSubStatus
                          ? <Pill color={subStatusPillColor(c.saleClosingSubStatus)}>{c.saleClosingSubStatus}</Pill>
                          : <span className="muted text-xs">—</span>}
                      </td>
                      <td className="text-sm">{c.engagementType || '—'}</td>
                      <td className="mono text-sm">{c.currency} {c.cycleAmount || '—'}</td>
                      <td>
                        <span className="mono text-sm" style={{ color: days >= 5 ? 'var(--status-red)' : days >= 3 ? 'var(--status-amber)' : 'var(--brand-textSecondary)' }}>
                          {days}d
                        </span>
                      </td>
                      <td>
                        <span className="text-xs font-medium" style={{ color: urgent ? 'var(--status-amber)' : 'var(--brand-textSecondary)' }}>
                          {urgent && '⚡ '}{label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Page>
    </>
  );
}
