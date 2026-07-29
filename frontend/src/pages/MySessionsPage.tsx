/**
 * "My calls + sessions" — Mitali / Bhavneet / Muskan / Kashish daily home.
 *
 * Headline workflow Vaibhav wanted:
 *   1. See ALL calls scheduled for you (with scheduled time).
 *   2. Punch IN when you start the call (records actualStartAt).
 *   3. Punch OUT when you end (records actualEndAt + auto-computes duration).
 *   4. Capture feedback at end-of-call (or after).
 *
 * Plus the existing pieces:
 *   • Session tasks today (host-session workflow).
 *   • Recent completed calls + sessions.
 *   • Schedule new call / log past call / log session — all in topbar.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Pill } from '@/components/ui/pill';
import { useUI } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { todayISO, minPastDate, maxTodayDate } from '@/lib/utils';
import { EmptyState } from '@/components/EmptyState';
import {
  ClipboardList, Plus, Calendar as CalendarIcon, CheckCircle2, Phone, Play, Square,
  Clock, MessageSquare, AlertCircle, Video, Search, MessageCircle, Send, CreditCard,
  ChevronLeft, ChevronRight, UserPlus, Download, ChevronDown, MoreVertical,
  Pencil, Trash2, Flag, ExternalLink,
} from 'lucide-react';
import { formatPhone, waLink } from '@/lib/utils';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';

const MEETING_MODE_ICONS: Record<string, string> = {
  Zoom: '🎥',
  GoToMeeting: '🟢',
  Teams: '💜',
  'Google Meet': '🔵',
  Phone: '📞',
  Other: '💻',
};

function currentISOWeek(): string {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil((((now.getTime() - jan1.getTime()) / 86400000) + jan1.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function prevWeek(w: string): string {
  const m = w.match(/^(\d{4})-W(\d{1,2})$/);
  if (!m) return w;
  let [year, wk] = [parseInt(m[1]), parseInt(m[2])];
  wk--;
  if (wk < 1) { year--; wk = 52; }
  return `${year}-W${String(wk).padStart(2, '0')}`;
}

function nextWeek(w: string): string {
  const m = w.match(/^(\d{4})-W(\d{1,2})$/);
  if (!m) return w;
  let [year, wk] = [parseInt(m[1]), parseInt(m[2])];
  wk++;
  if (wk > 52) { year++; wk = 1; }
  return `${year}-W${String(wk).padStart(2, '0')}`;
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Google Calendar pre-fill — same helper as before, kept for session tasks */

function googleCalendarLink(opts: { title: string; details?: string; date?: string; timeIst?: string; durationMinutes?: number }) {
  const baseUrl = 'https://calendar.google.com/calendar/render';
  const params = new URLSearchParams({ action: 'TEMPLATE', text: opts.title });
  if (opts.details) params.set('details', opts.details);
  if (opts.date && opts.timeIst) {
    const [hh, mm] = opts.timeIst.split(':').map(Number);
    const start = new Date(`${opts.date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+05:30`);
    const end = new Date(start.getTime() + (opts.durationMinutes || 60) * 60_000);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    params.set('dates', `${fmt(start)}/${fmt(end)}`);
  }
  return `${baseUrl}?${params.toString()}`;
}

/* ──────────────────────────────────────────────────────────────────────── */

interface ScheduledCall {
  id: string;
  kind: string;
  outcome: string | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'missed';
  scheduledFor: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  durationMinutes: number | null;
  feedback: string | null;
  notes: string | null;
  client: { id: string; name: string };
}

function timeLabel(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function dateLabel(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

export function MySessionsPage() {
  const user = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);

  const isAM = user.role === 'account_manager' || user.role === 'lead' || user.role === 'manager' || user.role === 'founder';
  const today = todayISO();
  const sevenAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); })();

  // AM session sheet — active clients with upcoming training sessions
  const { data: mySessions, isLoading: mySessionsLoading } = useQuery({
    queryKey: ['my-sessions-sheet', user.id],
    queryFn: () => api.get('/regular-trainings/my-sessions').then((r) => r.data),
    enabled: isAM,
  });

  // Today + upcoming scheduled/in-progress calls owned by me.
  const { data: scheduledCalls } = useQuery<ScheduledCall[]>({
    queryKey: ['call-logs', { mine: true, scheduledOnly: true }],
    queryFn: () => api.get('/call-logs', { params: { mine: true, scheduledOnly: true } }).then((r) => r.data),
    refetchInterval: 5 * 60_000,
  });

  // Recently completed calls (last 7 days, mine).
  const { data: recentCalls } = useQuery<ScheduledCall[]>({
    queryKey: ['call-logs', { mine: true, status: 'completed' }],
    queryFn: () => api.get('/call-logs', { params: { mine: true, status: 'completed', limit: 50 } }).then((r) => r.data),
  });

  // Session tasks I own — unchanged.
  const { data: tasks } = useQuery({
    queryKey: ['tasks', { type: 'SESSION', owner: user.id }],
    queryFn: () => api.get('/tasks', { params: { ownerId: user.id, type: 'SESSION' } }).then((r) => r.data),
  });
  const { data: recentLogs } = useQuery({
    queryKey: ['session-logs', { ownerSince: sevenAgo }],
    queryFn: () => api.get('/session-logs', { params: { dateFrom: sevenAgo } }).then((r) => r.data),
  });

  const { data: retrospectiveRows } = useQuery({
    queryKey: ['retrospective'],
    queryFn: () => api.get('/retrospective').then((r) => r.data),
    enabled: isAM,
  });

  const { data: amUsers } = useQuery({
    queryKey: ['users', 'account_managers'],
    queryFn: () => api.get('/users').then((r) => r.data),
    select: (data: any[]) => data.filter((u) => u.role === 'account_manager'),
    enabled: isAM,
  });
  const AM_HOSTS_DIALOG = amUsers || [];

  const todayTasks = (tasks || []).filter((t: any) => t.dueDate === today && t.status !== 'Done');
  const overdueTasks = (tasks || []).filter((t: any) => t.dueDate && t.dueDate < today && t.status !== 'Done');

  // Bucket scheduled calls
  const calls = scheduledCalls || [];
  const nowMs = Date.now();
  const inProgress = calls.filter((c) => c.status === 'in_progress');
  const scheduledToday = calls.filter((c) => c.status === 'scheduled' && c.scheduledFor && new Date(c.scheduledFor).toDateString() === new Date().toDateString());
  const overdueCalls = calls.filter((c) => c.status === 'scheduled' && c.scheduledFor && new Date(c.scheduledFor).getTime() < nowMs && new Date(c.scheduledFor).toDateString() !== new Date().toDateString());
  const upcomingCalls = calls.filter((c) => c.status === 'scheduled' && c.scheduledFor && new Date(c.scheduledFor).getTime() > nowMs && new Date(c.scheduledFor).toDateString() !== new Date().toDateString());

  const markTaskDone = useMutation({
    mutationFn: (id: string) => api.patch(`/tasks/${id}`, { status: 'Done', completedAt: today }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); showToast('Marked done'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const [tab, setTab] = useState<'sessions' | 'activities' | 'payment' | 'retrospective'>('sessions');
  const [search, setSearch] = useState('');
  const searchLower = search.trim().toLowerCase();
  const [sendingSheet, setSendingSheet] = useState(false);
  const [showSendConfirm, setShowSendConfirm] = useState(false);

  async function sendDailySheet() {
    const rows: any[] = mySessions || [];
    if (rows.length === 0) { showToast('No sessions to send', 'error'); return; }
    setSendingSheet(true);
    const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    try {
      await api.post('/regular-trainings/my-sessions/send-daily', { rows, dateLabel: dateStr });
      const csvLines = ['Client,Trainer,Skills,Host,Time,Tool,Session Happened,Comment'];
      rows.forEach((t: any) => {
        const esc = (v: string) => `"${(v || '').replace(/"/g, '""')}"`;
        csvLines.push([
          esc(t.client?.name), esc(t.trainer?.name), esc(t.trainer?.skills),
          esc(t.temporaryHost?.name || t.hostedByDefault?.name),
          esc(t.scheduledTimeIST), esc(t.meetingTool), esc(t.lastSessionStatus), esc(t.lastSessionComment),
        ].join(','));
      });
      const blob = new Blob([csvLines.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `session-sheet-${today}.csv`; a.click();
      URL.revokeObjectURL(url);
      showToast('Daily sheet emailed to team + CSV saved');
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Send failed', 'error');
    } finally {
      setSendingSheet(false);
      setShowSendConfirm(false);
    }
  }
  const filteredSessions = searchLower
    ? (mySessions || []).filter((t: any) =>
        t.client?.name?.toLowerCase().includes(searchLower) ||
        t.trainer?.name?.toLowerCase().includes(searchLower) ||
        t.trainer?.skills?.toLowerCase().includes(searchLower))
    : (mySessions || []);

  const sessionCount = filteredSessions.length;

  // Trainings with no linked client record — data integrity issue
  const unlinkedTrainings = useMemo(() =>
    (mySessions || []).filter((t: any) => !t.client),
  [mySessions]);

  return (
    <>
      <Topbar
        title="My sessions"
        subtitle={isAM
          ? `${sessionCount} active training${sessionCount !== 1 ? 's' : ''} · ${inProgress.length} live call${inProgress.length !== 1 ? 's' : ''}`
          : `${inProgress.length} live · ${scheduledToday.length} today · ${overdueCalls.length} overdue`}
        actions={
          <>
            {isAM && (
              <div className="relative">
                <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 muted pointer-events-none" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search client / trainer…"
                  className="pl-7 pr-3 py-1.5 text-xs rounded-lg"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--brand-text)', width: 190, outline: 'none' }}
                />
              </div>
            )}
            {isAM && (mySessions || []).length > 0 && (
              <Button size="sm" variant="primary" onClick={() => setShowSendConfirm(true)} title="Send daily sheet to team (compulsory)">
                <Send size={13}/> Send daily sheet
              </Button>
            )}
            <ScheduleCallButton onCreated={() => qc.invalidateQueries({ queryKey: ['call-logs'] })} />
            {!isAM && <LogSessionButton onCreated={() => qc.invalidateQueries({ queryKey: ['session-logs'] })} />}
          </>
        }
      />
      <Page>
        {/* ── Tabs ── */}
        <div className="flex gap-1 mb-5 p-1 rounded-xl" style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', width: 'fit-content' }}>
          {([
            { key: 'sessions' as const,  label: 'Sessions',  count: (isAM ? sessionCount : 0) + inProgress.length + scheduledToday.length + overdueCalls.length },
            { key: 'activities' as const, label: 'Activities', count: (recentCalls || []).length + (recentLogs || []).length },
            ...(isAM ? [{ key: 'payment' as const, label: 'Weekly Payment', count: null as null }] : []),
            ...(isAM ? [{ key: 'retrospective' as const, label: 'Retrospective', count: null as null }] : []),
          ]).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all"
              style={tab === key
                ? { background: '#2563eb', color: '#ffffff', border: 'none', cursor: 'pointer', boxShadow: '0 1px 4px rgba(37,99,235,0.3)' }
                : { background: 'transparent', color: 'var(--brand-textMuted)', border: 'none', cursor: 'pointer' }}
            >
              {label}{count != null && count > 0 ? <span className="ml-1.5 text-[11px] opacity-75">({count})</span> : null}
            </button>
          ))}
        </div>

        {/* ── Tab: Weekly Payment ── */}
        {tab === 'payment' && isAM && <WeeklyPaymentSummary />}

        {/* ── Tab: Sessions (trainings sheet + calls merged) ── */}
        {tab === 'sessions' && (
          <>
            {/* Training sheet for AM/lead/manager/founder */}
            {isAM && (
              <div className="mb-6">
                {mySessionsLoading ? (
                  <div className="muted text-sm py-8 text-center">Loading…</div>
                ) : sessionCount === 0 ? (
                  <div className="rounded-xl p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}>
                    <Video size={28} style={{ color: 'var(--accent-gold)', margin: '0 auto 8px' }} />
                    <div className="text-[13px] font-semibold" style={{ color: 'var(--brand-text)' }}>No sessions assigned to you yet</div>
                    <div className="text-[12px] muted mt-1">Sessions will appear here once Bhavneet / Mitali allocates calls to you from Regular Trainings.</div>
                  </div>
                ) : (
                  <>
                    {unlinkedTrainings.length > 0 && (
                      <div className="mb-3 px-4 py-3 rounded-xl flex items-start gap-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)' }}>
                        <span style={{ fontSize: 16 }}>🔗</span>
                        <div>
                          <div className="font-bold text-[12px]" style={{ color: '#b91c1c' }}>
                            {unlinkedTrainings.length} training{unlinkedTrainings.length > 1 ? 's' : ''} not linked to a client record:
                            {' '}{unlinkedTrainings.map((t: any) => t.name).join(', ')}
                          </div>
                          <div className="text-[11px] mt-0.5" style={{ color: '#991b1b' }}>
                            This causes duplicate-name confusion and missing phone numbers. Please go to Regular Trainings → edit each one → link it to the correct client.
                          </div>
                        </div>
                      </div>
                    )}
                    <AMSheetTable
                      rows={filteredSessions}
                      onChanged={() => qc.invalidateQueries({ queryKey: ['my-sessions-sheet'] })}
                    />
                  </>
                )}
              </div>
            )}
            {inProgress.length > 0 && (
              <Section title={`Live calls (${inProgress.length})`} tone="green">
                {inProgress.map((c) => <CallRow key={c.id} c={c} />)}
              </Section>
            )}
            {overdueCalls.length > 0 && (
              <Section title={`Overdue calls (${overdueCalls.length})`} tone="red">
                {overdueCalls.map((c) => <CallRow key={c.id} c={c} />)}
              </Section>
            )}
            <Section title={`Calls today (${scheduledToday.length})`} tone="amber">
              {scheduledToday.length === 0 ? (
                <div className="muted text-[12px] py-2">No calls scheduled for today. Use + Schedule call to plan one.</div>
              ) : (
                scheduledToday
                  .sort((a, b) => (a.scheduledFor || '').localeCompare(b.scheduledFor || ''))
                  .map((c) => <CallRow key={c.id} c={c} />)
              )}
            </Section>
            {upcomingCalls.length > 0 && (
              <Section title={`Upcoming calls (${upcomingCalls.length})`} tone="grey">
                {upcomingCalls.slice(0, 10).map((c) => <CallRow key={c.id} c={c} />)}
              </Section>
            )}
            {!isAM && overdueTasks.length > 0 && (
              <Section title={`Overdue session tasks (${overdueTasks.length})`} tone="red">
                {overdueTasks.map((t: any) => <TaskRow key={t.id} t={t} onDone={() => markTaskDone.mutate(t.id)} />)}
              </Section>
            )}
            {!isAM && todayTasks.length > 0 && (
              <Section title={`Session tasks today (${todayTasks.length})`} tone="amber">
                {todayTasks.map((t: any) => <TaskRow key={t.id} t={t} onDone={() => markTaskDone.mutate(t.id)} />)}
              </Section>
            )}
          </>
        )}

        {/* ── Tab: Activities ── */}
        {tab === 'activities' && (
          <>
            <Section title={`Completed calls — last 7 days (${(recentCalls || []).length})`} tone="grey">
              {(recentCalls || []).length === 0 ? (
                <div className="muted text-[12px] py-2">No calls completed yet.</div>
              ) : (
                <div className="table-card">
                  <table>
                    <thead><tr><th>When</th><th>Client</th><th>Kind</th><th>Duration</th><th>Outcome</th><th>Feedback</th></tr></thead>
                    <tbody>
                      {(recentCalls || []).slice(0, 20).map((c) => (
                        <tr key={c.id}>
                          <td className="mono text-[11.5px]">{dateLabel(c.actualEndAt || c.scheduledFor)} {timeLabel(c.actualEndAt || c.scheduledFor)}</td>
                          <td><Link to={`/clients/${c.client.id}`} className="font-medium hover:underline">{c.client.name}</Link></td>
                          <td><Pill color={c.kind === 'feedback' ? 'blue' : c.kind === 'leverage' ? 'purple' : c.kind === 'escalation' ? 'red' : 'grey'}>{c.kind}</Pill></td>
                          <td className="mono">{c.durationMinutes ? `${c.durationMinutes}m` : <span className="muted">—</span>}</td>
                          <td>{c.outcome || <span className="muted">—</span>}</td>
                          <td className="text-[11px]">{(c.feedback || c.notes || '—').slice(0, 60)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
            <Section title={`Hosted sessions — last 7 days (${(recentLogs || []).length})`} tone="grey">
              {(recentLogs || []).length === 0 ? (
                <div className="muted text-[12px] py-2">No sessions logged yet this week.</div>
              ) : (
                <div className="table-card">
                  <table>
                    <thead><tr><th>Date</th><th>Client</th><th>Trainer</th><th>Hours</th><th>Status</th></tr></thead>
                    <tbody>
                      {(recentLogs || []).slice(0, 20).map((l: any) => (
                        <tr key={l.id}>
                          <td className="mono">{l.date}</td>
                          <td>{l.client?.name || '—'}</td>
                          <td>{l.trainer?.name || '—'}</td>
                          <td className="mono">{l.hours}h</td>
                          <td><Pill color={l.status === 'Paid' ? 'green' : l.status === 'PaymentApproved' ? 'blue' : 'grey'}>{l.status}</Pill></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </>
        )}

        {/* ── Tab: Retrospective ── */}
        {tab === 'retrospective' && isAM && (
          <RetrospectiveSection rows={retrospectiveRows || []} />
        )}
      </Page>

      {/* ── Compulsory daily sheet send confirmation ── */}
      {showSendConfirm && (
        <Dialog open onOpenChange={(v) => !v && setShowSendConfirm(false)}>
          <DialogContent title="Send daily session sheet" description="This will email today's session sheet to the team. This action is logged.">
            <div className="rounded-lg px-4 py-3 text-[12px]" style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}>
              <div className="font-semibold mb-1" style={{ color: 'var(--brand-text)' }}>Recipients</div>
              <div className="muted">To: {AM_HOSTS_DIALOG.map((u: any) => u.name).join(', ') || 'Account managers'}</div>
              <div className="muted">CC: Team leads</div>
              <div className="mt-2 font-semibold" style={{ color: 'var(--brand-text)' }}>{(mySessions || []).length} sessions will be included</div>
            </div>
            <DialogFooter>
              <Button onClick={() => setShowSendConfirm(false)}>Cancel</Button>
              <Button variant="primary" disabled={sendingSheet} onClick={sendDailySheet}>
                <Send size={12}/> {sendingSheet ? 'Sending…' : 'Send now'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function Section({ title, tone, children }: { title: string; tone: 'red' | 'amber' | 'green' | 'grey'; children: React.ReactNode }) {
  const color =
    tone === 'red'   ? 'var(--status-red)' :
    tone === 'amber' ? 'var(--status-amber)' :
    tone === 'green' ? 'var(--status-green)' :
    'var(--brand-textMuted)';
  return (
    <div className="mb-5">
      <div
        className="text-[11px] uppercase tracking-[0.14em] font-bold mb-2.5 flex items-center gap-2"
        style={{ color }}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: color, boxShadow: `0 0 8px ${color}` }}
        />
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

/* ──────────────────────────────── Call Row ─────────────────────────────── */

function CallRow({ c }: { c: ScheduledCall }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);

  // Live timer while in_progress
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (c.status !== 'in_progress') return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [c.status]);
  const liveDuration = c.actualStartAt
    ? Math.floor((Date.now() - new Date(c.actualStartAt).getTime()) / 1000)
    : 0;

  const start = useMutation({
    mutationFn: () => api.post(`/call-logs/${c.id}/start`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['call-logs'] }); showToast('Call started — timer running'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const [endOpen, setEndOpen] = useState(false);

  const isLive = c.status === 'in_progress';
  const isScheduled = c.status === 'scheduled';
  const isLate = isScheduled && c.scheduledFor && new Date(c.scheduledFor).getTime() < Date.now();

  return (
    <>
      <div
        className="rounded-xl p-3.5 flex justify-between items-start gap-3 flex-wrap transition-all hover-lift"
        style={{
          background: isLive
            ? 'linear-gradient(90deg, rgba(74,222,128,0.06) 0%, var(--bg-card) 60%)'
            : isLate
            ? 'linear-gradient(90deg, rgba(239,68,68,0.06) 0%, var(--bg-card) 60%)'
            : 'var(--bg-card)',
          border: `1px solid ${isLive ? 'rgba(74,222,128,0.40)' : isLate ? 'rgba(239,68,68,0.30)' : 'var(--brand-border)'}`,
          borderLeft: `3px solid ${isLive ? 'var(--status-green)' : isLate ? 'var(--status-red)' : 'var(--accent-gold)'}`,
          boxShadow: isLive ? '0 4px 16px rgba(74,222,128,0.10)' : isLate ? '0 4px 16px rgba(239,68,68,0.08)' : 'var(--shadow-sm)',
        }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={`/clients/${c.client.id}`} className="font-semibold text-[13px] hover:underline">{c.client.name}</Link>
            <Pill color={c.kind === 'feedback' ? 'blue' : c.kind === 'leverage' ? 'purple' : c.kind === 'escalation' ? 'red' : 'grey'}>{c.kind}</Pill>
            {isLive && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(74,222,128,0.18)', color: 'var(--status-green)' }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--status-green)', animation: 'pulse 1.4s ease-in-out infinite' }} />
                LIVE · {Math.floor((liveDuration + tick * 0) / 60)}:{String((liveDuration + tick * 0) % 60).padStart(2, '0')}
              </span>
            )}
          </div>
          <div className="text-[11px] muted mt-0.5 flex items-center gap-2 flex-wrap">
            <Clock size={11}/>
            <span>scheduled: {c.scheduledFor ? `${dateLabel(c.scheduledFor)} ${timeLabel(c.scheduledFor)}` : '—'}</span>
            {c.actualStartAt && <span>· started {timeLabel(c.actualStartAt)}</span>}
            {c.notes && <span>· {c.notes.slice(0, 60)}</span>}
          </div>
        </div>
        <div className="flex gap-1.5 items-center">
          {isScheduled && (
            <Button size="sm" variant="success" onClick={() => start.mutate()} disabled={start.isPending}>
              <Play size={11}/> {start.isPending ? '…' : 'Start call'}
            </Button>
          )}
          {isLive && (
            <Button size="sm" variant="danger" onClick={() => setEndOpen(true)}>
              <Square size={11}/> End + feedback
            </Button>
          )}
          {isScheduled && (
            <a
              href={googleCalendarLink({
                title: `${c.client.name} · ${c.kind}`,
                details: c.notes || '',
                date: c.scheduledFor ? c.scheduledFor.slice(0, 10) : undefined,
                timeIst: c.scheduledFor ? new Date(c.scheduledFor).toISOString().slice(11, 16) : undefined,
                durationMinutes: 30,
              })}
              target="_blank"
              rel="noreferrer"
            >
              <Button size="sm" title="Open Google Calendar pre-filled — saves to your own calendar">
                <CalendarIcon size={11}/>
              </Button>
            </a>
          )}
        </div>
      </div>
      {endOpen && <EndCallModal call={c} onClose={() => setEndOpen(false)} />}
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
    </>
  );
}

/* ──────────────────────────── End-call + feedback modal ─────────────── */

function EndCallModal({ call, onClose }: { call: ScheduledCall; onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [outcome, setOutcome] = useState('answered');
  const [feedback, setFeedback] = useState('');

  const end = useMutation({
    mutationFn: () => api.post(`/call-logs/${call.id}/end`, { outcome, feedback }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['call-logs'] });
      showToast('Call ended · feedback saved');
      onClose();
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const minsSinceStart = call.actualStartAt
    ? Math.max(1, Math.floor((Date.now() - new Date(call.actualStartAt).getTime()) / 60_000))
    : null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`End call · ${call.client.name}`} description={minsSinceStart ? `${minsSinceStart} min elapsed since start` : 'End the call + capture feedback'}>
        <div className="form-row">
          <Label>Outcome</Label>
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="answered">Answered</option>
            <option value="completed">Completed</option>
            <option value="no_pickup">No pickup</option>
            <option value="rescheduled">Rescheduled</option>
            <option value="escalated">Escalated</option>
          </Select>
        </div>
        <div className="form-row">
          <Label>Feedback / notes from the call</Label>
          <Textarea
            rows={4}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="What did the client say? Any commitments, blockers, next steps."
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={end.isPending} onClick={() => end.mutate()}>
            {end.isPending ? 'Saving…' : 'End call'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────── Schedule call button ──────────────────── */

function ScheduleCallButton({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const showToast = useUI((s) => s.showToast);
  const [form, setForm] = useState({ clientId: '', kind: 'checkin', date: todayISO(), time: '10:00', notes: '' });

  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get('/clients').then((r) => r.data),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () => {
      // Combine date + time into an IST ISO string (+05:30 offset).
      const isoLocal = `${form.date}T${form.time}:00+05:30`;
      return api.post('/call-logs/schedule', {
        clientId: form.clientId,
        scheduledFor: new Date(isoLocal).toISOString(),
        kind: form.kind,
        notes: form.notes || null,
      });
    },
    onSuccess: () => {
      setOpen(false);
      onCreated();
      showToast('Call scheduled');
      setForm({ clientId: '', kind: 'checkin', date: todayISO(), time: '10:00', notes: '' });
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary"><Phone size={12}/> Schedule call</Button>
      </DialogTrigger>
      <DialogContent
        title="Schedule a call"
        description="Plan a call so it appears on your dashboard at the scheduled time. Punch in when you start, punch out + capture feedback when done."
      >
        <div className="grid md:grid-cols-2 gap-2">
          <div className="form-row">
            <Label>Client *</Label>
            <Select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
              <option value="">— pick —</option>
              {(clients || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="form-row">
            <Label>Kind</Label>
            <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="checkin">Check-in</option>
              <option value="feedback">Feedback</option>
              <option value="leverage">Leverage / referral ask</option>
              <option value="escalation">Escalation</option>
            </Select>
          </div>
          <div className="form-row">
            <Label>Date *</Label>
            <Input type="date" value={form.date} min={minPastDate()} max={maxTodayDate()} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="form-row">
            <Label>Time (IST) *</Label>
            <Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <Label>Pre-call notes (optional)</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Topics to cover, context from previous calls, etc." />
        </div>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!form.clientId || create.isPending}
            disabledReason={!form.clientId ? 'Pick a client first' : null}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Scheduling…' : 'Schedule call'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────── Session task row + button ──────────────── */

function TaskRow({ t, onDone }: { t: any; onDone: () => void }) {
  const calLink = googleCalendarLink({
    title: t.title || 'MITS session',
    details: [
      t.client?.name && `Client: ${t.client.name}`,
      t.trainer?.name && `Trainer: ${t.trainer.name}`,
    ].filter(Boolean).join('\n'),
    date: t.dueDate,
    durationMinutes: Math.max(30, Math.round((t.estimatedHours || 1) * 60)),
  });
  return (
    <div className="rounded-lg p-3 flex justify-between items-start gap-3 flex-wrap" style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-[13px]">{t.title}</div>
        <div className="text-[11px] muted mt-0.5">
          {t.dueDate && <>due {t.dueDate} · </>}
          {t.client?.name && <>client: {t.client.name} · </>}
          {t.trainer?.name && <>trainer: {t.trainer.name} · </>}
          {t.estimatedHours && <>{t.estimatedHours}h</>}
        </div>
      </div>
      <div className="flex gap-1.5 items-center">
        <a href={calLink} target="_blank" rel="noreferrer">
          <Button size="sm"><CalendarIcon size={11}/> Calendar</Button>
        </a>
        <Button size="sm" variant="success" onClick={onDone}><CheckCircle2 size={11}/> Hosted</Button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * AM Sheet — flat table matching the reference Google Sheet exactly.
 * Columns: Clients | Trainers | Skills | Permanent | Temporary | Tool | Time
 *          | Session Happened | Comments | Actions
 * Row color: red bg when lastSessionComment has content, plain otherwise.
 * ─────────────────────────────────────────────────────────────────────────*/

const SESSION_STATUS_OPTIONS = [
  { value: '', label: '— not set —' },
  { value: 'Yes-Proper session', label: 'Yes — Proper session' },
  { value: 'No', label: 'No' },
  { value: 'Partial', label: 'Partial' },
  { value: 'Rescheduled', label: 'Rescheduled' },
  { value: 'Awaiting confirmation', label: 'Awaiting client confirmation' },
  { value: 'Client confirming date', label: 'Client will confirm next date' },
  { value: 'Scheduled future', label: 'Scheduled for future date' },
  { value: 'Client unavailable', label: 'Client unavailable (temporary)' },
];

const TOOL_OPTIONS = ['Zoom', 'GoToMeeting', 'Teams', 'Google Meet', 'Phone', 'Other'];

function AMSheetTable({ rows, onChanged }: { rows: any[]; onChanged: () => void }) {
  // Detect duplicate client names for phone-suffix disambiguation
  const clientNameCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of rows) {
      const name = t.client?.name || t.name;
      if (name) counts[name] = (counts[name] || 0) + 1;
    }
    return counts;
  }, [rows]);

  // Build unique trainer list from this coordinator's sessions (with phone + email)
  const coordinatorTrainers = useMemo(() => {
    const seen = new Set<string>();
    const list: any[] = [];
    for (const t of rows) {
      if (t.trainer && !seen.has(t.trainer.id)) {
        seen.add(t.trainer.id);
        list.push({ id: t.trainer.id, name: t.trainer.name, email: t.trainer.email || '', phoneCode: t.trainer.phoneCode || '', phoneDigits: t.trainer.phoneDigits || '' });
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);
  const TH = ({ children, w }: { children: React.ReactNode; w?: string }) => (
    <th
      className="text-left px-2 py-2 font-bold text-[10px] uppercase tracking-[0.08em] whitespace-nowrap"
      style={{ color: '#fff', background: '#1a3a5c', borderRight: '1px solid rgba(255,255,255,0.15)', width: w }}
    >
      {children}
    </th>
  );

  const unassigned = rows.filter((t: any) => !t.hostedByDefault);
  const assigned   = rows.filter((t: any) =>  t.hostedByDefault);

  return (
    <div className="space-y-4">
      {unassigned.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: 'var(--status-amber)', boxShadow: '0 0 6px var(--status-amber)' }} />
            <span className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--status-amber)' }}>
              New clients — assign a host ({unassigned.length})
            </span>
          </div>
          <div className="rounded-xl overflow-hidden" style={{ border: '2px solid rgba(251,191,36,0.4)', boxShadow: '0 0 12px rgba(251,191,36,0.1)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse', minWidth: 900 }}>
                <thead><tr><TH w="14%">Clients</TH><TH w="11%">Trainers</TH><TH w="12%">Skills</TH><TH w="8%">Host</TH><TH w="5%">Tool</TH><TH w="6%">Time</TH><TH w="13%">Session Happened</TH><TH w="5%">Mood</TH><TH w="11%">Comments</TH><TH w="12%">Actions</TH></tr></thead>
                <tbody>{unassigned.map((t: any) => <AMSheetRow key={t.id} t={t} onChanged={onChanged} coordinatorTrainers={coordinatorTrainers} />)}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr>
                <TH w="14%">Clients</TH>
                <TH w="11%">Trainers</TH>
                <TH w="12%">Skills</TH>
                <TH w="8%">Host</TH>
                <TH w="5%">Tool</TH>
                <TH w="6%">Time</TH>
                <TH w="13%">Session Happened</TH>
                <TH w="5%">Mood</TH>
                <TH w="11%">Comments</TH>
                <TH w="12%">Actions</TH>
              </tr>
            </thead>
            <tbody>
              {assigned.map((t: any) => (
                <AMSheetRow key={t.id} t={t} onChanged={onChanged} coordinatorTrainers={coordinatorTrainers} clientNameCounts={clientNameCounts} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


function AMSheetRow({ t, onChanged, coordinatorTrainers, clientNameCounts }: { t: any; onChanged: () => void; coordinatorTrainers?: any[]; clientNameCounts?: Record<string, number> }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const rowUser = useAuth((s) => s.user)!;
  const hasComment = !!(t.lastSessionComment && t.lastSessionComment.trim());
  const isUnassigned = !t.hostedByDefault;

  const { data: amUsersRow } = useQuery({
    queryKey: ['users', 'account_managers'],
    queryFn: () => api.get('/users').then((r) => r.data),
    select: (data: any[]) => data.filter((u) => u.role === 'account_manager'),
  });
  const AM_HOSTS = amUsersRow || [];

  const rowBg = isUnassigned ? 'rgba(251,191,36,0.07)' : hasComment ? 'rgba(200,30,30,0.82)' : 'var(--bg-card)';
  const rowColor = hasComment ? '#fff' : 'var(--brand-text)';
  const cellBorder = isUnassigned ? '1px solid rgba(251,191,36,0.25)' : '1px solid rgba(255,255,255,0.10)';

  // inline-edit state
  const [editField, setEditField] = useState<'client' | 'trainer' | 'skills' | 'time' | null>(null);
  const [editVal, setEditVal] = useState('');
  const [trainerReason, setTrainerReason] = useState('');
  const [commentVal, setCommentVal] = useState(t.lastSessionComment || '');
  const [editingComment, setEditingComment] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [removeReason, setRemoveReason] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [flagFreelanceId, setFlagFreelanceId] = useState<string | null>(null);
  const [flagFreelanceSkill, setFlagFreelanceSkill] = useState('');
  const [flagFreelanceTimings, setFlagFreelanceTimings] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  // trainers list for trainer picker
  const { data: allTrainers } = useQuery({
    queryKey: ['trainers', 'sheet-picker'],
    queryFn: () => api.get('/trainers').then((r) => r.data),
    enabled: editField === 'trainer',
    staleTime: 300_000,
  });

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const updateField = useMutation({
    mutationFn: (data: Record<string, any>) => api.patch(`/regular-trainings/trainings/${t.id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-sessions-sheet'] }); onChanged(); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const removeTraining = useMutation({
    mutationFn: async () => {
      await api.patch(`/regular-trainings/trainings/${t.id}`, { status: 'inactive' });
      await api.post('/retrospective', {
        sourceType: 'training',
        sourceId: t.id,
        clientName: t.client?.name || t.name,
        trainerName: t.trainer?.name || null,
        reason: removeReason || null,
        sessionDate: new Date().toISOString().slice(0, 10),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-sessions-sheet'] });
      qc.invalidateQueries({ queryKey: ['retrospective'] });
      onChanged();
      showToast(`${t.client?.name || t.name} removed — logged to Retrospective`);
      setShowRemoveConfirm(false);
      setRemoveReason('');
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const statusColor = !t.lastSessionStatus
    ? (hasComment ? 'rgba(255,255,255,0.7)' : 'var(--brand-textMuted)')
    : t.lastSessionStatus === 'Yes-Proper session' ? (hasComment ? '#90ff90' : 'var(--status-green)')
    : t.lastSessionStatus === 'No' ? (hasComment ? '#ffaaaa' : 'var(--status-red)')
    : (hasComment ? '#ffd080' : 'var(--status-amber)');

  const clientWa = t.client?.whatsappGroupLink
    ? t.client.whatsappGroupLink
    : (t.client?.phoneCode && t.client?.phoneDigits ? waLink(t.client.phoneCode, t.client.phoneDigits) : null);
  const trainerWa = t.trainer?.whatsappGroupLink
    || (t.trainer?.phoneCode && t.trainer?.phoneDigits ? waLink(t.trainer.phoneCode, t.trainer.phoneDigits) : null);

  const cell = { color: rowColor, borderRight: cellBorder, borderBottom: cellBorder };

  function startEdit(field: 'client' | 'trainer' | 'skills') {
    setEditField(field);
    setEditVal(field === 'client' ? (t.client?.name || t.name || '') : field === 'trainer' ? (t.trainer?.id || '') : (t.trainer?.skills || ''));
  }
  function cancelEdit() { setEditField(null); setEditVal(''); setTrainerReason(''); }

  function InlineEditIcon({ field }: { field: 'client' | 'trainer' | 'skills' }) {
    return (
      <button onClick={() => startEdit(field)} title={`Edit ${field}`}
        className="inline-flex ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-textMuted)', padding: 0 }}>
        <Pencil size={10} />
      </button>
    );
  }

  return (
    <>
      <tr style={{ background: rowBg }} className="group">
        {/* Client */}
        <td className="px-2 py-2" style={cell}>
          {editField === 'client' ? (
            <div className="flex gap-1 items-center">
              <input autoFocus className="flex-1 text-[11px] rounded px-1.5 py-0.5 min-w-0"
                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', outline: 'none' }}
                value={editVal} onChange={(e) => setEditVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { updateField.mutate({ name: editVal }); cancelEdit(); }
                  if (e.key === 'Escape') cancelEdit();
                }} />
              <button onClick={() => { updateField.mutate({ name: editVal }); cancelEdit(); }} style={{ color: '#90ff90', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13 }}>✓</button>
              <button onClick={cancelEdit} style={{ color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13 }}>✕</button>
            </div>
          ) : (
            <div className="flex items-start gap-1">
              <div>
                <div className="flex items-center gap-1">
                  {(() => {
                    const baseName = t.client?.name || t.name || '—';
                    const isDupe = (clientNameCounts?.[baseName] ?? 0) > 1;
                    // Always use trainer name for duplicates — phone can be same when same client has 2 trainings
                    const suffix = isDupe && t.trainer?.name
                      ? ` (${t.trainer.name.split(' ')[0]})`
                      : '';
                    return t.client
                      ? <Link to={`/clients/${t.client.id}`} className="font-semibold hover:underline" style={{ color: rowColor }}>{baseName + suffix}</Link>
                      : <span className="font-semibold">{baseName + suffix}</span>;
                  })()}
                  {t.dailyNotes && <span title={t.dailyNotes} style={{ fontSize: 12, cursor: 'default' }}>📝</span>}
                </div>
                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                  <span className="inline-block px-1.5 py-0 rounded text-[10px] font-semibold"
                    style={{ background: 'rgba(99,179,237,0.2)', color: '#63b3ed' }}>
                    Coordinator
                  </span>
                  <span className="text-[10px]" style={{ opacity: 0.6 }}>{t.completedSessionCount ?? 0}/4</span>
                  {t.demoEscalationRequested && <span className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[10px] font-bold" style={{ background: 'rgba(239,68,68,0.25)', color: '#f87171' }}>⚠ Demo Escalated</span>}
                  {t.coordinatorFlagged && <span className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[10px] font-bold" style={{ background: 'rgba(239,68,68,0.25)', color: '#f87171' }}>🚩 Regular Team Flagged</span>}
                </div>
              </div>
              <InlineEditIcon field="client" />
            </div>
          )}
        </td>

        {/* Trainer */}
        <td className="px-2 py-2" style={cell}>
          {editField === 'trainer' ? (
            <div className="flex flex-col gap-1" style={{ minWidth: 160 }}>
              <select autoFocus className="text-[11px] rounded px-1 py-0.5 w-full"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--brand-text)', outline: 'none' }}
                value={editVal} onChange={(e) => setEditVal(e.target.value)}>
                <option value="">— none —</option>
                {(allTrainers || []).map((tr: any) => {
                  const phone = tr.phoneDigits ? ` · ${tr.phoneCode || ''}${tr.phoneDigits}` : '';
                  return <option key={tr.id} value={tr.id}>{tr.name}{phone}</option>;
                })}
              </select>
              {t.trainer && editVal && editVal !== t.trainer.id && (
                <input
                  className="text-[11px] rounded px-1.5 py-0.5 w-full"
                  style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(251,191,36,0.5)', color: '#fbbf24', outline: 'none' }}
                  value={trainerReason}
                  onChange={(e) => setTrainerReason(e.target.value)}
                  placeholder="Reason for change (required)"
                />
              )}
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    if (t.trainer && editVal && editVal !== t.trainer.id && !trainerReason.trim()) return;
                    updateField.mutate({ trainerId: editVal || null, trainerReplacementReason: trainerReason || undefined });
                    cancelEdit();
                  }}
                  style={{ color: '#90ff90', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13 }}>✓</button>
                <button onClick={cancelEdit} style={{ color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13 }}>✕</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {t.trainerAttendance && (
                <span
                  title={t.trainerAttendance}
                  style={{
                    display: 'inline-block', width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                    background: t.trainerAttendance === 'present' ? 'var(--status-green)' : t.trainerAttendance === 'late' ? 'var(--status-amber)' : 'var(--status-red)',
                  }}
                />
              )}
              {t.trainer?.id
                ? <Link to={`/trainers/${t.trainer.id}`} className="hover:underline" style={{ color: 'inherit' }}>{t.trainer.name}</Link>
                : <span style={{ opacity: 0.4 }}>—</span>}
              <InlineEditIcon field="trainer" />
            </div>
          )}
        </td>

        {/* Skills */}
        <td className="px-2 py-2" style={{ ...cell, maxWidth: 0 }}>
          {editField === 'skills' ? (
            <div className="flex gap-1 items-center">
              <input autoFocus className="flex-1 text-[11px] rounded px-1.5 py-0.5 min-w-0"
                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', outline: 'none' }}
                value={editVal} onChange={(e) => setEditVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { updateField.mutate({ trainerSkillsOverride: editVal }); cancelEdit(); }
                  if (e.key === 'Escape') cancelEdit();
                }} />
              <button onClick={() => { updateField.mutate({ trainerSkillsOverride: editVal }); cancelEdit(); }} style={{ color: '#90ff90', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13 }}>✓</button>
              <button onClick={cancelEdit} style={{ color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13 }}>✕</button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className="block truncate text-[11px]" style={{ opacity: 0.85 }} title={t.trainer?.skills || '—'}>{t.trainer?.skills || '—'}</span>
              <InlineEditIcon field="skills" />
            </div>
          )}
        </td>

        {/* Host (Permanent only) */}
        <td className="px-2 py-2 font-semibold text-[11px]" style={cell}>
          {isUnassigned ? (
            <span style={{ color: 'var(--status-amber)', fontStyle: 'italic' }}>Unassigned</span>
          ) : (
            t.hostedByDefault?.name
          )}
        </td>

        {/* Tool */}
        <td className="px-2 py-2 text-[11px]" style={cell}>
          <select className="text-[11px] cursor-pointer"
            style={{ background: 'transparent', color: rowColor, border: 'none', outline: 'none' }}
            value={t.meetingMode || 'Zoom'}
            onChange={(e) => updateField.mutate({ meetingMode: e.target.value })}>
            {TOOL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </td>

        {/* Time */}
        <td className="px-2 py-2 mono font-bold text-[12px]" style={cell}>
          {editField === 'time' ? (
            <div className="flex gap-1 items-center">
              <input
                autoFocus
                type="time"
                className="text-[11px] rounded px-1 py-0.5"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--brand-text)', outline: 'none' }}
                value={editVal}
                onChange={(e) => setEditVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { updateField.mutate({ defaultTimeIst: editVal || null }); cancelEdit(); }
                  if (e.key === 'Escape') cancelEdit();
                }}
              />
              <button onClick={() => { updateField.mutate({ defaultTimeIst: editVal || null }); cancelEdit(); }} style={{ color: '#90ff90', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13 }}>✓</button>
              <button onClick={cancelEdit} style={{ color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13 }}>✕</button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {t.defaultTimeIst ? (() => {
                const [hh, mm] = t.defaultTimeIst.split(':').map(Number);
                const isAMTime = hh < 12;
                const h12 = hh % 12 === 0 ? 12 : hh % 12;
                const label = `${h12}:${String(mm).padStart(2, '0')} ${isAMTime ? 'AM' : 'PM'}`;
                const bg = isAMTime ? 'rgba(251,191,36,0.15)' : 'rgba(99,102,241,0.2)';
                const color = isAMTime ? '#fbbf24' : '#a5b4fc';
                const tag = isAMTime ? 'Morning' : 'Evening';
                return (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ background: bg, color, borderRadius: 4, padding: '1px 5px', fontWeight: 600, fontSize: 11 }}>{label}</span>
                    <span style={{ color, opacity: 0.7, fontSize: 10 }}>{tag}</span>
                  </span>
                );
              })() : <span style={{ opacity: 0.4 }}>—</span>}
              <button onClick={() => { setEditField('time' as any); setEditVal(t.defaultTimeIst || ''); }} title="Edit timing"
                className="inline-flex opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-textMuted)', padding: 0 }}>
                <Pencil size={10} />
              </button>
            </div>
          )}
        </td>

        {/* Session Happened */}
        <td className="px-2 py-2" style={cell}>
          <select className="text-[11px] font-medium cursor-pointer"
            style={{ background: 'transparent', color: statusColor, border: 'none', outline: 'none' }}
            value={t.lastSessionStatus || ''}
            onChange={(e) => updateField.mutate({ lastSessionStatus: e.target.value || null })}>
            {SESSION_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </td>

        {/* Mood */}
        <td className="px-2 py-2 text-center" style={cell}>
          {t.clientMood ? (
            <button
              onClick={() => {
                const next = t.clientMood === 'happy' ? 'neutral' : t.clientMood === 'neutral' ? 'at_risk' : 'happy';
                updateField.mutate({ clientMood: next });
              }}
              title="Click to cycle mood"
              style={{
                background: t.clientMood === 'happy' ? 'rgba(74,222,128,0.2)' : t.clientMood === 'neutral' ? 'rgba(251,191,36,0.2)' : 'rgba(239,68,68,0.2)',
                color: t.clientMood === 'happy' ? 'var(--status-green)' : t.clientMood === 'neutral' ? 'var(--status-amber)' : 'var(--status-red)',
                border: `1px solid ${t.clientMood === 'happy' ? 'rgba(74,222,128,0.4)' : t.clientMood === 'neutral' ? 'rgba(251,191,36,0.4)' : 'rgba(239,68,68,0.4)'}`,
                borderRadius: 6, padding: '1px 5px', cursor: 'pointer', fontSize: 13, lineHeight: 1.5,
              }}>
              {t.clientMood === 'happy' ? '😊' : t.clientMood === 'neutral' ? '😐' : '🚨'}
            </button>
          ) : (
            <button
              onClick={() => updateField.mutate({ clientMood: 'happy' })}
              title="Set mood"
              style={{ background: 'none', border: '1px dashed rgba(255,255,255,0.2)', borderRadius: 6, padding: '1px 5px', cursor: 'pointer', color: 'rgba(150,160,180,0.5)', fontSize: 11 }}>
              +
            </button>
          )}
        </td>

        {/* Comments */}
        <td className="px-2 py-2 text-[11px]" style={{ ...cell, maxWidth: 0 }}>
          {editingComment ? (
            <div className="flex gap-1 items-center">
              <input autoFocus className="flex-1 text-[11px] rounded px-1.5 py-0.5"
                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', outline: 'none', minWidth: 0 }}
                value={commentVal} onChange={(e) => setCommentVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { updateField.mutate({ lastSessionComment: commentVal || null }); setEditingComment(false); }
                  if (e.key === 'Escape') { setCommentVal(t.lastSessionComment || ''); setEditingComment(false); }
                }} />
              <button onClick={() => { updateField.mutate({ lastSessionComment: commentVal || null }); setEditingComment(false); }}
                style={{ color: '#90ff90', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 14 }}>✓</button>
            </div>
          ) : (
            <span className="block truncate cursor-pointer"
              style={{ color: hasComment ? '#fff' : 'rgba(150,160,180,0.8)', fontStyle: commentVal ? 'normal' : 'italic' }}
              title={commentVal || 'Click to add comment'}
              onClick={() => setEditingComment(true)}>
              {commentVal || 'Smooth'}
            </span>
          )}
        </td>

        {/* Actions — single dropdown */}
        <td className="px-2 py-2" style={{ ...cell, borderRight: 'none' }}>
          <div className="flex items-center gap-1 justify-end">
            {/* Unassigned quick-assign buttons */}
            {isUnassigned && AM_HOSTS.map((h) => (
              <button key={h.id} title={`Assign to ${h.name}`}
                onClick={() => updateField.mutate({ hostedByDefaultId: h.id })}
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold"
                style={{ background: 'rgba(251,191,36,0.2)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.4)', cursor: 'pointer' }}>
                + {h.name}
              </button>
            ))}

            {/* Actions dropdown */}
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold"
                style={{ background: menuOpen ? 'var(--brand-accent)' : 'var(--bg-input)', color: menuOpen ? '#fff' : 'var(--brand-text)', border: '1px solid var(--brand-borderSoft)', cursor: 'pointer' }}>
                Actions <ChevronDown size={11} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 rounded-xl overflow-hidden z-50 min-w-[200px]"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                  {/* Schedule */}
                  <button className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] hover:bg-[var(--bg-input)] transition-colors"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-accent)', textAlign: 'left' }}
                    onClick={() => { setShowSchedule(true); setMenuOpen(false); }}>
                    <CalendarIcon size={13} /> Schedule calendar invite
                  </button>

                  {/* WhatsApp Client */}
                  {clientWa ? (
                    <a href={clientWa} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2.5 px-3 py-2 text-[12px] hover:bg-[var(--bg-input)] transition-colors"
                      style={{ color: '#25d366', textDecoration: 'none' }}
                      onClick={() => setMenuOpen(false)}>
                      <MessageCircle size={13} /> WhatsApp Client Group
                    </a>
                  ) : (
                    <div className="flex items-center gap-2.5 px-3 py-2 text-[12px]" style={{ color: 'var(--brand-textMuted)', opacity: 0.5 }}>
                      <MessageCircle size={13} /> WA Client (no link)
                    </div>
                  )}

                  {/* WhatsApp Trainer */}
                  {trainerWa ? (
                    <a href={trainerWa} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2.5 px-3 py-2 text-[12px] hover:bg-[var(--bg-input)] transition-colors"
                      style={{ color: '#25d366', textDecoration: 'none' }}
                      onClick={() => setMenuOpen(false)}>
                      <Send size={13} /> WhatsApp Trainer
                    </a>
                  ) : (
                    <div className="flex items-center gap-2.5 px-3 py-2 text-[12px]" style={{ color: 'var(--brand-textMuted)', opacity: 0.5 }}>
                      <Send size={13} /> WA Trainer (no number)
                    </div>
                  )}

                  {/* Feedback */}
                  <button className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] hover:bg-[var(--bg-input)] transition-colors"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#63b3ed', textAlign: 'left' }}
                    onClick={() => { setShowFeedback((v) => !v); setMenuOpen(false); }}>
                    <MessageSquare size={13} /> {showFeedback ? 'Hide feedback' : 'Client & trainer feedback'}
                  </button>

                  {/* Flag Demo Team */}
                  {['demo_team', 'coordinator_team'].includes(t.ownerTeam) && rowUser.role !== 'sales_closer' && (
                    <button className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] hover:bg-[var(--bg-input)] transition-colors"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.demoEscalationRequested ? '#f87171' : '#fbbf24', textAlign: 'left' }}
                      onClick={() => { api.post(`/regular-trainings/trainings/${t.id}/escalate`).then(() => { onChanged(); qc.invalidateQueries({ queryKey: ['my-sessions-sheet'] }); }); setMenuOpen(false); }}>
                      <Flag size={13} /> {t.demoEscalationRequested ? 'Clear Demo Team flag' : 'Flag for Demo Team'}
                    </button>
                  )}

                  {/* Flag for Regular Team → toggle banner AND auto-log issue */}
                  <button className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] hover:bg-[var(--bg-input)] transition-colors"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.coordinatorFlagged ? '#f87171' : '#fb923c', textAlign: 'left' }}
                    onClick={() => {
                      api.post(`/regular-trainings/trainings/${t.id}/coordinator-flag`)
                        .then(() => {
                          onChanged();
                          qc.invalidateQueries({ queryKey: ['my-sessions-sheet'] });
                          qc.invalidateQueries({ queryKey: ['issues'] });
                          if (!t.coordinatorFlagged) showToast('Flagged — issue logged in Issues & Escalations');
                        })
                        .catch((e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'));
                      setMenuOpen(false);
                    }}>
                    <Flag size={13} /> {t.coordinatorFlagged ? 'Clear Regular Team flag' : 'Flag for Regular Team'}
                  </button>

                  {/* Flag for Freelance Team → goes to Freelance Requirements */}
                  <button className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] hover:bg-[var(--bg-input)] transition-colors"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a78bfa', textAlign: 'left' }}
                    onClick={() => {
                      setFlagFreelanceId(t.id);
                      setFlagFreelanceSkill(t.trainer?.skills || '');
                      setFlagFreelanceTimings('');
                      setMenuOpen(false);
                    }}>
                    <Flag size={13} /> Flag for Freelance Team
                  </button>

                  {/* Divider + Remove */}
                  {(rowUser.role === 'lead' || rowUser.role === 'founder' || rowUser.role === 'manager') && (
                    <>
                      <div style={{ borderTop: '1px solid var(--brand-borderSoft)', margin: '2px 0' }} />
                      <button className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] hover:bg-[rgba(239,68,68,0.1)] transition-colors"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', textAlign: 'left' }}
                        onClick={() => { setShowRemoveConfirm(true); setMenuOpen(false); }}>
                        <Trash2 size={13} /> Remove from sheet
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </td>
      </tr>

      {showSchedule && (
        <tr><td colSpan={10}>
          <AMScheduleDialog training={t} coordinatorTrainers={coordinatorTrainers} onClose={() => setShowSchedule(false)} onSent={() => { setShowSchedule(false); onChanged(); }} />
        </td></tr>
      )}
      {showRemoveConfirm && (
        <tr style={{ background: 'rgba(239,68,68,0.08)' }}>
          <td colSpan={10} className="px-4 py-3">
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-semibold" style={{ color: 'var(--brand-text)' }}>
                Remove <strong>{t.client?.name || t.name}</strong> from the session sheet?
              </span>
              <span className="text-[11px]" style={{ color: 'var(--brand-textMuted)' }}>
                This will be logged to the Retrospective for tracking. Add a reason (optional but recommended):
              </span>
              <input
                autoFocus
                className="text-[11px] rounded-lg px-2.5 py-1.5"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--brand-text)', outline: 'none', maxWidth: 420 }}
                placeholder="e.g. Client lost, completed training, billing issue…"
                value={removeReason}
                onChange={(e) => setRemoveReason(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') removeTraining.mutate(); if (e.key === 'Escape') { setShowRemoveConfirm(false); setRemoveReason(''); } }}
              />
              <div className="flex gap-2">
                <button onClick={() => { setShowRemoveConfirm(false); setRemoveReason(''); }}
                  className="text-[11px] px-3 py-1 rounded-lg"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--brand-textMuted)', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={() => removeTraining.mutate()} disabled={removeTraining.isPending}
                  className="text-[11px] px-3 py-1 rounded-lg font-semibold"
                  style={{ background: 'rgba(239,68,68,0.8)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                  {removeTraining.isPending ? 'Removing…' : 'Remove & log to Retrospective'}
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}

      {showFeedback && (
        <tr style={{ background: hasComment ? 'rgba(180,20,20,0.65)' : 'rgba(99,179,237,0.06)', borderBottom: cellBorder }}>
          <td colSpan={10} className="px-4 py-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wide font-semibold mb-1" style={{ color: '#63b3ed' }}>Client feedback</div>
                <textarea rows={2} className="w-full text-[11px] rounded-lg px-2 py-1.5 resize-none"
                  style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', outline: 'none' }}
                  placeholder="How did the client respond? Any issues?"
                  defaultValue={t.lastClientFeedback || ''}
                  onBlur={(e) => { if (e.target.value !== (t.lastClientFeedback || '')) updateField.mutate({ lastClientFeedback: e.target.value || null }); }} />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide font-semibold mb-1" style={{ color: '#90ff90' }}>Trainer feedback</div>
                <textarea rows={2} className="w-full text-[11px] rounded-lg px-2 py-1.5 resize-none"
                  style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', outline: 'none' }}
                  placeholder="Trainer performance, punctuality, content quality…"
                  defaultValue={t.lastTrainerFeedback || ''}
                  onBlur={(e) => { if (e.target.value !== (t.lastTrainerFeedback || '')) updateField.mutate({ lastTrainerFeedback: e.target.value || null }); }} />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wide font-semibold mb-1.5" style={{ color: '#fbbf24' }}>Trainer attendance:</div>
              <div className="flex gap-2 flex-wrap">
                {[
                  { val: 'present', label: 'Present ✓', bg: 'rgba(74,222,128,0.2)', color: 'var(--status-green)', border: 'rgba(74,222,128,0.4)' },
                  { val: 'late',    label: 'Late ⚠',    bg: 'rgba(251,191,36,0.2)', color: 'var(--status-amber)', border: 'rgba(251,191,36,0.4)' },
                  { val: 'no_show', label: 'No-show ✗', bg: 'rgba(239,68,68,0.2)',  color: 'var(--status-red)',   border: 'rgba(239,68,68,0.4)' },
                ].map(({ val, label, bg, color, border }) => (
                  <button
                    key={val}
                    onClick={() => updateField.mutate({ trainerAttendance: t.trainerAttendance === val ? null : val })}
                    style={{
                      background: t.trainerAttendance === val ? bg : 'rgba(0,0,0,0.2)',
                      color: t.trainerAttendance === val ? color : 'rgba(200,210,220,0.7)',
                      border: `1px solid ${t.trainerAttendance === val ? border : 'rgba(255,255,255,0.15)'}`,
                      borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 11, fontWeight: t.trainerAttendance === val ? 700 : 400,
                    }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wide font-semibold mb-1" style={{ color: '#a5b4fc' }}>Daily notes: <span className="normal-case font-normal opacity-70">(what happened today, blockers, next action)</span></div>
              <textarea rows={2} className="w-full text-[11px] rounded-lg px-2 py-1.5 resize-none"
                style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', outline: 'none' }}
                placeholder="What happened today, any blockers, next action…"
                defaultValue={t.dailyNotes || ''}
                onBlur={(e) => { if (e.target.value !== (t.dailyNotes || '')) updateField.mutate({ dailyNotes: e.target.value || null }); }} />
            </div>
            <div className="text-[10px] mt-1.5" style={{ opacity: 0.6 }}>Auto-saves on blur.</div>
          </td>
        </tr>
      )}

      {/* Flag for Freelance Team dialog */}
      {flagFreelanceId && (
        <Dialog open onOpenChange={(v) => { if (!v) { setFlagFreelanceId(null); setFlagFreelanceSkill(''); setFlagFreelanceTimings(''); } }}>
          <DialogContent title="Flag for Freelance Team" description="This will create a requirement in the Freelance Requirements section.">
            <div className="space-y-3">
              <div className="form-row">
                <label className="label">Skill Required *</label>
                <input
                  className="input w-full"
                  placeholder="e.g. Salesforce, Python, Data Analysis"
                  value={flagFreelanceSkill}
                  onChange={(e) => setFlagFreelanceSkill(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-row">
                <label className="label">Client Available Timings</label>
                <textarea
                  className="input w-full resize-none text-[13px]"
                  rows={2}
                  placeholder="e.g. 9–11 AM IST Mon–Fri"
                  value={flagFreelanceTimings}
                  onChange={(e) => setFlagFreelanceTimings(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => { setFlagFreelanceId(null); setFlagFreelanceSkill(''); setFlagFreelanceTimings(''); }}>Cancel</Button>
              <Button
                variant="primary"
                disabled={!flagFreelanceSkill.trim()}
                onClick={() => {
                  const training = t;
                  api.post('/freelance-requirements', {
                    clientName: training.client?.name || training.name || 'Unknown',
                    skillRequired: flagFreelanceSkill.trim(),
                    currentTrainer: training.trainer?.name || null,
                    clientTimings: flagFreelanceTimings.trim() || null,
                  })
                    .then(() => { showToast('Added to Freelance Requirements'); })
                    .catch((e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'));
                  setFlagFreelanceId(null); setFlagFreelanceSkill(''); setFlagFreelanceTimings('');
                }}
              >
                Add to Freelance Requirements
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// Thin wrapper that renders the schedule form as a dropdown menu item
function AMScheduleMenuItem({ training, onSent }: { training: any; onSent: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] hover:bg-[var(--bg-input)] transition-colors"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-accent)', textAlign: 'left' }}
        onClick={() => setOpen(true)}>
        <CalendarIcon size={13} /> Schedule calendar invite
      </button>
      {open && <AMScheduleDialog training={training} onClose={() => setOpen(false)} onSent={() => { setOpen(false); onSent(); }} />}
    </>
  );
}

export function AMScheduleDialog({ training, coordinatorTrainers, onClose, onSent }: { training: any; coordinatorTrainers?: any[]; onClose: () => void; onSent: () => void }) {
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();

  const pad = (n: number) => String(n).padStart(2, '0');
  const todayDate = new Date();
  const defaultDate = `${todayDate.getFullYear()}-${pad(todayDate.getMonth() + 1)}-${pad(todayDate.getDate())}`;
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState(training.defaultTimeIst || '08:00');
  const [duration, setDuration] = useState('60');
  const [meetingLink, setMeetingLink] = useState('');
  const [notes, setNotes] = useState('');
  const [trainerOverrideId, setTrainerOverrideId] = useState('');

  // Use coordinator's trainers if provided, otherwise fall back to all trainers
  const { data: allTrainersFallback } = useQuery({
    queryKey: ['trainers', 'for-invite'],
    queryFn: () => api.get('/trainers').then((r) =>
      (r.data as any[]).map((t: any) => ({ id: t.id, name: t.name, email: t.email || '', phoneCode: t.phoneCode || '', phoneDigits: t.phoneDigits || '' }))
    ),
    staleTime: 300_000,
    enabled: !coordinatorTrainers,
  });
  const allTrainers = coordinatorTrainers ?? allTrainersFallback;

  const nextSession = training.sessions?.[0];
  const fmtSession = (iso: string) => new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  const invite = useMutation({
    mutationFn: () => {
      const iso = `${date}T${time}:00+05:30`;
      return api.post(`/regular-trainings/trainings/${training.id}/sessions/invite`, {
        scheduledFor: iso,
        durationMinutes: Number(duration),
        meetingLink: meetingLink || null,
        notes: notes || null,
        trainerOverrideId: trainerOverrideId || undefined,
      });
    },
    onSuccess: (r) => {
      const sent: string[] = r.data.sent || [];
      const errs: string[] = r.data.errors || [];
      if (sent.length) showToast(`Invite sent to ${sent.join(', ')}`);
      if (errs.length) showToast(`Some invites failed: ${errs[0]}`, 'error');
      qc.invalidateQueries({ queryKey: ['my-sessions-sheet'] });
      onSent();
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed to send invite', 'error'),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Schedule · ${training.client?.name || training.name}`}
        description={`${training.meetingMode || 'Zoom'} · Sends .ics invite to trainer + client`}
      >
        {nextSession && (
          <div className="rounded-lg px-3 py-2 mb-1 text-[11px]" style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', color: 'var(--status-green)' }}>
            Already scheduled: {fmtSession(nextSession.scheduledFor)} IST
          </div>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="form-row">
            <Label>Date *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="form-row">
            <Label>Time IST * <span className="muted normal-case">(pre-filled)</span></Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="form-row">
            <Label>Duration</Label>
            <Select value={duration} onChange={(e) => setDuration(e.target.value)}>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
            </Select>
          </div>
          <div className="form-row">
            <Label>Meeting link <span className="muted normal-case">(optional)</span></Label>
            <Input value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} placeholder="https://zoom.us/…" />
          </div>
        </div>
        <div className="form-row mt-1">
          <Label>Trainer for invite</Label>
          <Select
            value={trainerOverrideId || training.trainer?.id || ''}
            onChange={(e) => setTrainerOverrideId(e.target.value)}
          >
            {training.trainer && (
              <option value={training.trainer.id}>
                {training.trainer.name} (assigned)
                {training.trainer.phoneCode && training.trainer.phoneDigits ? ` · ${training.trainer.phoneCode} ${training.trainer.phoneDigits}` : ''}
                {training.trainer.email ? ` · ${training.trainer.email}` : ''}
              </option>
            )}
            {!training.trainer && <option value="">— no trainer linked —</option>}
            {(allTrainers || [])
              .filter((t: any) => t.id !== training.trainer?.id)
              .map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.phoneCode && t.phoneDigits ? ` · ${t.phoneCode} ${t.phoneDigits}` : ''}
                  {t.email ? ` · ${t.email}` : ' · no email'}
                </option>
              ))}
          </Select>
        </div>
        <div className="form-row mt-1">
          <Label>Notes <span className="muted normal-case">(optional)</span></Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Topics to cover, agenda…" />
        </div>
        {training.scheduleNotes && (
          <div className="text-[11px] mt-2 px-2 py-1.5 rounded" style={{ background: 'rgba(229,178,76,0.08)', color: 'rgba(229,178,76,0.85)' }}>
            📅 {training.scheduleNotes}
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!date || !time || invite.isPending} onClick={() => invite.mutate()}>
            {invite.isPending ? 'Sending…' : 'Schedule & Send invite'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AMScheduleButton({ training, onSent }: { training: any; onSent: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
        <CalendarIcon size={11}/> Schedule
      </Button>
      {open && <AMScheduleDialog training={training} onClose={() => setOpen(false)} onSent={() => { setOpen(false); onSent(); }} />}
    </>
  );
}

/* ──────────────────────────── Weekly Payment Summary ─────────────────── */

function WeeklyPaymentSummary() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [week, setWeek] = useState(currentISOWeek);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['weekly-summary', week],
    queryFn: () => api.get('/regular-trainings/weekly-summary', { params: { week } }).then((r) => r.data),
  });

  const submit = useMutation({
    mutationFn: () => {
      const overrideArr = Object.entries(overrides).map(([trainingId, sessionCount]) => ({ trainingId, sessionCount }));
      return api.post('/regular-trainings/weekly-summary/submit', { week, overrides: overrideArr });
    },
    onSuccess: () => {
      showToast(`Week ${week} submitted to Mitali for payment review`);
      setSubmitted(true);
      qc.invalidateQueries({ queryKey: ['weekly-summary', week] });
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed to submit', 'error'),
  });

  const hosts: any[] = data?.hosts || [];
  const totalSessions = hosts.flatMap((h: any) => h.rows).reduce((sum: number, r: any) => sum + (overrides[r.trainingId] ?? r.sessionCount), 0);
  const isCurrentWeek = week === currentISOWeek();

  return (
    <div className="mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <CreditCard size={14} style={{ color: 'var(--accent-gold)' }} />
          <span className="text-[11px] uppercase tracking-[0.14em] font-bold" style={{ color: 'var(--accent-gold)' }}>
            Weekly Payment Summary
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setWeek(prevWeek(week)); setOverrides({}); setSubmitted(false); }}
            className="p-1 rounded hover-lift"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--brand-textSecondary)', cursor: 'pointer' }}
          >
            <ChevronLeft size={13} />
          </button>
          <span className="text-[12px] font-semibold mono" style={{ color: 'var(--brand-text)' }}>{week}</span>
          <button
            onClick={() => { setWeek(nextWeek(week)); setOverrides({}); setSubmitted(false); }}
            disabled={isCurrentWeek}
            className="p-1 rounded hover-lift"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: isCurrentWeek ? 'var(--brand-borderSoft)' : 'var(--brand-textSecondary)', cursor: isCurrentWeek ? 'not-allowed' : 'pointer' }}
          >
            <ChevronRight size={13} />
          </button>
          <span className="text-[11px] muted">{totalSessions} session{totalSessions !== 1 ? 's' : ''} total</span>
        </div>
      </div>

      {isLoading ? (
        <div className="muted text-sm py-4 text-center">Loading…</div>
      ) : hosts.length === 0 ? (
        <div className="rounded-xl p-6 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}>
          <div className="text-[12px] muted">No active trainings found for this week.</div>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)', boxShadow: 'var(--shadow-sm)' }}>
          <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-input)', borderBottom: '1px solid var(--brand-border)' }}>
                <th className="text-left px-3 py-2 font-semibold text-[10px] uppercase tracking-[0.10em]" style={{ color: 'var(--brand-textMuted)', width: '14%' }}>Host</th>
                <th className="text-left px-3 py-2 font-semibold text-[10px] uppercase tracking-[0.10em]" style={{ color: 'var(--brand-textMuted)', width: '20%' }}>Client</th>
                <th className="text-left px-3 py-2 font-semibold text-[10px] uppercase tracking-[0.10em]" style={{ color: 'var(--brand-textMuted)', width: '18%' }}>Trainer</th>
                <th className="text-left px-3 py-2 font-semibold text-[10px] uppercase tracking-[0.10em]" style={{ color: 'var(--brand-textMuted)', width: '18%' }}>Training</th>
                <th className="text-center px-3 py-2 font-semibold text-[10px] uppercase tracking-[0.10em]" style={{ color: 'var(--brand-textMuted)', width: '15%' }}>Sessions this week</th>
                <th className="text-center px-3 py-2 font-semibold text-[10px] uppercase tracking-[0.10em]" style={{ color: 'var(--brand-textMuted)', width: '15%' }}>Override count</th>
              </tr>
            </thead>
            <tbody>
              {hosts.flatMap((h: any) =>
                h.rows.map((row: any, i: number) => {
                  const overrideVal = overrides[row.trainingId];
                  const displayCount = overrideVal ?? row.sessionCount;
                  const accentColor = h.hostName === 'Kashish' ? 'var(--accent-gold)' : h.hostName === 'Muskan' ? 'var(--status-blue)' : 'var(--brand-textSecondary)';
                  return (
                    <tr key={row.trainingId} style={{ borderTop: '1px solid var(--brand-borderSoft)', background: 'var(--bg-card)' }}
                        className="hover:bg-[var(--bg-input)] transition-colors">
                      <td className="px-3 py-2 font-semibold" style={{ color: accentColor }}>
                        {i === 0 ? h.hostName : ''}
                      </td>
                      <td className="px-3 py-2" style={{ color: 'var(--brand-text)' }}>{row.clientName || <span className="muted">—</span>}</td>
                      <td className="px-3 py-2 muted">{row.trainerName || <span className="muted">—</span>}</td>
                      <td className="px-3 py-2 muted">{row.trainingName}</td>
                      <td className="px-3 py-2 text-center">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold"
                          style={{ background: displayCount > 0 ? 'rgba(74,222,128,0.12)' : 'var(--bg-input)', color: displayCount > 0 ? 'var(--status-green)' : 'var(--brand-textMuted)' }}>
                          {row.sessions.length} logged
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="number" min={0} max={31}
                          className="text-[11px] rounded text-center font-semibold"
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--accent-gold)', outline: 'none', width: 48, padding: '2px 4px' }}
                          value={overrideVal !== undefined ? overrideVal : (row.weeklySessionCount ?? '')}
                          placeholder={String(row.sessions.length || 0)}
                          onChange={(e) => setOverrides((prev) => ({ ...prev, [row.trainingId]: e.target.value ? Number(e.target.value) : 0 }))}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--bg-input)', borderTop: '2px solid var(--brand-border)' }}>
                <td colSpan={4} className="px-3 py-2 text-right font-semibold text-[11px]" style={{ color: 'var(--brand-textMuted)' }}>
                  TOTAL
                </td>
                <td className="px-3 py-2 text-center">
                  <span className="font-bold text-[12px]" style={{ color: 'var(--status-green)' }}>
                    {hosts.flatMap((h: any) => h.rows).reduce((s: number, r: any) => s + r.sessions.length, 0)}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className="font-bold text-[12px]" style={{ color: 'var(--accent-gold)' }}>
                    {totalSessions}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Submit footer */}
          <div className="flex items-center justify-between px-4 py-3"
            style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--brand-border)' }}>
            <div className="text-[11px] muted">
              Override column lets you correct the auto-count before submitting. Mitali gets notified on submit.
            </div>
            <div className="flex gap-2 items-center">
              {submitted && (
                <span className="text-[11px]" style={{ color: 'var(--status-green)' }}>✓ Submitted</span>
              )}
              <button
                onClick={() => submit.mutate()}
                disabled={submit.isPending || submitted}
                className="text-[11px] font-semibold px-3 py-1.5 rounded-lg hover-lift transition-all"
                style={{
                  background: submitted ? 'var(--bg-input)' : 'var(--accent-gold)',
                  color: submitted ? 'var(--brand-textMuted)' : '#1a1a00',
                  border: 'none', cursor: submitted ? 'not-allowed' : 'pointer',
                  opacity: submit.isPending ? 0.7 : 1,
                }}>
                {submit.isPending ? 'Submitting…' : submitted ? 'Already submitted' : `Submit ${week} for payment`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RetrospectiveSection({ rows }: { rows: any[] }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const rowUser = useAuth((s) => s.user)!;
  const canDelete = ['founder', 'manager', 'lead'].includes(rowUser.role);
  const [purgeDupConfirm, setPurgeDupConfirm] = useState(false);

  const { data: allUsers } = useQuery({
    queryKey: ['users', 'minimal'],
    queryFn: () => api.get('/users').then((r) => r.data),
    staleTime: 300_000,
  });

  const updateRow = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.patch(`/retrospective/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['retrospective'] }); showToast('Updated'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const deleteRow = useMutation({
    mutationFn: (id: string) => api.delete(`/retrospective/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['retrospective'] }); showToast('Entry deleted'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const restoreRow = useMutation({
    mutationFn: (id: string) => api.post(`/retrospective/${id}/restore`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['retrospective'] });
      qc.invalidateQueries({ queryKey: ['my-sessions-sheet'] });
      showToast('Session restored to My calls & sessions');
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed to restore', 'error'),
  });

  const purgeDuplicates = useMutation({
    mutationFn: () => api.delete('/retrospective/purge-duplicates'),
    onSuccess: (r: any) => { qc.invalidateQueries({ queryKey: ['retrospective'] }); showToast(`Deleted ${r.data.deleted} duplicate entries`); setPurgeDupConfirm(false); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const dupCount = rows.filter((r) => r.reason === 'Duplicate').length;

  if (rows.length === 0) {
    return (
      <div className="rounded-xl p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}>
        <div className="text-[13px] font-semibold" style={{ color: 'var(--brand-text)' }}>No retrospective records yet</div>
        <div className="text-[12px] muted mt-1">When a client is removed from the session sheet, it will appear here for tracking.</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {canDelete && dupCount > 0 && (
        <div className="flex items-center gap-2 justify-end">
          {!purgeDupConfirm ? (
            <button
              onClick={() => setPurgeDupConfirm(true)}
              className="text-[12px] px-3 py-1.5 rounded"
              style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--status-red)', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer' }}
            >
              Clear {dupCount} duplicate entries
            </button>
          ) : (
            <>
              <span className="text-[12px] muted">Delete all {dupCount} duplicate entries?</span>
              <button
                onClick={() => purgeDuplicates.mutate()}
                disabled={purgeDuplicates.isPending}
                className="text-[12px] px-3 py-1.5 rounded"
                style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--status-red)', border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer' }}
              >
                {purgeDuplicates.isPending ? 'Deleting…' : 'Yes, delete all'}
              </button>
              <button onClick={() => setPurgeDupConfirm(false)} className="text-[12px] px-3 py-1.5 rounded" style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', cursor: 'pointer' }}>Cancel</button>
            </>
          )}
        </div>
      )}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--brand-border)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr style={{ background: 'var(--bg-tableHeader, #1e293b)' }}>
                {['Date', 'Client', 'Trainer', 'Type', 'Reason', 'Ownership', 'Comments', 'Removed by', ''].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--brand-textMuted)', borderBottom: '1px solid var(--brand-border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <RetrospectiveRow key={r.id} r={r} users={allUsers || []} onUpdate={(data) => updateRow.mutate({ id: r.id, data })} onDelete={canDelete ? () => deleteRow.mutate(r.id) : undefined} onRestore={() => restoreRow.mutate(r.id)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RetrospectiveRow({ r, users, onUpdate, onDelete, onRestore }: { r: any; users: any[]; onUpdate: (data: any) => void; onDelete?: () => void; onRestore?: () => void }) {
  const [editingReason, setEditingReason] = useState(false);
  const [editingComments, setEditingComments] = useState(false);
  const [reasonVal, setReasonVal] = useState(r.reason || '');
  const [commentsVal, setCommentsVal] = useState(r.comments || '');

  const cellStyle = { borderBottom: '1px solid var(--brand-border)', color: 'var(--brand-text)', padding: '8px 12px', verticalAlign: 'top' as const };

  return (
    <tr style={{ background: 'var(--bg-card)' }} className="hover:brightness-105">
      <td style={cellStyle} className="mono text-[11px] whitespace-nowrap">{r.removedAt?.slice(0, 10)}</td>
      <td style={cellStyle} className="font-semibold">{r.clientName}</td>
      <td style={cellStyle}>{r.trainerName || <span style={{ opacity: 0.4 }}>—</span>}</td>
      <td style={cellStyle}>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: r.sourceType === 'training' ? 'rgba(251,191,36,0.15)' : 'rgba(99,102,241,0.2)', color: r.sourceType === 'training' ? '#fbbf24' : '#a5b4fc' }}>
          {r.sourceType}
        </span>
      </td>
      <td style={{ ...cellStyle, maxWidth: 180 }}>
        {editingReason ? (
          <div className="flex gap-1 items-start">
            <textarea rows={2} autoFocus className="text-[11px] rounded px-1.5 py-1 flex-1 resize-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--brand-text)', outline: 'none' }}
              value={reasonVal} onChange={(e) => setReasonVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setEditingReason(false); setReasonVal(r.reason || ''); } }}
            />
            <div className="flex flex-col gap-1">
              <button onClick={() => { onUpdate({ reason: reasonVal }); setEditingReason(false); }} style={{ color: '#90ff90', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>✓</button>
              <button onClick={() => { setEditingReason(false); setReasonVal(r.reason || ''); }} style={{ color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>✕</button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-1 group/r">
            <span>{r.reason || <span style={{ opacity: 0.4 }}>—</span>}</span>
            <button onClick={() => setEditingReason(true)} className="opacity-0 group-hover/r:opacity-100 transition-opacity" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-textMuted)', padding: 0, flexShrink: 0 }}><Pencil size={10}/></button>
          </div>
        )}
      </td>
      <td style={cellStyle}>
        <select className="text-[11px] rounded px-1.5 py-1"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--brand-text)', outline: 'none' }}
          value={r.ownerId || ''}
          onChange={(e) => onUpdate({ ownerId: e.target.value || null })}>
          <option value="">— Unassigned —</option>
          {users.filter((u: any) => ['founder','manager','lead','account_manager'].includes(u.role)).map((u: any) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </td>
      <td style={{ ...cellStyle, maxWidth: 200 }}>
        {editingComments ? (
          <div className="flex gap-1 items-start">
            <textarea rows={2} autoFocus className="text-[11px] rounded px-1.5 py-1 flex-1 resize-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--brand-text)', outline: 'none' }}
              value={commentsVal} onChange={(e) => setCommentsVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setEditingComments(false); setCommentsVal(r.comments || ''); } }}
            />
            <div className="flex flex-col gap-1">
              <button onClick={() => { onUpdate({ comments: commentsVal }); setEditingComments(false); }} style={{ color: '#90ff90', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>✓</button>
              <button onClick={() => { setEditingComments(false); setCommentsVal(r.comments || ''); }} style={{ color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>✕</button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-1 group/c">
            <span>{r.comments || <span style={{ opacity: 0.4 }}>—</span>}</span>
            <button onClick={() => setEditingComments(true)} className="opacity-0 group-hover/c:opacity-100 transition-opacity" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-textMuted)', padding: 0, flexShrink: 0 }}><Pencil size={10}/></button>
          </div>
        )}
      </td>
      <td style={cellStyle} className="text-[11px]">{r.removedBy?.name || <span style={{ opacity: 0.4 }}>—</span>}</td>
      <td style={{ ...cellStyle, width: 64 }}>
        <div className="flex items-center gap-1">
          {onRestore && r.sourceType === 'training' && r.sourceId && (
            <button
              onClick={() => { if (confirm('Restore this session back to My calls & sessions?')) onRestore(); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4ade80', opacity: 0.7, fontSize: 13, padding: '0 4px' }}
              title="Restore to active sessions"
            >↩</button>
          )}
          {onDelete && (
            <button
              onClick={() => { if (confirm('Delete this entry?')) onDelete(); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--status-red)', opacity: 0.5, fontSize: 14, padding: '0 4px' }}
              title="Delete"
            >✕</button>
          )}
        </div>
      </td>
    </tr>
  );
}

function LogSessionButton({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const showToast = useUI((s) => s.showToast);
  const [form, setForm] = useState({ trainerId: '', clientId: '', date: todayISO(), hours: 1, notes: '' });

  const { data: trainers } = useQuery({ queryKey: ['trainers'], queryFn: () => api.get('/trainers').then((r) => r.data), enabled: open });
  const { data: clients }  = useQuery({ queryKey: ['clients'],  queryFn: () => api.get('/clients').then((r) => r.data),  enabled: open });

  const create = useMutation({
    mutationFn: () => api.post('/session-logs', form),
    onSuccess: () => { setOpen(false); onCreated(); showToast('Session logged'); setForm({ trainerId: '', clientId: '', date: todayISO(), hours: 1, notes: '' }); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus size={12}/> Log session</Button>
      </DialogTrigger>
      <DialogContent title="Log a session you hosted" description="Adds a SessionLog so the trainer's hours roll up into the next payout batch.">
        <div className="grid md:grid-cols-2 gap-2">
          <div className="form-row">
            <Label>Trainer *</Label>
            <Select value={form.trainerId} onChange={(e) => setForm({ ...form, trainerId: e.target.value })}>
              <option value="">— pick —</option>
              {(trainers || []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <div className="form-row">
            <Label>Client (optional)</Label>
            <Select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
              <option value="">—</option>
              {(clients || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="form-row">
            <Label>Date *</Label>
            <Input type="date" value={form.date} min={minPastDate()} max={maxTodayDate()} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="form-row">
            <Label>Hours *</Label>
            <Input type="number" step="0.25" min="0.25" value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })} />
          </div>
        </div>
        <div className="form-row">
          <Label>Notes</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="What was covered, any blockers, etc." />
        </div>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={!form.trainerId || !form.date || !form.hours || create.isPending} disabledReason={!form.trainerId ? 'Pick a trainer first' : null} onClick={() => create.mutate()}>
            {create.isPending ? 'Saving…' : 'Log session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
