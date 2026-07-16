/**
 * Data integrity check — admin diagnostic tool.
 * Runs a suite of checks across the database and surfaces orphaned or
 * inconsistent records that need manual attention.
 * Visible to founder + manager only.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { ShieldAlert, ChevronDown, ChevronRight, RefreshCw, CheckCircle2, AlertTriangle, AlertOctagon, Wrench } from 'lucide-react';

interface CheckItem {
  id: string;
  label: string;
  detail: string;
}

interface Check {
  id: string;
  severity: 'critical' | 'warning';
  title: string;
  description: string;
  count: number;
  items: CheckItem[];
}

interface IntegrityResult {
  summary: {
    totalIssues: number;
    critical: number;
    warning: number;
  };
  checks: Check[];
}

function CheckCard({ check }: { check: Check }) {
  const [expanded, setExpanded] = useState(false);
  const isCritical = check.severity === 'critical';

  const borderColor = isCritical ? 'var(--status-red)' : '#f59e0b';
  const badgeBg = isCritical ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)';
  const badgeColor = isCritical ? 'var(--status-red)' : '#f59e0b';
  const Icon = isCritical ? AlertOctagon : AlertTriangle;

  return (
    <div
      className="card mb-3 p-0 overflow-hidden"
      style={{ borderLeft: `3px solid ${borderColor}` }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <Icon size={15} style={{ color: badgeColor, flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold" style={{ color: 'var(--brand-text)' }}>
              {check.title}
            </span>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: badgeBg, color: badgeColor }}
            >
              {check.count}
            </span>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide font-semibold"
              style={{ background: badgeBg, color: badgeColor }}
            >
              {check.severity}
            </span>
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--brand-textMuted)' }}>
            {check.description}
          </div>
        </div>
        <div style={{ color: 'var(--brand-textMuted)', flexShrink: 0 }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>

      {/* Expanded item list */}
      {expanded && check.items.length > 0 && (
        <div style={{ borderTop: '1px solid var(--brand-borderSoft)' }}>
          {check.items.map((item, idx) => (
            <div
              key={item.id}
              className="flex items-start gap-3 px-4 py-2"
              style={{
                borderBottom: idx < check.items.length - 1 ? '1px solid var(--brand-borderSoft)' : undefined,
                background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
              }}
            >
              <div className="text-[10px] font-mono mt-px" style={{ color: 'var(--brand-textMuted)', minWidth: 120, flexShrink: 0 }}>
                {item.id.length > 16 ? item.id.slice(0, 14) + '…' : item.id}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium" style={{ color: 'var(--brand-text)' }}>
                  {item.label}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--brand-textMuted)' }}>
                  {item.detail}
                </div>
              </div>
            </div>
          ))}
          {check.count > check.items.length && (
            <div className="px-4 py-2 text-[11px]" style={{ color: 'var(--brand-textMuted)' }}>
              Showing {check.items.length} of {check.count} — fix these first, then re-run to see more.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="card mb-3 p-4 animate-pulse" style={{ borderLeft: '3px solid var(--brand-borderSoft)' }}>
      <div className="flex items-center gap-3">
        <div className="w-4 h-4 rounded" style={{ background: 'var(--brand-borderSoft)' }} />
        <div className="flex-1">
          <div className="h-3 w-48 rounded mb-2" style={{ background: 'var(--brand-borderSoft)' }} />
          <div className="h-2 w-72 rounded" style={{ background: 'var(--brand-borderSoft)' }} />
        </div>
      </div>
    </div>
  );
}

export function IntegrityCheckPage() {
  const qc = useQueryClient();
  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery<IntegrityResult>({
    queryKey: ['integrity-check'],
    queryFn: () => api.get('/integrity-check').then((r) => r.data),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const [toolsOpen, setToolsOpen] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);
  const backfill = useMutation({
    mutationFn: () => api.post('/integrity-check/backfill').then((r) => r.data),
    onSuccess: (d) => {
      setBackfillResult(d.message);
      qc.invalidateQueries({ queryKey: ['integrity-check'] });
      refetch();
    },
  });

  const [fixOrphanResult, setFixOrphanResult] = useState<string | null>(null);
  const fixOrphanPayments = useMutation({
    mutationFn: () => api.post('/integrity-check/fix-orphan-payments').then((r) => r.data),
    onSuccess: (d) => {
      setFixOrphanResult(d.message);
      qc.invalidateQueries({ queryKey: ['integrity-check'] });
      refetch();
    },
  });

  const [fixHostsResult, setFixHostsResult] = useState<string | null>(null);
  const fixHosts = useMutation({
    mutationFn: () => api.post('/integrity-check/fix-missing-hosts').then((r) => r.data),
    onSuccess: (d) => {
      setFixHostsResult(d.message);
      qc.invalidateQueries({ queryKey: ['integrity-check'] });
      refetch();
    },
  });

  const [createTrainingsResult, setCreateTrainingsResult] = useState<string | null>(null);
  const createTrainings = useMutation({
    mutationFn: () => api.post('/integrity-check/create-missing-trainings', [
      { clientName: 'Chandana', trainerPhone: '9175591712' },
      { clientName: 'Shaik', trainerPhone: '7676955798' },
      { clientName: 'Shruthi', trainerPhone: '9987218936' },
      { clientName: 'Shalini', trainerPhone: '8074834527' },
    ]).then((r) => r.data),
    onSuccess: (d) => {
      const summary = d.results.map((r: { clientName: string; status: string; trainerFound?: string }) => `${r.clientName}(${r.trainerFound||'?'}): ${r.status}`).join(' · ');
      setCreateTrainingsResult(`${d.message} — ${summary}`);
      qc.invalidateQueries({ queryKey: ['integrity-check'] });
      refetch();
    },
  });

  const [fixFeedbackResult, setFixFeedbackResult] = useState<string | null>(null);
  const fixFeedback = useMutation({
    mutationFn: () => api.post('/integrity-check/fix-feedback-trainers').then((r) => r.data),
    onSuccess: (d) => {
      setFixFeedbackResult(d.message);
      qc.invalidateQueries({ queryKey: ['integrity-check'] });
      refetch();
    },
  });

  const [dummyResult, setDummyResult] = useState<string | null>(null);
  const deleteDummies = useMutation({
    mutationFn: () => api.delete('/integrity-check/dummy-clients').then((r) => r.data),
    onSuccess: (d) => {
      setDummyResult(d.deleted > 0 ? `Deleted ${d.deleted} dummy clients: ${d.names.join(', ')}` : 'No dummy clients found');
      qc.invalidateQueries({ queryKey: ['integrity-check'] });
      refetch();
    },
  });

  const lastRun = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  const activeChecks = data?.checks.filter((c) => c.count > 0) ?? [];
  const cleanChecks = data?.checks.filter((c) => c.count === 0) ?? [];

  return (
    <>
      <Topbar
        title="Data integrity"
        subtitle={lastRun ? `Last run at ${lastRun}` : 'Diagnostic checks across all linked records'}
        actions={
          <div className="flex items-center gap-2">
            {/* Tools panel toggle */}
            <button
              onClick={() => setToolsOpen(o => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all"
              style={{
                background: toolsOpen ? 'rgba(99,102,241,0.15)' : 'var(--bg-card)',
                borderColor: toolsOpen ? 'rgba(99,102,241,0.4)' : 'var(--brand-border)',
                color: toolsOpen ? '#a5b4fc' : 'var(--brand-textSecondary)',
              }}
            >
              <Wrench size={12} />
              Fix tools
              {toolsOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </button>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all"
              style={{
                background: 'var(--bg-card)',
                borderColor: 'var(--brand-border)',
                color: 'var(--brand-textSecondary)',
                opacity: isFetching ? 0.6 : 1,
                cursor: isFetching ? 'not-allowed' : 'pointer',
              }}
            >
              <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
              {isFetching ? 'Running…' : 'Re-run check'}
            </button>
          </div>
        }
      />

      <Page>
        {/* Fix tools panel */}
        {toolsOpen && (
          <div className="card mb-4 p-4" style={{ borderLeft: '3px solid rgba(99,102,241,0.5)' }}>
            <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'rgba(99,102,241,0.8)' }}>Fix tools — run when integrity issues are found</div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: '⚡ Auto-backfill', result: backfillResult, pending: backfill.isPending, pendingLabel: 'Backfilling…', onClick: () => { setBackfillResult(null); backfill.mutate(); }, color: '99,102,241' },
                { label: '💳 Fix orphan payments', result: fixOrphanResult, pending: fixOrphanPayments.isPending, pendingLabel: 'Fixing…', onClick: () => { setFixOrphanResult(null); fixOrphanPayments.mutate(); }, color: '234,179,8' },
                { label: '🏠 Fix missing hosts', result: fixHostsResult, pending: fixHosts.isPending, pendingLabel: 'Fixing…', onClick: () => { setFixHostsResult(null); fixHosts.mutate(); }, color: '59,130,246' },
                { label: '✨ Create missing trainings', result: createTrainingsResult, pending: createTrainings.isPending, pendingLabel: 'Creating…', onClick: () => { setCreateTrainingsResult(null); createTrainings.mutate(); }, color: '251,191,36' },
                { label: '🔗 Fix feedback trainers', result: fixFeedbackResult, pending: fixFeedback.isPending, pendingLabel: 'Fixing…', onClick: () => { setFixFeedbackResult(null); fixFeedback.mutate(); }, color: '16,185,129' },
                { label: '🗑 Delete dummy clients', result: dummyResult, pending: deleteDummies.isPending, pendingLabel: 'Deleting…', onClick: () => { setDummyResult(null); deleteDummies.mutate(); }, color: '239,68,68' },
              ].map((t) => (
                <div key={t.label} className="flex flex-col gap-1">
                  <button
                    onClick={t.onClick}
                    disabled={t.pending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all"
                    style={{
                      background: `rgba(${t.color},0.1)`,
                      borderColor: `rgba(${t.color},0.35)`,
                      color: `rgb(${t.color})`,
                      opacity: t.pending ? 0.6 : 1,
                      cursor: t.pending ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {t.pending ? t.pendingLabel : t.label}
                  </button>
                  {t.result && (
                    <span className="text-[10px] px-2 py-0.5 rounded max-w-[220px] truncate" style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--status-green)' }} title={t.result}>
                      {t.result}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary banner */}
        {data && (
          <div
            className="card mb-5 flex items-center gap-4 px-5 py-4"
            style={{
              borderLeft: `4px solid ${
                data.summary.totalIssues === 0
                  ? 'var(--status-green)'
                  : data.summary.critical > 0
                  ? 'var(--status-red)'
                  : '#f59e0b'
              }`,
            }}
          >
            {data.summary.totalIssues === 0 ? (
              <>
                <CheckCircle2 size={20} style={{ color: 'var(--status-green)', flexShrink: 0 }} />
                <div>
                  <div className="text-[14px] font-bold" style={{ color: 'var(--status-green)' }}>
                    All systems linked correctly
                  </div>
                  <div className="text-[12px] mt-0.5" style={{ color: 'var(--brand-textMuted)' }}>
                    No data integrity issues found across {data.checks.length} checks.
                  </div>
                </div>
              </>
            ) : (
              <>
                <ShieldAlert size={20} style={{ color: data.summary.critical > 0 ? 'var(--status-red)' : '#f59e0b', flexShrink: 0 }} />
                <div className="flex-1">
                  <div className="text-[14px] font-bold" style={{ color: 'var(--brand-text)' }}>
                    {data.summary.totalIssues} issue{data.summary.totalIssues !== 1 ? 's' : ''} found
                  </div>
                  <div className="flex gap-3 mt-1">
                    {data.summary.critical > 0 && (
                      <span className="text-[12px] font-semibold" style={{ color: 'var(--status-red)' }}>
                        {data.summary.critical} critical
                      </span>
                    )}
                    {data.summary.warning > 0 && (
                      <span className="text-[12px] font-semibold" style={{ color: '#f59e0b' }}>
                        {data.summary.warning} warning{data.summary.warning !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Loading skeletons */}
        {isLoading && (
          <>
            {[...Array(5)].map((_, i) => <SkeletonCard key={i} />)}
          </>
        )}

        {/* Checks with issues */}
        {!isLoading && activeChecks.length > 0 && (
          <div className="mb-6">
            <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--brand-textMuted)' }}>
              Issues to fix · {activeChecks.length} check{activeChecks.length !== 1 ? 's' : ''}
            </div>
            {activeChecks.map((check) => (
              <CheckCard key={check.id} check={check} />
            ))}
          </div>
        )}

        {/* Clean checks */}
        {!isLoading && cleanChecks.length > 0 && (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--brand-textMuted)' }}>
              Passing · {cleanChecks.length} check{cleanChecks.length !== 1 ? 's' : ''}
            </div>
            <div className="card p-0 overflow-hidden">
              {cleanChecks.map((check, idx) => (
                <div
                  key={check.id}
                  className="flex items-center gap-3 px-4 py-2.5"
                  style={{
                    borderBottom: idx < cleanChecks.length - 1 ? '1px solid var(--brand-borderSoft)' : undefined,
                  }}
                >
                  <CheckCircle2 size={13} style={{ color: 'var(--status-green)', flexShrink: 0 }} />
                  <span className="text-[12px]" style={{ color: 'var(--brand-textSecondary)' }}>
                    {check.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Page>
    </>
  );
}
