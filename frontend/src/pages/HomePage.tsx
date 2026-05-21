import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { useAuth } from '@/store/auth';
import { Link } from 'react-router-dom';
import { Pill } from '@/components/ui/pill';

export function HomePage() {
  const user = useAuth((s) => s.user);
  const { data, isLoading } = useQuery({
    queryKey: ['metrics/home'],
    queryFn: () => api.get('/metrics/home').then((r) => r.data),
  });

  return (
    <>
      <Topbar title="Home" subtitle={`MITS · ${user?.name}`} />
      <Page>
        {isLoading || !data ? (
          <div className="muted">Loading…</div>
        ) : (
          <>
            <div className="divider">Money flow this month</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
              <div className="kpi-card">
                <div className="kpi-label">Money in · USD</div>
                <div className="kpi-value text-brand-green">${data.money.usdIn.toLocaleString()}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Money in · CAD</div>
                <div className="kpi-value text-brand-green">C${data.money.cadIn.toLocaleString()}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Trainer out · INR</div>
                <div className="kpi-value text-brand-red">₹{data.money.trainerOut.toLocaleString()}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Pending on Vaibhav</div>
                <div className={`kpi-value ${data.ops.pendingVaibhav > 0 ? 'text-brand-amber' : ''}`}>
                  {data.ops.pendingVaibhav}
                </div>
              </div>
            </div>

            <div className="divider">Operations</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
              <div className="kpi-card">
                <div className="kpi-label">Active clients</div>
                <div className="kpi-value">{data.ops.activeClients}</div>
                <div className="kpi-sub">{data.ops.holds} on hold</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">In pipeline</div>
                <div className="kpi-value">{data.ops.inPipeline}</div>
                <div className="kpi-sub">Lead → demo</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Renewals today</div>
                <div className={`kpi-value ${data.ops.dueToday > 0 ? 'text-brand-amber' : ''}`}>
                  {data.ops.dueToday}
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Churn risk</div>
                <div className="kpi-value">
                  <span className="text-brand-red">{data.ops.red}</span>
                  <span className="text-brand-textMuted text-base"> / </span>
                  <span className="text-brand-amber">{data.ops.amber}</span>
                </div>
              </div>
            </div>
            {/* Dormant tile — only show if there are any */}
            {data.ops.dormant > 0 && (
              <Link to="/dormant" className="block">
                <div className="kpi-card mb-4 hover:bg-bg-cardHover transition-colors cursor-pointer" style={{ borderLeftWidth: 3, borderLeftColor: data.ops.dormantOverdue > 0 ? '#EF4444' : '#6B6F78' }}>
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="kpi-label">Dormant clients</div>
                      <div className="kpi-value">{data.ops.dormant}</div>
                      <div className="kpi-sub">
                        {data.ops.dormantOverdue > 0 ? (
                          <span className="text-brand-red"><strong>{data.ops.dormantOverdue}</strong> check-back overdue · reach out today</span>
                        ) : (
                          'All check-backs scheduled ahead'
                        )}
                      </div>
                    </div>
                    <span className="text-brand-textMuted">→</span>
                  </div>
                </div>
              </Link>
            )}

            {data.pendingVaibhav?.length > 0 && (
              <>
                <div className="divider">Pending on Vaibhav</div>
                <div className="callout">
                  Clients flagged for your personal collection.{' '}
                  <Link to="/vaibhav-queue" className="text-brand-amber underline">
                    View all →
                  </Link>
                </div>
                <div className="table-card mb-4">
                  <table>
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Amount</th>
                        <th>Source</th>
                        <th>Since</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.pendingVaibhav.slice(0, 5).map((c: any) => (
                        <tr key={c.id} className="clickable">
                          <td>
                            <Link to={`/clients/${c.id}`} className="font-medium">
                              {c.name}
                            </Link>
                          </td>
                          <td className="mono">
                            {c.currency} {c.cycleAmount}
                          </td>
                          <td>{c.source || '—'}</td>
                          <td className="mono text-brand-amber">{c.pendingVaibhavSince || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </Page>
    </>
  );
}
