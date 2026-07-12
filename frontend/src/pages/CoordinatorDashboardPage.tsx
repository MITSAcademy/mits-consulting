/**
 * Coordinator Dashboard
 *
 * For Bhavneet (lead) and Mitali (manager):
 *   - Per-coordinator card: active clients, sessions this week, overdue renewals, open issues, pending tasks
 *   - Client list per coordinator with renewal status
 *   - Reallocation: drag a client to a different coordinator
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Pill } from '@/components/ui/pill';
import { useUI } from '@/store/ui';
import { useAuth } from '@/store/auth';
import {
  Users, CalendarDays, AlertTriangle, CheckSquare, RefreshCw, ArrowRightLeft,
  AlertCircle,
} from 'lucide-react';

interface TeamSummaryEntry {
  id: string;
  name: string;
  role: string;
  activeClients: number;
  sessionsToday: number;
  pendingTasks: number;
  escalations: number;
  atRiskClients: number;
}

function TeamOverviewCard({ coord }: { coord: TeamSummaryEntry }) {
  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[13px] flex-shrink-0"
          style={{ background: 'var(--accent-gold)', color: '#0a0c12' }}
        >
          {coord.name.charAt(0)}
        </div>
        <div>
          <div className="font-semibold text-[13px]">{coord.name}</div>
          <div className="text-[11px] muted capitalize">{coord.role.replace('_', ' ')}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg px-3 py-2 text-center" style={{ background: 'var(--bg-input)' }}>
          <div className="text-[18px] font-bold tabular-nums" style={{ color: 'var(--status-green)' }}>{coord.activeClients}</div>
          <div className="text-[10px] muted uppercase tracking-wider">Active</div>
        </div>
        <div className="rounded-lg px-3 py-2 text-center" style={{ background: 'var(--bg-input)' }}>
          <div className="text-[18px] font-bold tabular-nums" style={{ color: 'var(--accent-gold)' }}>{coord.sessionsToday}</div>
          <div className="text-[10px] muted uppercase tracking-wider">Today</div>
        </div>
        <div className="rounded-lg px-3 py-2 text-center" style={{ background: 'var(--bg-input)' }}>
          <div className="flex items-center justify-center gap-1">
            <div className="text-[18px] font-bold tabular-nums" style={{ color: coord.escalations > 0 ? 'var(--status-red)' : 'var(--brand-textMuted)' }}>{coord.escalations}</div>
            {coord.escalations > 0 && <AlertCircle size={12} style={{ color: 'var(--status-red)' }} />}
          </div>
          <div className="text-[10px] muted uppercase tracking-wider">Escalations</div>
        </div>
        <div className="rounded-lg px-3 py-2 text-center" style={{ background: 'var(--bg-input)' }}>
          <div className="text-[18px] font-bold tabular-nums" style={{ color: 'var(--brand-textSecondary)' }}>{coord.pendingTasks}</div>
          <div className="text-[10px] muted uppercase tracking-wider">Tasks</div>
        </div>
      </div>
    </div>
  );
}

interface CoordClient {
  id: string;
  name: string;
  lifecycle: string;
  nextRenewalDue: string | null;
  primaryTrainer: { name: string } | null;
}

interface CoordStats {
  activeClients: number;
  overdueRenewals: number;
  openIssues: number;
  pendingTasks: number;
  weekSessions: number;
}

interface CoordEntry {
  coordinator: { id: string; name: string; role: string };
  stats: CoordStats;
  recentSessions: Array<{ scheduledFor: string; durationMinutes: number | null; trainingName?: string; clientName?: string }>;
  clients: CoordClient[];
}

function StatChip({ icon: Icon, value, label, color }: {
  icon: React.ElementType; value: number; label: string; color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl" style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
      <div className="flex items-center gap-1">
        <Icon size={11} style={{ color }} />
        <span className="text-[18px] font-bold tabular-nums" style={{ color }}>{value}</span>
      </div>
      <span className="text-[10px] muted uppercase tracking-wider">{label}</span>
    </div>
  );
}

function ReallocateModal({ client, team, onClose }: {
  client: CoordClient & { currentOwner: string };
  team: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const options = team.filter((t) => t.id !== client.currentOwner);
  const [targetId, setTargetId] = useState(options[0]?.id || '');

  const move = useMutation({
    mutationFn: () => api.patch(`/coordinator-dashboard/reallocate/${client.id}`, { newHostOwnerId: targetId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coordinator-dashboard'] });
      showToast(`${client.name} moved`);
      onClose();
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const content = options.length === 0 ? (
    <div className="rounded-2xl p-5 w-80 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}>
      <div className="font-semibold text-[14px]">Reallocate: {client.name}</div>
      <p className="text-[13px] muted">No other coordinators available to move to.</p>
      <div className="flex justify-end"><Button onClick={onClose}>Close</Button></div>
    </div>
  ) : (
    <div className="rounded-2xl p-6 w-[340px] space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)', boxShadow: '0 24px 48px rgba(0,0,0,0.5)' }}>
      <div>
        <div className="text-[11px] uppercase tracking-wider muted mb-1">Moving client</div>
        <div className="font-semibold text-[15px]">{client.name}</div>
      </div>
      <div className="space-y-1.5">
        <label className="text-[12px] muted">Assign to coordinator</label>
        <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          {options.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </Select>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!targetId || move.isPending} onClick={() => move.mutate()}>
          {move.isPending ? 'Moving…' : 'Confirm move'}
        </Button>
      </div>
    </div>
  );

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      style={{ zIndex: 9999 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {content}
    </div>,
    document.body,
  );
}

export default function CoordinatorDashboardPage() {
  const user = useAuth((s) => s.user)!;
  const [reallocating, setReallocating] = useState<(CoordClient & { currentOwner: string }) | null>(null);

  const { data, isLoading } = useQuery<{ team: CoordEntry[]; generatedAt: string }>({
    queryKey: ['coordinator-dashboard'],
    queryFn: () => api.get('/coordinator-dashboard').then((r) => r.data),
    refetchInterval: 10 * 60_000,
  });

  const { data: teamSummaryData } = useQuery<{ coordinators: TeamSummaryEntry[] }>({
    queryKey: ['coordinator-dashboard-team-summary'],
    queryFn: () => api.get('/coordinator-dashboard/team-summary').then((r) => r.data),
    refetchInterval: 10 * 60_000,
  });

  const today = new Date().toISOString().slice(0, 10);

  const teamMembers = (data?.team || []).map((e) => ({
    id: e.coordinator.id,
    name: e.coordinator.name,
  }));

  const title = user.role === 'lead' ? 'My Team · Bhavneet' : 'Coordinator Team · Mitali';

  return (
    <>
      <Topbar
        title={title}
        subtitle={data ? `${data.team.reduce((s, e) => s + e.stats.activeClients, 0)} total active clients` : ''}
      />
      <Page>
        <div className="callout">
          Live snapshot of coordinator activity. Click "Reallocate" to move a client between coordinators.
        </div>

        {/* Team Overview — per-coordinator summary cards */}
        {teamSummaryData && teamSummaryData.coordinators.length > 0 && (
          <div className="mb-6">
            <div className="text-[11px] uppercase tracking-wider font-semibold mb-3" style={{ color: 'var(--brand-textMuted)' }}>
              Team Overview
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {teamSummaryData.coordinators.map((coord) => (
                <TeamOverviewCard key={coord.id} coord={coord} />
              ))}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="muted text-[13px] py-12 text-center">Loading team data…</div>
        ) : !data?.team || data.team.length === 0 ? (
          <div className="muted text-sm p-4 text-center">No team data available.</div>
        ) : (
          <div className="space-y-6">
            {(data?.team || []).map((entry) => {
              const { coordinator, stats, clients, recentSessions } = entry;
              const overdueClients = clients.filter(
                (c) => c.nextRenewalDue && c.nextRenewalDue < today
              );

              return (
                <div
                  key={coordinator.id}
                  className="rounded-2xl p-5"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[13px]"
                        style={{ background: 'var(--accent-gold)', color: '#0a0c12' }}
                      >
                        {coordinator.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-[14px]">{coordinator.name}</div>
                        <div className="text-[11px] muted capitalize">{coordinator.role.replace('_', ' ')}</div>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-end">
                      <StatChip icon={Users} value={stats.activeClients} label="Active" color="var(--status-green)" />
                      <StatChip icon={CalendarDays} value={stats.weekSessions} label="Sessions/wk" color="var(--accent-gold)" />
                      <StatChip icon={RefreshCw} value={stats.overdueRenewals} label="Overdue" color={stats.overdueRenewals > 0 ? 'var(--status-red)' : 'var(--brand-textMuted)'} />
                      <StatChip icon={AlertTriangle} value={stats.openIssues} label="Issues" color={stats.openIssues > 0 ? 'var(--status-amber)' : 'var(--brand-textMuted)'} />
                      <StatChip icon={CheckSquare} value={stats.pendingTasks} label="Tasks" color="var(--brand-textSecondary)" />
                    </div>
                  </div>

                  {/* Recent sessions */}
                  {recentSessions.length > 0 && (
                    <div className="mb-3">
                      <div className="text-[10px] uppercase tracking-wider muted mb-1.5">Recent sessions</div>
                      <div className="flex gap-2 flex-wrap">
                        {recentSessions.map((s, i) => (
                          <div
                            key={i}
                            className="text-[11px] px-2 py-1 rounded-lg"
                            style={{ background: 'var(--bg-input)', color: 'var(--brand-textSecondary)' }}
                          >
                            {s.clientName || s.trainingName || '—'} · {new Date(s.scheduledFor).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                            {s.durationMinutes ? ` · ${s.durationMinutes}m` : ''}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Client list */}
                  {clients.length > 0 ? (
                    <div className="table-card">
                      <table>
                        <thead>
                          <tr>
                            <th>Client</th>
                            <th>Trainer</th>
                            <th>Next renewal</th>
                            <th>Status</th>
                            {['founder', 'manager', 'lead'].includes(user.role) && <th></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {clients.map((c) => {
                            const isOverdue = c.nextRenewalDue && c.nextRenewalDue < today;
                            const isDueSoon = c.nextRenewalDue && c.nextRenewalDue >= today &&
                              c.nextRenewalDue <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
                            return (
                              <tr key={c.id}>
                                <td className="font-medium text-[13px]">{c.name}</td>
                                <td className="text-[12px] muted">{c.primaryTrainer?.name || '—'}</td>
                                <td className="mono text-[12px]">
                                  {c.nextRenewalDue
                                    ? <span style={{ color: isOverdue ? 'var(--status-red)' : isDueSoon ? 'var(--status-amber)' : 'inherit' }}>{c.nextRenewalDue}</span>
                                    : <span className="muted">—</span>}
                                </td>
                                <td>
                                  {isOverdue ? (
                                    <Pill color="red">Overdue</Pill>
                                  ) : isDueSoon ? (
                                    <Pill color="amber">Due soon</Pill>
                                  ) : (
                                    <Pill color="green">OK</Pill>
                                  )}
                                </td>
                                {['founder', 'manager', 'lead'].includes(user.role) && (
                                  <td>
                                    <button
                                      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded hover:bg-white/5"
                                      style={{ color: 'var(--accent-gold)' }}
                                      onClick={() => setReallocating({ ...c, currentOwner: coordinator.id })}
                                    >
                                      <ArrowRightLeft size={10} /> Move
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-[12px] muted py-2">No active clients assigned.</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {reallocating && (
          <ReallocateModal
            client={reallocating}
            team={teamMembers}
            onClose={() => setReallocating(null)}
          />
        )}
      </Page>
    </>
  );
}
