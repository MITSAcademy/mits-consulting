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
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Pill } from '@/components/ui/pill';
import { useUI } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { todayISO } from '@/lib/utils';
import { EmptyState } from '@/components/EmptyState';
import {
  ClipboardList, Plus, Calendar as CalendarIcon, CheckCircle2, Phone, Play, Square,
  Clock, MessageSquare, AlertCircle, Video,
} from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';

const MEETING_MODE_ICONS: Record<string, string> = {
  Zoom: '🎥',
  GoToMeeting: '🟢',
  Teams: '💜',
  'Google Meet': '🔵',
  Phone: '📞',
  Other: '💻',
};

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

  const isAM = user.role === 'account_manager' || user.role === 'lead';
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
    refetchInterval: 30_000,  // keep timer-relevant data fresh
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

  return (
    <>
      <Topbar
        title="My calls & sessions"
        subtitle={`${inProgress.length} live · ${scheduledToday.length} today · ${overdueCalls.length} overdue`}
        actions={
          <>
            <ScheduleCallButton onCreated={() => qc.invalidateQueries({ queryKey: ['call-logs'] })} />
            <LogSessionButton  onCreated={() => qc.invalidateQueries({ queryKey: ['session-logs'] })} />
          </>
        }
      />
      <Page>
        {/* ── AM session sheet ── */}
        {isAM && (
          <div className="mb-6">
            <div className="text-[11px] uppercase tracking-[0.14em] font-bold mb-2.5 flex items-center gap-2" style={{ color: 'var(--accent-gold)' }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-gold)', boxShadow: '0 0 8px var(--accent-gold)' }} />
              My clients &amp; sessions ({(mySessions || []).length})
            </div>
            {mySessionsLoading ? (
              <div className="muted text-sm">Loading…</div>
            ) : (mySessions || []).length === 0 ? (
              <div className="rounded-xl p-5 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}>
                <Video size={28} style={{ color: 'var(--accent-gold)', margin: '0 auto 8px' }} />
                <div className="text-[13px] font-semibold" style={{ color: 'var(--brand-text)' }}>No active trainings assigned to you yet</div>
                <div className="text-[12px] muted mt-1">Ask Vaibhav to set you as the host on a regular training.</div>
              </div>
            ) : (
              <div className="table-card">
                <table>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Trainer</th>
                      <th>Schedule</th>
                      <th>Mode</th>
                      <th>Next session</th>
                      <th>Notes</th>
                      <th className="text-right">Invite</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(mySessions || []).map((t: any) => (
                      <AMSessionRow key={t.id} t={t} onInviteSent={() => {}} />
                    ))}
                  </tbody>
                </table>
              </div>
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
            <EmptyState
              icon={Phone}
              tone="green"
              title="No calls scheduled for today"
              description="Use + Schedule call to plan one, or just punch in at the start of any client call to log it live."
            />
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

        {overdueTasks.length > 0 && (
          <Section title={`Overdue session tasks (${overdueTasks.length})`} tone="red">
            {overdueTasks.map((t: any) => <TaskRow key={t.id} t={t} onDone={() => markTaskDone.mutate(t.id)} />)}
          </Section>
        )}

        {todayTasks.length > 0 && (
          <Section title={`Session tasks today (${todayTasks.length})`} tone="amber">
            {todayTasks.map((t: any) => <TaskRow key={t.id} t={t} onDone={() => markTaskDone.mutate(t.id)} />)}
          </Section>
        )}

        <Section title={`Completed calls — last 7 days (${(recentCalls || []).length})`} tone="grey">
          {(recentCalls || []).length === 0 ? (
            <div className="muted text-[12px] py-2">No calls completed yet. Punch in on a scheduled call to start the timer.</div>
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
      </Page>
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
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
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

/* ──────────────────────── AM Session Row ────────────────────────────────── */

function AMSessionRow({ t, onInviteSent }: { t: any; onInviteSent: () => void }) {
  const nextSession = t.sessions?.[0];
  const modeIcon = MEETING_MODE_ICONS[t.meetingMode] || '';

  const fmtDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <tr className="clickable">
      <td>
        {t.client
          ? <Link to={`/clients/${t.client.id}`} className="font-semibold hover:underline" style={{ color: 'var(--brand-text)' }}>{t.client.name}</Link>
          : <span className="muted">—</span>
        }
      </td>
      <td>{t.trainer?.name || <span className="muted">—</span>}</td>
      <td className="text-[11.5px]" style={{ color: 'var(--accent-gold)' }}>{t.scheduleNotes || <span className="muted">—</span>}</td>
      <td>
        {t.meetingMode
          ? <span className="text-[12px]">{modeIcon} {t.meetingMode}</span>
          : <span className="muted">—</span>
        }
      </td>
      <td className="mono text-[11.5px]">
        {nextSession
          ? <span style={{ color: 'var(--status-green)' }}>{fmtDateTime(nextSession.scheduledFor)}</span>
          : <span className="muted">Not scheduled</span>
        }
      </td>
      <td className="text-[11.5px] muted max-w-[160px] truncate" title={t.notes || ''}>
        {t.notes || <span>—</span>}
      </td>
      <td className="text-right" onClick={(e) => e.stopPropagation()}>
        <AMSendInviteButton training={t} onSent={onInviteSent} />
      </td>
    </tr>
  );
}

function AMSendInviteButton({ training, onSent }: { training: any; onSent: () => void }) {
  const [open, setOpen] = useState(false);
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();

  const pad = (n: number) => String(n).padStart(2, '0');
  const today = new Date();
  const defaultDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('19:00');
  const [duration, setDuration] = useState('60');
  const [meetingLink, setMeetingLink] = useState('');
  const [notes, setNotes] = useState('');

  const invite = useMutation({
    mutationFn: () => {
      const iso = `${date}T${time}:00+05:30`;
      return api.post(`/regular-trainings/trainings/${training.id}/sessions/invite`, {
        scheduledFor: iso,
        durationMinutes: Number(duration),
        meetingLink,
        notes,
      });
    },
    onSuccess: (r) => {
      const sent: string[] = r.data.sent || [];
      const errs: string[] = r.data.errors || [];
      if (sent.length) showToast(`Invite sent to ${sent.length} recipient${sent.length > 1 ? 's' : ''}`);
      if (errs.length) showToast(`Some invites failed: ${errs[0]}`, 'error');
      qc.invalidateQueries({ queryKey: ['my-sessions-sheet'] });
      onSent();
      setOpen(false);
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed to send invite', 'error'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="primary" title="Schedule session + send calendar invite">
          <CalendarIcon size={11}/> Invite
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Schedule · ${training.client?.name || training.name}`}
        description={`Trainer: ${training.trainer?.name || '—'} · Creates a session + sends .ics invite to trainer, client, and you.`}
      >
        <div className="grid md:grid-cols-2 gap-2.5">
          <div className="form-row">
            <Label>Date *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="form-row">
            <Label>Time (IST) *</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="form-row">
            <Label>Duration (minutes)</Label>
            <Select value={duration} onChange={(e) => setDuration(e.target.value)}>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">60 min</option>
              <option value="90">90 min</option>
              <option value="120">2 hours</option>
            </Select>
          </div>
          <div className="form-row">
            <Label>Meeting link <span className="muted normal-case">(optional)</span></Label>
            <Input value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} placeholder="https://zoom.us/…" />
          </div>
        </div>
        <div className="form-row mt-1">
          <Label>Notes <span className="muted normal-case">(optional)</span></Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Agenda, topics to cover…" />
        </div>
        {training.scheduleNotes && (
          <div className="text-[11px] mt-2" style={{ color: 'rgba(229,178,76,0.8)' }}>
            📅 Usual schedule: {training.scheduleNotes}
          </div>
        )}
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={!date || !time || invite.isPending} onClick={() => invite.mutate()}>
            {invite.isPending ? 'Sending…' : 'Schedule & Send invite'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
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
