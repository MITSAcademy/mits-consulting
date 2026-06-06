import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { useAuth } from '@/store/auth';
import { Link } from 'react-router-dom';
import { timeGreeting } from '@/components/ThemeToggle';
import { TrendingUp, TrendingDown, Users, Activity, Calendar, AlertTriangle, Moon } from 'lucide-react';

/** Personalised hero — bigger than the standard Topbar title, sets the
 *  morning/evening tone for the dashboard. */
function HomeHero({ name }: { name: string }) {
  const { greeting, emoji } = timeGreeting();
  const firstName = (name || '').split(' ')[0];
  const dayDate = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div
      className="rounded-2xl p-6 md:p-7 mb-5 relative overflow-hidden"
      style={{
        background:
          'radial-gradient(700px 300px at 100% 0%, rgba(229,178,76,0.10), transparent 60%), ' +
          'radial-gradient(500px 300px at 0% 100%, rgba(91,141,239,0.06), transparent 60%), ' +
          'var(--bg-card)',
        border: '1px solid var(--brand-border)',
      }}
    >
      <div className="text-[12px] muted flex items-center gap-1.5 mb-1.5">
        <span aria-hidden>{emoji}</span>
        <span>{greeting}</span>
      </div>
      <h1 className="text-[28px] md:text-[32px] font-bold tracking-tight leading-tight" style={{ color: 'var(--brand-text)' }}>
        Welcome back, <span style={{ color: 'var(--accent-gold)' }}>{firstName}</span>
      </h1>
      <div className="text-[13px] muted mt-1">{dayDate}</div>
    </div>
  );
}

/** Beautified KPI card with an icon + accent line. */
function Kpi({ icon: Icon, label, value, sub, accent }: {
  icon: any; label: string; value: React.ReactNode; sub?: React.ReactNode;
  accent?: 'green' | 'amber' | 'red' | 'gold' | 'blue' | 'neutral';
}) {
  const accentColor =
    accent === 'green' ? 'var(--status-green)' :
    accent === 'amber' ? 'var(--status-amber)' :
    accent === 'red'   ? 'var(--status-red)'   :
    accent === 'gold'  ? 'var(--accent-gold)'  :
    accent === 'blue'  ? 'var(--status-blue)'  :
    'var(--brand-textMuted)';
  return (
    <div
      className="kpi-card relative overflow-hidden"
      style={{ borderTop: `2px solid ${accentColor}` }}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="kpi-label">{label}</div>
        <Icon size={14} style={{ color: accentColor, opacity: 0.8 }} />
      </div>
      <div className="kpi-value" style={{ color: accent && accent !== 'neutral' ? accentColor : undefined }}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function HomePage() {
  const user = useAuth((s) => s.user);
  const { data, isLoading } = useQuery({
    queryKey: ['metrics/home'],
    queryFn: () => api.get('/metrics/home').then((r) => r.data),
  });

  return (
    <>
      <Topbar title="Home" subtitle={user?.name} />
      <Page>
        {user && <HomeHero name={user.name} />}
        {isLoading || !data ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="kpi-card" style={{ minHeight: 84 }}>
                <div className="h-3 w-20 rounded mb-2 animate-pulse" style={{ background: 'var(--bg-cardHover)' }} />
                <div className="h-6 w-16 rounded animate-pulse" style={{ background: 'var(--bg-cardHover)' }} />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="divider">Money flow this month</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
              <Kpi icon={TrendingUp}   label="Money in · USD" value={`$${data.money.usdIn.toLocaleString()}`}  accent="green" />
              <Kpi icon={TrendingUp}   label="Money in · CAD" value={`C$${data.money.cadIn.toLocaleString()}`} accent="green" />
              <Kpi icon={TrendingDown} label="Trainer out · INR" value={`₹${data.money.trainerOut.toLocaleString()}`} accent="red" />
              <Kpi
                icon={AlertTriangle}
                label="Pending on Vaibhav"
                value={data.ops.pendingVaibhav}
                accent={data.ops.pendingVaibhav > 0 ? 'amber' : 'neutral'}
              />
            </div>

            <div className="divider">Operations</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
              <Kpi icon={Users}    label="Active clients" value={data.ops.activeClients} sub={`${data.ops.holds} on hold`}  accent="blue" />
              <Kpi icon={Activity} label="In pipeline"    value={data.ops.inPipeline}    sub="Lead → demo"                  accent="gold" />
              <Kpi
                icon={Calendar}
                label="Renewals today"
                value={data.ops.dueToday}
                accent={data.ops.dueToday > 0 ? 'amber' : 'neutral'}
              />
              <Kpi
                icon={AlertTriangle}
                label="Churn risk"
                value={
                  <>
                    <span style={{ color: 'var(--status-red)' }}>{data.ops.red}</span>
                    <span className="muted text-base"> / </span>
                    <span style={{ color: 'var(--status-amber)' }}>{data.ops.amber}</span>
                  </>
                }
                sub="red / amber"
                accent="red"
              />
            </div>
            {/* Dormant tile — only show if there are any */}
            {data.ops.dormant > 0 && (
              <Link to="/dormant" className="block group">
                <div
                  className="rounded-xl p-4 mb-4 cursor-pointer flex justify-between items-center transition-all"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--brand-border)',
                    borderLeft: `3px solid ${data.ops.dormantOverdue > 0 ? 'var(--status-red)' : 'var(--brand-textMuted)'}`,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{ background: data.ops.dormantOverdue > 0 ? 'rgba(239,68,68,0.12)' : 'var(--bg-cardHover)' }}
                    >
                      <Moon size={16} style={{ color: data.ops.dormantOverdue > 0 ? 'var(--status-red)' : 'var(--brand-textMuted)' }} />
                    </div>
                    <div>
                      <div className="kpi-label">Dormant clients</div>
                      <div className="text-[18px] font-bold leading-tight">{data.ops.dormant}</div>
                      <div className="kpi-sub">
                        {data.ops.dormantOverdue > 0 ? (
                          <span style={{ color: 'var(--status-red)' }}><strong>{data.ops.dormantOverdue}</strong> check-back overdue · reach out today</span>
                        ) : (
                          'All check-backs scheduled ahead'
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="muted transition-transform group-hover:translate-x-0.5">→</span>
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
