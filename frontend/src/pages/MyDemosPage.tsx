import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/store/auth';
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { type LucideProps, Video, CheckCircle2, Clock, XCircle, RefreshCw } from 'lucide-react';

interface Demo {
  id: string;
  scheduledDate: string | null;
  scheduledTimeIst: string | null;
  actualDate: string | null;
  status: 'Scheduled' | 'Done' | 'Cancelled' | 'Rescheduled';
  outcome: string | null;
  trainerOutcome: string | null;
  feedback: string | null;
  nextSteps: string | null;
  client: { id: string; name: string; lifecycle: string } | null;
  trainer: { id: string; name: string } | null;
  conductedBy: { id: string; name: string } | null;
}

const STATUS_META: Record<string, { label: string; color: string; icon: React.ComponentType<LucideProps> }> = {
  Scheduled:   { label: 'Scheduled',   color: 'var(--status-amber)', icon: Clock },
  Done:        { label: 'Done',         color: 'var(--status-green)', icon: CheckCircle2 },
  Cancelled:   { label: 'Cancelled',   color: 'var(--status-red)',   icon: XCircle },
  Rescheduled: { label: 'Rescheduled', color: 'var(--accent-gold)',  icon: RefreshCw },
};

const OUTCOME_META: Record<string, { label: string; color: string }> = {
  Positive: { label: 'Positive', color: 'var(--status-green)' },
  Neutral:  { label: 'Neutral',  color: 'var(--status-amber)' },
  Negative: { label: 'Negative', color: 'var(--status-red)' },
};

const LIFECYCLE_LABEL: Record<string, string> = {
  Lead: 'Lead', VerificationPending: 'Verification', DemoScheduled: 'Demo Scheduled',
  DemoDone: 'Demo Done', FeedbackPending: 'Feedback Pending', SaleClosing: 'Sale Closing',
  SaleWon: 'Sale Won', Active: 'Active', Dormant: 'Dormant', Hold: 'Hold', Churned: 'Churned',
};

function StatusPill({ status }: { status: string }) {
  const m = STATUS_META[status] || { label: status, color: 'var(--brand-textMuted)', icon: Clock };
  const Icon = m.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: `color-mix(in srgb, ${m.color} 12%, transparent)`,
      color: m.color, border: `1px solid color-mix(in srgb, ${m.color} 22%, transparent)`,
      borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      <Icon size={10} />
      {m.label}
    </span>
  );
}

export function MyDemosPage() {
  const user = useAuth((s) => s.user)!;
  const isFounder = user.role === 'founder';

  const [conductedById, setConductedById] = useState(isFounder ? '' : user.id);
  const [from, setFrom] = useState('');
  const [to, setTo]     = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const { data: demos = [], isLoading } = useQuery<Demo[]>({
    queryKey: ['demos', conductedById, from, to],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (conductedById) params.conductedById = conductedById;
      if (from) params.from = from;
      if (to)   params.to   = to;
      return api.get('/demos', { params }).then((r) => r.data);
    },
  });

  const { data: users = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['users', 'id-name'],
    queryFn: () => api.get('/users').then((r) => (r.data as any[]).map((u) => ({ id: u.id, name: u.name }))),
    enabled: isFounder,
  });

  const filtered = useMemo(() => {
    if (statusFilter === 'All') return demos;
    return demos.filter((d) => d.status === statusFilter);
  }, [demos, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: demos.length };
    for (const d of demos) c[d.status] = (c[d.status] || 0) + 1;
    return c;
  }, [demos]);

  return (
    <>
      <Topbar
        title="My Demo Referrals"
        subtitle={`${filtered.length} demo${filtered.length !== 1 ? 's' : ''}`}
      />
      <Page>
        <div className="callout">
          All demos where you were marked as the conducting person, with their current client status.
          Use the date range to narrow down by scheduled date.
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-2xl mb-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}>
          {isFounder && (
            <select
              value={conductedById}
              onChange={(e) => setConductedById(e.target.value)}
              className="input text-[12px] py-1 pr-6"
              style={{ minWidth: 160 }}
            >
              <option value="">All conductors</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}

          <div className="flex items-center gap-2">
            <span className="text-[11px] muted uppercase tracking-wider font-semibold">From</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36 text-[12px] py-1" />
            <span className="text-[11px] muted uppercase tracking-wider font-semibold">To</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36 text-[12px] py-1" />
            {(from || to) && (
              <button className="text-[11px] muted" onClick={() => { setFrom(''); setTo(''); }}>Clear</button>
            )}
          </div>

          <div className="h-5 w-px" style={{ background: 'var(--brand-borderSoft)' }} />

          <div className="flex flex-wrap gap-1.5">
            {(['All', 'Scheduled', 'Done', 'Rescheduled', 'Cancelled'] as const).map((s) => {
              const active = statusFilter === s;
              const color = s !== 'All' ? STATUS_META[s]?.color : undefined;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className="px-3 py-1 rounded-full text-[12px] font-medium transition-all"
                  style={{
                    background: active ? (color ? `color-mix(in srgb, ${color} 15%, transparent)` : 'var(--accent-gold)') : 'var(--bg-input)',
                    color: active ? (color || '#0a0c12') : 'var(--brand-textSecondary)',
                    border: active ? `1px solid color-mix(in srgb, ${color || 'var(--accent-gold)'} 35%, transparent)` : '1px solid var(--brand-borderSoft)',
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  {s} {counts[s] ? <span style={{ opacity: 0.7 }}>({counts[s]})</span> : null}
                </button>
              );
            })}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 muted text-[13px]">Loading demos…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Video}
            tone="gold"
            title="No demos found"
            description="No demos match the current filters. Try adjusting the date range or status."
          />
        ) : (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Scheduled Date</th>
                  <th>Time (IST)</th>
                  <th>Client</th>
                  <th>Client Status</th>
                  <th>Trainer</th>
                  <th>Demo Status</th>
                  <th>Outcome</th>
                  <th>Trainer Result</th>
                  <th>Next Steps</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((demo) => {
                  const outcome = demo.outcome ? OUTCOME_META[demo.outcome] : null;
                  return (
                    <tr key={demo.id}>
                      <td className="mono text-[12px] whitespace-nowrap">
                        {demo.scheduledDate || <span className="muted">—</span>}
                      </td>
                      <td className="text-[12px] muted whitespace-nowrap">
                        {demo.scheduledTimeIst || '—'}
                      </td>
                      <td className="text-[13px]">
                        {demo.client
                          ? <Link to={`/clients/${demo.client.id}`} className="hover:underline font-medium">{demo.client.name}</Link>
                          : <span className="muted">—</span>}
                      </td>
                      <td>
                        {demo.client ? (
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand-textSecondary)', background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                            {LIFECYCLE_LABEL[demo.client.lifecycle] || demo.client.lifecycle}
                          </span>
                        ) : <span className="muted text-[11px]">—</span>}
                      </td>
                      <td className="text-[13px]">
                        {demo.trainer?.name || <span className="muted">—</span>}
                      </td>
                      <td><StatusPill status={demo.status} /></td>
                      <td>
                        {outcome
                          ? <span style={{ fontSize: 11, fontWeight: 600, color: outcome.color }}>{outcome.label}</span>
                          : <span className="muted text-[11px]">—</span>}
                      </td>
                      <td className="text-[12px]">
                        {demo.trainerOutcome || <span className="muted">—</span>}
                      </td>
                      <td style={{ maxWidth: 220 }}>
                        {demo.nextSteps
                          ? <span className="text-[12px]" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{demo.nextSteps}</span>
                          : <span className="muted text-[11px]">—</span>}
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
