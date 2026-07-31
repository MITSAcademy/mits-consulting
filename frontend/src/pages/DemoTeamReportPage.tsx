/**
 * Demo-team reporting dashboard.
 *
 * One-screen view for Vaibhav + Samita:
 *   • Top KPI strip (total pipeline, stuck, demos this week, recs count)
 *   • Workload by person (Anjali, Taran, Aman, Kanchan, Samita) — stacked bars
 *   • Pipeline funnel (Lead → FeedbackPending)
 *   • "Where things are stuck" heatmap: stage × aging buckets
 *   • Push-now recommendations table with severity + suggested action
 *   • Top stuck clients (oldest first)
 *   • Recent activity (last 24h)
 *   • Demo schedule next 7 days
 *
 * All data from one endpoint, cached 30s server-side.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Pill } from '@/components/ui/pill';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonKpis } from '@/components/ui/Skeleton';
import {
  TrendingUp, AlertTriangle, Clock, Users, Sparkles, ArrowRight,
  Activity, BarChart3, Target,
} from 'lucide-react';

interface ReportData {
  asOf: string;
  kpis: { totalPipeline: number; aged14: number; demosThisWeek: number; recommendations: number };
  funnel: { stage: string; count: number; aged14: number }[];
  workload: { userId: string; userName: string; total: number; aged14: number; byStage: Record<string, number> }[];
  ageBuckets: { stage: string; b03: number; b47: number; b814: number; b15: number }[];
  topStuck: { id: string; name: string; lifecycle: string; engagementType: string; amount: string | null; ownerName: string | null; daysStuck: number; demoDate: string | null; suggestedAction: string }[];
  recentMoves: { id: string; name: string; lifecycle: string; enteredAt: string; ownerName: string | null }[];
  recommendations: { client: { id: string; name: string }; ownerName: string | null; reason: string; severity: 'high' | 'medium'; lifecycle: string }[];
  conversion7: { total: number; reachedDemo: number; reachedSale: number; demoRate: number; saleRate: number };
  conversion30: { total: number; reachedDemo: number; reachedSale: number; demoRate: number; saleRate: number };
  demosByDay: Record<string, number>;
  referralBreakdown: { referredBy: string; total: number; reachedDemo: number; converted: number; demoRate: number; conversionRate: number }[];
  pipelineByReferral: { referredBy: string; count: number }[];
}

const STAGE_COLORS: Record<string, string> = {
  Lead:                'var(--brand-textMuted)',
  IntakeSent:          'var(--status-blue)',
  IntakeReceived:      'var(--status-teal)',
  WithRecruiters:      'var(--status-purple)',
  VerificationPending: 'var(--status-amber)',
  TrainerMatched:      '#A78BFA',
  DemoScheduled:       'var(--accent-gold)',
  DemoDone:            'var(--status-green)',
  FeedbackPending:     'var(--status-red)',
};

const stageLabels: Record<string, string> = {
  Lead: 'Lead',
  IntakeSent: 'Intake sent',
  IntakeReceived: 'Intake in',
  WithRecruiters: 'With recruiters',
  VerificationPending: 'Verification',
  TrainerMatched: 'Trainer matched',
  DemoScheduled: 'Demo scheduled',
  DemoDone: 'Demo done',
  FeedbackPending: 'Feedback pending',
};

export function DemoTeamReportPage() {
  const { data, isLoading } = useQuery<ReportData>({
    queryKey: ['reports/demo-team'],
    queryFn: () => api.get('/reports/demo-team').then((r) => r.data),
    refetchInterval: 10 * 60_000,
  });

  return (
    <>
      <Topbar
        title="Demo team report"
        subtitle={data ? `as of ${new Date(data.asOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
      />
      <Page>
        {isLoading || !data ? (
          <SkeletonKpis count={4} />
        ) : (
          <>
            <KpiStrip kpis={data.kpis} conv={data.conversion30} />
            <div className="grid lg:grid-cols-2 gap-3 mb-3">
              <WorkloadCard workload={data.workload} />
              <FunnelCard funnel={data.funnel} />
            </div>
            <StuckHeatmap rows={data.ageBuckets} />
            <RecommendationsCard recs={data.recommendations} />
            <div className="grid lg:grid-cols-2 gap-3 mb-3">
              <TopStuckCard rows={data.topStuck} />
              <RecentMovesCard rows={data.recentMoves} />
            </div>
            <DemoScheduleStrip demosByDay={data.demosByDay} />
            <ConversionCard c7={data.conversion7} c30={data.conversion30} />
            <ReferralCard breakdown={data.referralBreakdown || []} pipeline={data.pipelineByReferral || []} />
          </>
        )}
      </Page>
    </>
  );
}

/* ──────────────────────────────── KPI strip ─────────────────────────────── */

function KpiStrip({ kpis, conv }: { kpis: ReportData['kpis']; conv: ReportData['conversion30'] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mb-3">
      <KpiTile icon={Users}         label="Open pipeline"      value={kpis.totalPipeline} accent="blue"  />
      <KpiTile icon={AlertTriangle} label="Stuck 15d+"          value={kpis.aged14}        accent={kpis.aged14 > 0 ? 'red' : 'neutral'} />
      <KpiTile icon={Target}        label="Demos this week"    value={kpis.demosThisWeek} accent="gold"  />
      <KpiTile icon={Sparkles}      label="Push now"           value={kpis.recommendations} accent={kpis.recommendations > 0 ? 'amber' : 'green'} />
      <KpiTile icon={TrendingUp}    label="30d → demo"         value={`${conv.demoRate}%`} sub={`${conv.reachedDemo}/${conv.total}`} accent="green" />
    </div>
  );
}

function KpiTile({ icon: Icon, label, value, sub, accent }: { icon: any; label: string; value: React.ReactNode; sub?: string; accent: 'blue' | 'red' | 'gold' | 'amber' | 'green' | 'neutral' }) {
  const c =
    accent === 'red'    ? 'var(--status-red)'   :
    accent === 'amber'  ? 'var(--status-amber)' :
    accent === 'gold'   ? 'var(--accent-gold)'  :
    accent === 'green'  ? 'var(--status-green)' :
    accent === 'blue'   ? 'var(--status-blue)'  :
    'var(--brand-textMuted)';
  return (
    <div className="kpi-card" style={{ borderTop: `2px solid ${c}`, position: 'relative' }}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="kpi-label">{label}</div>
        <div
          className="rounded-md p-1.5"
          style={{
            background: `color-mix(in srgb, ${c} 12%, transparent)`,
            color: c,
          }}
        >
          <Icon size={14} />
        </div>
      </div>
      <div className="kpi-value" style={{ color: c }}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

/* ──────────────────────────────── Workload ─────────────────────────────── */

function WorkloadCard({ workload }: { workload: ReportData['workload'] }) {
  const sorted = [...workload].sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...sorted.map((w) => w.total));
  return (
    <div className="card">
      <div className="card-h"><span><BarChart3 size={12} className="inline mr-1"/> Workload by person</span></div>
      <div className="space-y-2">
        {sorted.map((w) => (
          <div key={w.userId}>
            <div className="flex items-center justify-between text-[12px] mb-1">
              <span className="font-semibold">{w.userName}</span>
              <span className="muted">
                <span style={{ color: 'var(--brand-text)' }}>{w.total}</span> open
                {w.aged14 > 0 && <> · <span style={{ color: 'var(--status-red)' }}>{w.aged14} stuck 15d+</span></>}
              </span>
            </div>
            <div className="flex h-[20px] rounded-lg overflow-hidden" style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.10)' }}>
              {Object.entries(w.byStage).map(([stage, count]) => {
                if (!count) return null;
                const width = (count / max) * 100;
                return (
                  <div
                    key={stage}
                    className="transition-all hover:brightness-110"
                    style={{
                      width: `${width}%`,
                      background: `linear-gradient(180deg, ${STAGE_COLORS[stage]} 0%, color-mix(in srgb, ${STAGE_COLORS[stage]} 75%, #000) 100%)`,
                      opacity: 0.92,
                    }}
                    title={`${stageLabels[stage] || stage}: ${count}`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mt-3 text-[10px]">
        {Object.entries(STAGE_COLORS).map(([stage, color]) => (
          <span key={stage} className="inline-flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="muted">{stageLabels[stage] || stage}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────────── Funnel ──────────────────────────────── */

function FunnelCard({ funnel }: { funnel: ReportData['funnel'] }) {
  const max = Math.max(1, ...funnel.map((f) => f.count));
  return (
    <div className="card">
      <div className="card-h"><span><Activity size={12} className="inline mr-1"/> Pipeline funnel</span></div>
      <div className="space-y-1.5">
        {funnel.map((f) => {
          const width = (f.count / max) * 100;
          return (
            <div key={f.stage} className="flex items-center gap-2 text-[12px]">
              <div className="w-[120px] muted text-right">{stageLabels[f.stage] || f.stage}</div>
              <div className="flex-1 h-[24px] rounded-lg overflow-hidden flex items-center"
                style={{ background: 'var(--bg-input)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.10)' }}
              >
                <div
                  className="transition-all"
                  style={{
                    width: `${width}%`,
                    background: `linear-gradient(90deg, ${STAGE_COLORS[f.stage]} 0%, color-mix(in srgb, ${STAGE_COLORS[f.stage]} 60%, transparent) 100%)`,
                    height: '100%',
                    minWidth: f.count > 0 ? '8px' : 0,
                    boxShadow: f.count > 0 ? `0 0 8px ${STAGE_COLORS[f.stage]}40` : 'none',
                  }}
                />
              </div>
              <div className="w-[110px] flex items-center gap-2 justify-end">
                <span className="font-bold">{f.count}</span>
                {f.aged14 > 0 && <Pill color="red">{f.aged14} stuck</Pill>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ──────────────────────────────── Stuck heatmap ──────────────────────── */

function StuckHeatmap({ rows }: { rows: ReportData['ageBuckets'] }) {
  const maxCount = Math.max(1, ...rows.flatMap((r) => [r.b03, r.b47, r.b814, r.b15]));
  function cell(n: number, tone: 'green' | 'blue' | 'amber' | 'red') {
    if (n === 0) return <td className="text-center text-[11px] muted">·</td>;
    const intensity = Math.max(0.18, Math.min(1, n / maxCount));
    const bg = tone === 'green' ? `rgba(74,222,128,${intensity * 0.5})`
            : tone === 'blue'  ? `rgba(91,141,239,${intensity * 0.5})`
            : tone === 'amber' ? `rgba(245,158,11,${intensity * 0.6})`
                               : `rgba(239,68,68,${intensity * 0.7})`;
    return <td className="text-center font-bold" style={{ background: bg, color: 'var(--brand-text)' }}>{n}</td>;
  }
  return (
    <div className="card mb-3">
      <div className="card-h">
        <span><Clock size={12} className="inline mr-1"/> Where things are stuck — aging by stage</span>
        <span className="muted text-[10px]">darker = more clients</span>
      </div>
      <div className="table-card" style={{ borderRadius: 8 }}>
        <table>
          <thead>
            <tr>
              <th>Stage</th>
              <th className="text-center">0–3d</th>
              <th className="text-center">4–7d</th>
              <th className="text-center">8–14d</th>
              <th className="text-center">15d+</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.stage}>
                <td className="font-medium">{stageLabels[r.stage] || r.stage}</td>
                {cell(r.b03, 'green')}
                {cell(r.b47, 'blue')}
                {cell(r.b814, 'amber')}
                {cell(r.b15, 'red')}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ──────────────────────────────── Recommendations ────────────────────── */

function RecommendationsCard({ recs }: { recs: ReportData['recommendations'] }) {
  if (recs.length === 0) {
    return (
      <div className="card mb-3">
        <div className="card-h"><span><Sparkles size={12} className="inline mr-1" style={{ color: 'var(--accent-gold)' }}/> Push now — recommendations</span></div>
        <EmptyState icon={Sparkles} tone="green" title="Nothing critical to push" description="Everything is moving on time. Check back later." />
      </div>
    );
  }
  return (
    <div className="card mb-3">
      <div className="card-h">
        <span><Sparkles size={12} className="inline mr-1" style={{ color: 'var(--accent-gold)' }}/> Push now — recommendations</span>
        <span className="muted text-[10px]">{recs.length} items · sorted by severity</span>
      </div>
      <div className="space-y-1.5">
        {recs.slice(0, 25).map((r, i) => (
          <Link
            key={i}
            to={`/clients/${r.client.id}`}
            className="block rounded-lg p-3 transition-all hover-lift"
            style={{
              background: `linear-gradient(90deg, ${r.severity === 'high' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.06)'} 0%, var(--bg-input) 60%)`,
              border: `1px solid ${r.severity === 'high' ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.22)'}`,
              borderLeft: `3px solid ${r.severity === 'high' ? 'var(--status-red)' : 'var(--status-amber)'}`,
            }}
          >
            <div className="flex justify-between items-start gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-[13px]">{r.client.name}</span>
                  <Pill color={r.severity === 'high' ? 'red' : 'amber'}>{r.severity}</Pill>
                  <span className="muted text-[10px]">· {stageLabels[r.lifecycle] || r.lifecycle}</span>
                  {r.ownerName && <span className="muted text-[10px]">· {r.ownerName}</span>}
                </div>
                <div className="text-[11.5px] muted mt-0.5">{r.reason}</div>
              </div>
              <ArrowRight size={14} className="muted flex-shrink-0 mt-1" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────────── Top stuck + recent moves ──────────── */

function TopStuckCard({ rows }: { rows: ReportData['topStuck'] }) {
  return (
    <div className="card">
      <div className="card-h">
        <span><Clock size={12} className="inline mr-1"/> Top stuck clients</span>
        <span className="muted text-[10px]">{rows.length} oldest first</span>
      </div>
      {rows.length === 0 ? (
        <div className="muted text-[12px] py-2">Nothing stuck — pipeline is healthy.</div>
      ) : (
        <div className="space-y-1.5">
          {rows.slice(0, 10).map((r) => (
            <Link key={r.id} to={`/clients/${r.id}`} className="block rounded p-2 transition-colors hover:bg-bg-cardHover" style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}>
              <div className="flex justify-between items-center gap-2">
                <div className="min-w-0">
                  <span className="font-semibold text-[12.5px]">{r.name}</span>
                  <span className="text-[10.5px] muted ml-1.5">· {stageLabels[r.lifecycle] || r.lifecycle}{r.ownerName && ` · ${r.ownerName}`}</span>
                  <div className="text-[11px] muted mt-0.5">{r.suggestedAction}</div>
                </div>
                <Pill color={r.daysStuck >= 15 ? 'red' : 'amber'}>{r.daysStuck}d</Pill>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentMovesCard({ rows }: { rows: ReportData['recentMoves'] }) {
  return (
    <div className="card">
      <div className="card-h">
        <span><Activity size={12} className="inline mr-1"/> Recently moved (last 24h)</span>
        <span className="muted text-[10px]">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="muted text-[12px] py-2">No moves in the last 24 hours.</div>
      ) : (
        <div className="space-y-1">
          {rows.slice(0, 12).map((r) => (
            <Link key={r.id} to={`/clients/${r.id}`} className="flex justify-between items-center px-2 py-1 rounded hover:bg-bg-cardHover text-[12px]">
              <div className="min-w-0 truncate">
                <span className="font-medium">{r.name}</span>
                <span className="muted ml-1.5 text-[10.5px]">→ {stageLabels[r.lifecycle] || r.lifecycle}</span>
              </div>
              <span className="muted text-[10px]">{r.ownerName || ''}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────── Demo schedule strip ────────────────── */

function DemoScheduleStrip({ demosByDay }: { demosByDay: Record<string, number> }) {
  const days = Object.entries(demosByDay);
  const max = Math.max(1, ...days.map(([, n]) => n));
  return (
    <div className="card mb-3">
      <div className="card-h"><span><Target size={12} className="inline mr-1"/> Demos next 7 days</span></div>
      <div className="flex items-end gap-2 h-[80px]">
        {days.map(([date, n]) => {
          const height = (n / max) * 100;
          const d = new Date(date);
          const dayLabel = d.toLocaleDateString(undefined, { weekday: 'short' });
          const dateLabel = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
          return (
            <div key={date} className="flex-1 flex flex-col items-center gap-1">
              <div className="text-[11px] font-bold">{n || ''}</div>
              <div
                className="w-full rounded-t-lg flex-1 flex items-end"
                style={{ background: 'var(--bg-input)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.08)' }}
              >
                <div
                  className="w-full rounded-t-lg"
                  style={{
                    background: n > 0 ? 'linear-gradient(180deg, var(--accent-gold) 0%, var(--accent-goldDeep) 100%)' : 'transparent',
                    height: `${Math.max(2, height)}%`,
                    transition: 'height 380ms cubic-bezier(0.2,0.9,0.25,1)',
                    minHeight: n > 0 ? 4 : 0,
                    boxShadow: n > 0 ? '0 -2px 8px var(--accent-goldGlow)' : 'none',
                  }}
                />
              </div>
              <div className="text-[10px] muted text-center">
                <div>{dayLabel}</div>
                <div>{dateLabel}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ──────────────────────────────── Conversion ─────────────────────────── */

function ConversionCard({ c7, c30 }: { c7: ReportData['conversion7']; c30: ReportData['conversion30'] }) {
  return (
    <div className="card">
      <div className="card-h"><span><TrendingUp size={12} className="inline mr-1"/> Conversion (new leads → demos / sales)</span></div>
      <div className="grid md:grid-cols-2 gap-3">
        <ConvCol title="Last 7 days" c={c7} />
        <ConvCol title="Last 30 days" c={c30} />
      </div>
    </div>
  );
}

function ConvCol({ title, c }: { title: string; c: ReportData['conversion7'] }) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}>
      <div className="text-[11px] uppercase tracking-wider muted mb-2">{title}</div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="text-[10px] muted">New leads</div>
          <div className="text-[18px] font-bold">{c.total}</div>
        </div>
        <div>
          <div className="text-[10px] muted">→ demo</div>
          <div className="text-[18px] font-bold" style={{ color: 'var(--status-blue)' }}>{c.demoRate}%</div>
          <div className="text-[10px] muted">{c.reachedDemo} clients</div>
        </div>
        <div>
          <div className="text-[10px] muted">→ sale</div>
          <div className="text-[18px] font-bold" style={{ color: 'var(--status-green)' }}>{c.saleRate}%</div>
          <div className="text-[10px] muted">{c.reachedSale} clients</div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────── Referral breakdown ─────────────────────────── */

function ReferralCard({
  breakdown,
  pipeline,
}: {
  breakdown: ReportData['referralBreakdown'];
  pipeline: ReportData['pipelineByReferral'];
}) {
  if (!breakdown.length && !pipeline.length) return null;
  const pipelineMap = Object.fromEntries(pipeline.map((p) => [p.referredBy, p.count]));
  return (
    <div className="card mb-3">
      <div className="card-h"><span><BarChart3 size={12} className="inline mr-1" /> Demo reference — leads vs conversion</span></div>
      <div className="overflow-x-auto">
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--brand-borderSoft)' }}>
              {['Referred by', 'In pipeline', 'All time leads', 'Reached demo', 'Converted', 'Demo %', 'Conversion %'].map((h) => (
                <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--brand-textMuted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {breakdown.map((r) => (
              <tr key={r.referredBy} style={{ borderBottom: '1px solid var(--brand-borderSoft)' }}>
                <td style={{ padding: '7px 10px', fontWeight: 600 }}>{r.referredBy}</td>
                <td style={{ padding: '7px 10px' }}>{pipelineMap[r.referredBy] ?? 0}</td>
                <td style={{ padding: '7px 10px' }}>{r.total}</td>
                <td style={{ padding: '7px 10px' }}>{r.reachedDemo}</td>
                <td style={{ padding: '7px 10px', color: 'var(--status-green)', fontWeight: 600 }}>{r.converted}</td>
                <td style={{ padding: '7px 10px' }}>
                  <span style={{ color: r.demoRate >= 50 ? 'var(--status-green)' : r.demoRate >= 25 ? 'var(--status-amber)' : 'var(--brand-textMuted)' }}>
                    {r.demoRate}%
                  </span>
                </td>
                <td style={{ padding: '7px 10px' }}>
                  <span style={{ color: r.conversionRate >= 30 ? 'var(--status-green)' : r.conversionRate >= 10 ? 'var(--status-amber)' : 'var(--brand-textMuted)' }}>
                    {r.conversionRate}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {breakdown.length === 0 && (
        <div className="text-[12px] muted p-4 text-center">No referral data yet — start tagging leads when adding them.</div>
      )}
    </div>
  );
}
