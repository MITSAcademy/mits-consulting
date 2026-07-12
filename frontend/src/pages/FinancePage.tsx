/**
 * Finance Dashboard — founder only.
 * Shows actual revenue, actual expenses (trainer costs), net P&L per month,
 * MRR projection, business health indicators, and revenue-at-risk.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { useState } from 'react';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Target, DollarSign, Users, RefreshCw } from 'lucide-react';

const FMT_INR = (n: number) => {
  if (Math.abs(n) >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (Math.abs(n) >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (Math.abs(n) >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toLocaleString('en-IN')}`;
};

const MONTH_LABEL = (m: string) => {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString('en-IN', { month: 'short', year: '2-digit' });
};

function StatCard({ label, value, sub, tone, icon: Icon }: {
  label: string; value: string; sub?: string; tone?: 'green' | 'red' | 'amber' | 'blue' | 'grey';
  icon?: any;
}) {
  const colors: Record<string, string> = {
    green: '#22c55e', red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6', grey: 'var(--brand-text-muted)',
  };
  const col = colors[tone || 'blue'];
  return (
    <div className="card p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {Icon && <Icon size={14} style={{ color: col }} />}
        <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>{label}</span>
      </div>
      <div className="text-xl font-bold" style={{ color: col }}>{value}</div>
      {sub && <div className="text-[11px]" style={{ color: 'var(--brand-text-muted)' }}>{sub}</div>}
    </div>
  );
}

function TrendIcon({ curr, prev }: { curr: number; prev: number }) {
  if (!prev) return <Minus size={12} style={{ color: 'grey' }} />;
  const pct = Math.round(((curr - prev) / prev) * 100);
  if (pct > 0) return <span style={{ color: '#22c55e', fontSize: 11 }}>▲{pct}%</span>;
  if (pct < 0) return <span style={{ color: '#ef4444', fontSize: 11 }}>▼{Math.abs(pct)}%</span>;
  return <Minus size={12} style={{ color: 'grey' }} />;
}

export function FinancePage() {
  const [months, setMonths] = useState(12);

  const { data, isLoading } = useQuery({
    queryKey: ['finance', months],
    queryFn: () => api.get('/metrics/finance', { params: { months } }).then((r) => r.data),
  });

  if (isLoading || !data) {
    return (
      <>
        <Topbar title="Finance dashboard" subtitle="Revenue · Expenses · Projections" />
        <Page><div className="muted text-sm py-12 text-center">Loading financial data…</div></Page>
      </>
    );
  }

  const { byMonth, projections, snapshot } = data as any;
  const currentMonth = byMonth[byMonth.length - 1];
  const prevMonth = byMonth[byMonth.length - 2];

  // Revenue trend: last 3 months
  const last3 = byMonth.slice(-3);
  const revTrend = last3.length >= 2
    ? last3[last3.length - 1].revenueINR - last3[0].revenueINR > 0 ? 'up' : 'down'
    : 'flat';

  return (
    <>
      <Topbar
        title="Finance dashboard"
        subtitle={`Actual revenue · trainer costs · P&L · projections — ${months}-month view`}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>View:</span>
            {[6, 12, 24].map((n) => (
              <button
                key={n}
                onClick={() => setMonths(n)}
                className="text-xs px-2 py-1 rounded"
                style={{
                  background: months === n ? 'var(--accent-gold)' : 'var(--bg-input)',
                  color: months === n ? '#1A1B1E' : 'var(--brand-text)',
                  border: '1px solid var(--brand-border)',
                }}
              >{n}M</button>
            ))}
          </div>
        }
      />
      <Page>

        {/* ── Snapshot KPIs ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="MRR (projected)"
            value={FMT_INR(snapshot.mrr)}
            sub={`${snapshot.activeClients} clients with active sessions`}
            tone="green"
            icon={DollarSign}
          />
          <StatCard
            label="This month revenue"
            value={FMT_INR(currentMonth?.revenueINR || 0)}
            sub={prevMonth ? `vs ${FMT_INR(prevMonth.revenueINR)} last month` : undefined}
            tone={currentMonth?.revenueINR >= (prevMonth?.revenueINR || 0) ? 'green' : 'red'}
            icon={TrendingUp}
          />
          <StatCard
            label="This month net P&L"
            value={FMT_INR(currentMonth?.grossMargin || 0)}
            sub={`${currentMonth?.marginPct || 0}% gross margin`}
            tone={currentMonth?.grossMargin >= 0 ? 'green' : 'red'}
            icon={currentMonth?.grossMargin >= 0 ? TrendingUp : TrendingDown}
          />
          <StatCard
            label="Revenue at risk"
            value={FMT_INR(snapshot.revenueAtRisk)}
            sub={`${snapshot.churnRisk.red} red · ${snapshot.churnRisk.amber} amber clients`}
            tone={snapshot.revenueAtRisk > 0 ? 'amber' : 'green'}
            icon={AlertTriangle}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Active clients" value={String(snapshot.activeClients)} sub={snapshot.activeClientsLifecycle !== snapshot.activeClients ? `${snapshot.activeClientsLifecycle} by lifecycle` : 'with active sessions'} tone="blue" icon={Users} />
          <StatCard label="In pipeline" value={String(snapshot.pipeline)} sub="potential revenue" tone="grey" icon={Target} />
          <StatCard label="Renewals due (30d)" value={String(snapshot.renewalsDueSoon)} tone={snapshot.renewalsDueSoon > 5 ? 'amber' : 'green'} icon={RefreshCw} />
          <StatCard label="3M avg revenue" value={FMT_INR(snapshot.avgRevenue3m)} sub="rolling average" tone="grey" icon={Minus} />
        </div>

        {/* ── P&L Table ─────────────────────────────────────────────── */}
        <div className="card mb-6 overflow-x-auto">
          <div className="card-h flex items-center justify-between">
            <span>Monthly P&amp;L — Actual</span>
            <span className="text-[11px]" style={{ color: 'var(--brand-text-muted)' }}>All amounts in INR (₹). Trainer cost = expense.</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--brand-border)' }}>
                <th className="text-left py-2 px-3">Month</th>
                <th className="text-right py-2 px-3">Revenue</th>
                <th className="text-right py-2 px-3 text-[11px]">Fresh</th>
                <th className="text-right py-2 px-3 text-[11px]">Renewal</th>
                <th className="text-right py-2 px-3">Trainer Cost</th>
                <th className="text-right py-2 px-3 text-[11px]">Unpaid</th>
                <th className="text-right py-2 px-3 font-bold">Net P&amp;L</th>
                <th className="text-right py-2 px-3">Margin</th>
                <th className="text-right py-2 px-3">Sessions</th>
                <th className="text-right py-2 px-3">New clients</th>
                <th className="text-right py-2 px-3 text-[11px]">vs prev</th>
              </tr>
            </thead>
            <tbody>
              {byMonth.length === 0 && (
                <tr><td colSpan={11} className="text-center py-8 muted text-sm">No monthly data available.</td></tr>
              )}
              {[...byMonth].reverse().map((m: any, i: number, arr: any[]) => {
                const prev = arr[i + 1];
                const isCurrentMonth = m.month === new Date().toISOString().slice(0, 7);
                const isPL = m.grossMargin >= 0;
                return (
                  <tr
                    key={m.month}
                    style={{
                      borderBottom: '1px solid var(--brand-border)',
                      background: isCurrentMonth ? 'rgba(251,191,36,0.06)' : undefined,
                    }}
                  >
                    <td className="py-2 px-3 font-medium">
                      {MONTH_LABEL(m.month)}
                      {isCurrentMonth && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(251,191,36,0.2)', color: '#f59e0b' }}>Current</span>}
                    </td>
                    <td className="text-right py-2 px-3 font-semibold" style={{ color: '#22c55e' }}>{FMT_INR(m.revenueINR)}</td>
                    <td className="text-right py-2 px-3 text-[11px]" style={{ color: 'var(--brand-text-muted)' }}>{FMT_INR(m.freshRevINR)}</td>
                    <td className="text-right py-2 px-3 text-[11px]" style={{ color: 'var(--brand-text-muted)' }}>{FMT_INR(m.renewalRevINR)}</td>
                    <td className="text-right py-2 px-3" style={{ color: '#ef4444' }}>{FMT_INR(m.trainerTotal)}</td>
                    <td className="text-right py-2 px-3 text-[11px]" style={{ color: m.trainerPending > 0 ? '#f59e0b' : 'var(--brand-text-muted)' }}>
                      {m.trainerPending > 0 ? FMT_INR(m.trainerPending) : '—'}
                    </td>
                    <td className="text-right py-2 px-3 font-bold" style={{ color: isPL ? '#22c55e' : '#ef4444' }}>
                      {isPL ? '+' : ''}{FMT_INR(m.grossMargin)}
                    </td>
                    <td className="text-right py-2 px-3">
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                        style={{
                          background: m.marginPct >= 50 ? 'rgba(34,197,94,0.12)' : m.marginPct >= 30 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                          color: m.marginPct >= 50 ? '#22c55e' : m.marginPct >= 30 ? '#f59e0b' : '#ef4444',
                        }}>
                        {m.marginPct}%
                      </span>
                    </td>
                    <td className="text-right py-2 px-3 text-[11px]">{m.totalSessions} sess · {m.sessionHours}h</td>
                    <td className="text-right py-2 px-3 text-[11px]">{m.newClients > 0 ? `+${m.newClients}` : '—'}</td>
                    <td className="text-right py-2 px-3">
                      {prev ? <TrendIcon curr={m.revenueINR} prev={prev.revenueINR} /> : <Minus size={12} style={{ color: 'grey' }} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Projection ────────────────────────────────────────────── */}
        <div className="card mb-6">
          <div className="card-h">Revenue projection — next 3 months (based on MRR from active clients)</div>
          <div className="grid md:grid-cols-3 gap-4 p-4">
            {projections.map((p: any) => {
              const net = p.projectedRevenueINR - p.projectedTrainerCostINR;
              return (
                <div key={p.month} className="rounded-xl p-4" style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)' }}>
                  <div className="text-xs font-bold mb-2" style={{ color: 'var(--accent-gold)' }}>{MONTH_LABEL(p.month)} (Projected)</div>
                  <div className="flex justify-between text-sm mb-1">
                    <span style={{ color: 'var(--brand-text-muted)' }}>Revenue</span>
                    <span style={{ color: '#22c55e' }} className="font-semibold">{FMT_INR(p.projectedRevenueINR)}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span style={{ color: 'var(--brand-text-muted)' }}>Trainer cost</span>
                    <span style={{ color: '#ef4444' }}>{FMT_INR(p.projectedTrainerCostINR)}</span>
                  </div>
                  <div className="border-t mt-2 pt-2 flex justify-between text-sm font-bold" style={{ borderColor: 'var(--brand-border)' }}>
                    <span>Net</span>
                    <span style={{ color: net >= 0 ? '#22c55e' : '#ef4444' }}>{net >= 0 ? '+' : ''}{FMT_INR(net)}</span>
                  </div>
                  <div className="text-[10px] mt-2" style={{ color: 'var(--brand-text-muted)' }}>
                    Projected from {snapshot.activeClients} active clients × avg cycle amount. Trainer cost = 3M average.
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Business health ───────────────────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">

          {/* Churn risk */}
          <div className="card">
            <div className="card-h">Churn risk breakdown</div>
            <div className="p-4 flex flex-col gap-3">
              {[
                { label: 'Red — High risk', count: snapshot.churnRisk.red, color: '#ef4444' },
                { label: 'Amber — Medium risk', count: snapshot.churnRisk.amber, color: '#f59e0b' },
                { label: 'Green — Healthy', count: snapshot.churnRisk.green, color: '#22c55e' },
                { label: 'No rating', count: snapshot.churnRisk.none, color: 'grey' },
              ].map((row) => {
                const total = snapshot.activeClients || 1;
                const pct = Math.round((row.count / total) * 100);
                return (
                  <div key={row.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{row.label}</span>
                      <span className="font-semibold" style={{ color: row.color }}>{row.count} clients ({pct}%)</span>
                    </div>
                    <div className="h-2 rounded-full" style={{ background: 'var(--bg-input)' }}>
                      <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: row.color }} />
                    </div>
                  </div>
                );
              })}
              {snapshot.revenueAtRisk > 0 && (
                <div className="mt-2 p-2.5 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  ⚠️ <span style={{ color: '#ef4444' }}>{FMT_INR(snapshot.revenueAtRisk)}/mo at risk</span> from red + amber clients
                </div>
              )}
            </div>
          </div>

          {/* Client source breakdown */}
          <div className="card">
            <div className="card-h">Client source → conversion</div>
            <div className="p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--brand-border)' }}>
                    <th className="text-left py-1">Source</th>
                    <th className="text-right py-1">Total</th>
                    <th className="text-right py-1">Active</th>
                    <th className="text-right py-1">Conv %</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(snapshot.sourceBreakdown as Record<string, { count: number; active: number }>)
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([src, { count, active }]) => {
                      const conv = Math.round((active / count) * 100);
                      return (
                        <tr key={src} style={{ borderBottom: '1px solid var(--brand-border)' }}>
                          <td className="py-1.5">{src}</td>
                          <td className="text-right py-1.5">{count}</td>
                          <td className="text-right py-1.5" style={{ color: '#22c55e' }}>{active}</td>
                          <td className="text-right py-1.5">
                            <span className="text-xs px-1.5 py-0.5 rounded"
                              style={{
                                background: conv >= 40 ? 'rgba(34,197,94,0.12)' : conv >= 20 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                                color: conv >= 40 ? '#22c55e' : conv >= 20 ? '#f59e0b' : '#ef4444',
                              }}>
                              {conv}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Revenue bar chart (simple CSS bars) ──────────────────── */}
        <div className="card mb-6">
          <div className="card-h">Revenue vs Trainer Cost — bar view</div>
          <div className="p-4 overflow-x-auto">
            <div className="flex items-end gap-2" style={{ minWidth: byMonth.length * 60 }}>
              {byMonth.map((m: any) => {
                const maxRev = Math.max(...byMonth.map((x: any) => x.revenueINR), 1);
                const revH = Math.round((m.revenueINR / maxRev) * 120);
                const costH = Math.round((m.trainerTotal / maxRev) * 120);
                const isCurrentMonth = m.month === new Date().toISOString().slice(0, 7);
                return (
                  <div key={m.month} className="flex flex-col items-center gap-1" style={{ minWidth: 52 }}>
                    <div className="flex items-end gap-0.5" style={{ height: 128 }}>
                      <div
                        title={`Revenue: ${FMT_INR(m.revenueINR)}`}
                        style={{ width: 18, height: revH, background: isCurrentMonth ? '#f59e0b' : '#22c55e', borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }}
                      />
                      <div
                        title={`Trainer cost: ${FMT_INR(m.trainerTotal)}`}
                        style={{ width: 18, height: costH, background: '#ef4444', borderRadius: '3px 3px 0 0', opacity: 0.7, transition: 'height 0.3s' }}
                      />
                    </div>
                    <div className="text-[9px] text-center" style={{ color: 'var(--brand-text-muted)' }}>{MONTH_LABEL(m.month)}</div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-2 text-[11px]" style={{ color: 'var(--brand-text-muted)' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#22c55e', borderRadius: 2, marginRight: 4 }} />Revenue</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#ef4444', borderRadius: 2, marginRight: 4 }} />Trainer cost</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#f59e0b', borderRadius: 2, marginRight: 4 }} />Current month</span>
            </div>
          </div>
        </div>

        {/* ── FX rates note ─────────────────────────────────────────── */}
        <div className="text-[11px] p-3 rounded-lg mb-6" style={{ background: 'var(--bg-input)', color: 'var(--brand-text-muted)', border: '1px solid var(--brand-border)' }}>
          <strong>FX rates used for INR consolidation:</strong>{' '}
          {Object.entries(data.fxRates as Record<string, number>).map(([c, r]) => `${c} = ₹${r}`).join(' · ')}
          {' '}· Trainer costs are always in INR (no conversion needed).
          {' '}· Revenue = payments recorded in the month. Trainer cost = sessions logged in the month (includes pending/unpaid).
        </div>

      </Page>
    </>
  );
}
