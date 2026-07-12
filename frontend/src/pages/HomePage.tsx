import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { useAuth } from '@/store/auth';
import { Link } from 'react-router-dom';
import { timeGreeting } from '@/components/ThemeToggle';
import { TrendingUp, TrendingDown, Users, Activity, Calendar, AlertTriangle, Moon, ArrowRight, Zap } from 'lucide-react';
import { useEffect, useRef, useState, useMemo } from 'react';
import { getCount } from '@/lib/milestones';

/* ── Animated number counter ─────────────────────────────────────────────── */
function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) { setVal(0); return; }
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out-cubic
      setVal(Math.round(eased * target));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return val;
}

/* ── Mini sparkline via Canvas ───────────────────────────────────────────── */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !values.length) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const min = Math.min(...values), max = Math.max(...values);
    const range = max - min || 1;
    const pts = values.map((v, i) => ({
      x: (i / (values.length - 1)) * (W - 2) + 1,
      y: H - 4 - ((v - min) / range) * (H - 8),
    }));
    // Area fill
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, color.replace(')', ', 0.25)').replace('rgb', 'rgba'));
    grad.addColorStop(1, color.replace(')', ', 0)').replace('rgb', 'rgba'));
    ctx.beginPath();
    ctx.moveTo(pts[0].x, H);
    pts.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    // Line
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
    // Last dot
    const last = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }, [values, color]);
  return <canvas ref={ref} width={64} height={28} style={{ opacity: 0.85 }} />;
}

/* ── KPI card with staggered fade-up, optional sparkline, link ───────────── */
function Kpi({ icon: Icon, label, value, rawValue, sub, accent, delay = 0, to, spark }: {
  icon: any; label: string; value: React.ReactNode; rawValue?: number; sub?: React.ReactNode;
  accent?: 'green' | 'amber' | 'red' | 'gold' | 'blue' | 'neutral';
  delay?: number; to?: string; spark?: number[];
}) {
  const accentColor =
    accent === 'green' ? '#4ADE80' :
    accent === 'amber' ? '#F59E0B' :
    accent === 'red'   ? '#EF4444' :
    accent === 'gold'  ? '#E5B24C' :
    accent === 'blue'  ? '#5B8DEF' :
    'var(--brand-textMuted)';

  const counted = useCountUp(rawValue ?? 0);
  const displayValue = rawValue !== undefined ? counted : value;

  const inner = (
    <div
      className="kpi-card relative overflow-hidden group"
      style={{
        borderTop: `2px solid ${accentColor}`,
        animation: `fadeUp 380ms cubic-bezier(0.2,0.9,0.25,1) ${delay}ms both`,
        cursor: to ? 'pointer' : 'default',
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="kpi-label">{label}</div>
        <div className="flex items-center gap-2">
          {spark && <Sparkline values={spark} color={accentColor} />}
          <Icon size={14} style={{ color: accentColor, opacity: 0.8, flexShrink: 0 }} />
        </div>
      </div>
      <div className="kpi-value" style={{ color: accent && accent !== 'neutral' ? accentColor : undefined }}>
        {displayValue}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
      {to && (
        <div
          className="absolute bottom-2.5 right-3 flex items-center gap-0.5 transition-all opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5"
          style={{ fontSize: 10, color: accentColor, fontWeight: 600 }}
        >
          View <ArrowRight size={9} />
        </div>
      )}
    </div>
  );

  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}

/* ── Personal stat card ──────────────────────────────────────────────────── */
const STAT_DEFS: { key: Parameters<typeof getCount>[0]; label: string; emoji: string; roles?: string[] }[] = [
  { key: 'sessions_logged',  label: 'sessions logged',   emoji: '🎯' },
  { key: 'payments_recorded', label: 'payments recorded', emoji: '💰' },
  { key: 'demos_done',       label: 'demos completed',   emoji: '🎤' },
  { key: 'issues_resolved',  label: 'issues resolved',   emoji: '✅' },
  { key: 'clients_closed',   label: 'clients closed',    emoji: '🏆' },
];

function PersonalStats({ role }: { role?: string }) {
  const month = new Date().toLocaleString(undefined, { month: 'long' });
  const stats = useMemo(
    () => STAT_DEFS.map((d) => ({ ...d, count: getCount(d.key) })).filter((s) => s.count > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  if (stats.length === 0) return null;
  return (
    <div
      className="card mb-5"
      style={{
        padding: '14px 16px',
        animation: 'fadeUp 360ms cubic-bezier(0.2,0.9,0.25,1) 80ms both',
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent-gold) 4%, var(--bg-card)), var(--bg-card))',
        borderTop: '2px solid var(--accent-gold)',
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: 'var(--accent-gold)', letterSpacing: '0.07em' }}>
          Your {month}
        </span>
        <span className="text-[10px] muted">This month's activity</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {stats.map((s, i) => (
          <div
            key={s.key}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--brand-borderSoft)',
              animation: `fadeUp 300ms cubic-bezier(0.2,0.9,0.25,1) ${100 + i * 60}ms both`,
              fontSize: 12,
            }}
          >
            <span aria-hidden style={{ fontSize: 13 }}>{s.emoji}</span>
            <span className="font-bold" style={{ color: 'var(--accent-gold)', fontVariantNumeric: 'tabular-nums' }}>{s.count}</span>
            <span style={{ color: 'var(--brand-textSecondary)' }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────────────── */
function HomeHero({ name }: { name: string }) {
  const { greeting, emoji } = timeGreeting();
  const firstName = (name || '').split(' ')[0];
  const dayDate = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div className="card-hero mb-5 relative overflow-hidden" style={{ animation: 'fadeUp 300ms cubic-bezier(0.2,0.9,0.25,1) both' }}>
      <div className="text-[12px] muted flex items-center gap-1.5 mb-1.5">
        <span aria-hidden>{emoji}</span>
        <span>{greeting}</span>
      </div>
      <h1 className="h-display">
        Welcome back, <span className="text-gold-grad">{firstName}</span>
      </h1>
      <div className="text-[13px] muted mt-1.5">{dayDate}</div>
      {/* Subtle animated shimmer streak */}
      <div
        aria-hidden
        style={{
          position: 'absolute', top: 0, right: 0, width: 260, height: '100%', pointerEvents: 'none',
          background: 'linear-gradient(135deg, transparent 40%, rgba(229,178,76,0.06) 60%, transparent 80%)',
          animation: 'heroShimmer 6s ease-in-out infinite',
        }}
      />
    </div>
  );
}

/* ── Skeleton row ─────────────────────────────────────────────────────────── */
function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="kpi-card" style={{ minHeight: 84, animation: `fadeUp 300ms cubic-bezier(0.2,0.9,0.25,1) ${i * 60}ms both` }}>
          <div className="h-2.5 w-20 rounded mb-3" style={{ background: 'var(--bg-cardHover)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          <div className="h-7 w-14 rounded" style={{ background: 'var(--bg-cardHover)', animation: 'pulse 1.5s ease-in-out infinite' }} />
        </div>
      ))}
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
        {user && <PersonalStats role={user.role} />}

        {isLoading || !data ? (
          <>
            <KpiSkeleton />
            <KpiSkeleton />
          </>
        ) : (
          <>
            <div className="divider">Money flow this month</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
              <Kpi icon={TrendingUp}   label="Money in · USD"     value={`$${data.money.usdIn.toLocaleString()}`}    rawValue={data.money.usdIn}     accent="green" delay={0}   />
              <Kpi icon={TrendingUp}   label="Money in · CAD"     value={`C$${data.money.cadIn.toLocaleString()}`}   rawValue={data.money.cadIn}     accent="green" delay={60}  />
              <Kpi icon={TrendingDown} label="Trainer out · INR"  value={`₹${data.money.trainerOut.toLocaleString()}`} rawValue={data.money.trainerOut} accent="red"   delay={120} />
              <Kpi
                icon={AlertTriangle}
                label="Pending on Vaibhav"
                value={data.ops.pendingVaibhav}
                rawValue={data.ops.pendingVaibhav}
                accent={data.ops.pendingVaibhav > 0 ? 'amber' : 'neutral'}
                delay={180}
                to={data.ops.pendingVaibhav > 0 ? '/vaibhav-queue' : undefined}
              />
            </div>

            <div className="divider">Operations</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
              <Kpi icon={Users}         label="Active clients"   value={data.ops.activeClients} rawValue={data.ops.activeClients} sub={`${data.ops.holds} on hold`} accent="blue" delay={0}   to="/clients" />
              <Kpi icon={Activity}      label="In pipeline"      value={data.ops.inPipeline}    rawValue={data.ops.inPipeline}    sub="Lead → demo"                 accent="gold" delay={60}  to="/pipeline" />
              <Kpi
                icon={Calendar}
                label="Renewals today"
                value={data.ops.dueToday}
                rawValue={data.ops.dueToday}
                accent={data.ops.dueToday > 0 ? 'amber' : 'neutral'}
                delay={120}
                to={data.ops.dueToday > 0 ? '/clients' : undefined}
              />
              <Kpi
                icon={AlertTriangle}
                label="Churn risk"
                value={
                  <>
                    <span style={{ color: '#EF4444' }}>{data.ops.red}</span>
                    <span className="muted text-base"> / </span>
                    <span style={{ color: '#F59E0B' }}>{data.ops.amber}</span>
                  </>
                }
                sub="red / amber"
                accent="red"
                delay={180}
                to="/clients"
              />
            </div>

            {/* Quick-actions strip — role-aware */}
            {(() => {
              const role = user?.role;
              const links = [
                { to: '/my-calendar',   label: 'My calendar',   icon: Calendar,  color: '#A78BFA', roles: ['founder','manager','lead','account_manager','staff','sales_closer','demo_lead','demo_intake'] },
                { to: '/my-sessions',   label: 'My sessions',   icon: Activity,  color: '#4ADE80', roles: ['founder','manager','lead','account_manager'] },
                { to: '/session-logs',  label: 'Log a session', icon: Zap,       color: '#E5B24C', roles: ['founder','manager','lead','account_manager','staff','payment_processor'] },
                { to: '/feedback',      label: 'Feedback sheet',icon: Calendar,  color: '#5B8DEF', roles: ['founder','manager','lead','account_manager'] },
                { to: '/follow-up-payments', label: 'Payment follow-up', icon: Zap, color: '#F59E0B', roles: ['founder','manager','accounts','demo_lead'] },
                { to: '/sourcing',      label: 'Sourcing',      icon: Activity,  color: '#14B8A6', roles: ['founder','demo_lead','demo_intake','recruiter'] },
              ].filter(l => !role || l.roles.includes(role)).slice(0, 4);
              return links.length > 0 ? (
                <div className="flex flex-wrap gap-2 mb-5" style={{ animation: 'fadeUp 380ms cubic-bezier(0.2,0.9,0.25,1) 240ms both' }}>
                  {links.map(({ to, label, icon: Icon, color }) => (
                    <Link key={to} to={to}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all hover:-translate-y-0.5"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)', color: 'var(--brand-textSecondary)', boxShadow: 'var(--shadow-sm)' }}
                    >
                      <Icon size={13} style={{ color }} />
                      {label}
                    </Link>
                  ))}
                </div>
              ) : null;
            })()}

            {/* Dormant tile */}
            {data.ops.dormant > 0 && (
              <Link to="/dormant" className="block group" style={{ animation: 'fadeUp 380ms cubic-bezier(0.2,0.9,0.25,1) 280ms both' }}>
                <div
                  className="rounded-xl p-4 mb-4 cursor-pointer flex justify-between items-center transition-all hover:-translate-y-0.5"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--brand-border)',
                    borderLeft: `3px solid ${data.ops.dormantOverdue > 0 ? 'var(--status-red)' : 'var(--brand-textMuted)'}`,
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: data.ops.dormantOverdue > 0 ? 'rgba(239,68,68,0.12)' : 'var(--bg-cardHover)' }}>
                      <Moon size={16} style={{ color: data.ops.dormantOverdue > 0 ? 'var(--status-red)' : 'var(--brand-textMuted)' }} />
                    </div>
                    <div>
                      <div className="kpi-label">Dormant clients</div>
                      <div className="text-[18px] font-bold leading-tight">{data.ops.dormant}</div>
                      <div className="kpi-sub">
                        {data.ops.dormantOverdue > 0 ? (
                          <span style={{ color: 'var(--status-red)' }}><strong>{data.ops.dormantOverdue}</strong> check-back overdue · reach out today</span>
                        ) : 'All check-backs scheduled ahead'}
                      </div>
                    </div>
                  </div>
                  <ArrowRight size={16} className="muted transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            )}

            {/* Pending on Vaibhav table */}
            {data.pendingVaibhav?.length > 0 && (
              <div style={{ animation: 'fadeUp 380ms cubic-bezier(0.2,0.9,0.25,1) 320ms both' }}>
                <div className="divider">Pending on Vaibhav</div>
                <div className="callout">
                  Clients flagged for your personal collection.{' '}
                  <Link to="/vaibhav-queue" className="text-brand-amber underline">View all →</Link>
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
                          <td><Link to={`/clients/${c.id}`} className="font-medium">{c.name}</Link></td>
                          <td className="mono">{c.currency} {c.cycleAmount}</td>
                          <td>{c.source || '—'}</td>
                          <td className="mono text-brand-amber">{c.pendingVaibhavSince || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </Page>
      <style>{`
        @keyframes heroShimmer {
          0%, 100% { opacity: 0.5; transform: translateX(0); }
          50%       { opacity: 1;   transform: translateX(-20px); }
        }
      `}</style>
    </>
  );
}
