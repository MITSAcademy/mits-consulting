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
  Clock, MessageSquare, AlertCircle,
} from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';

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

  const today = todayISO();
  const sevenAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); })();

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
    <div className="mb-4">
      <div className="text-xs uppercase tracking-wider mb-2 font-semibold" style={{ color }}>{title}</div>
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
        className="rounded-lg p-3 flex justify-between items-start gap-3 flex-wrap"
        style={{
          background: 'var(--bg-card)',
          border: `1px solid ${isLive ? 'rgba(74,222,128,0.4)' : isLate ? 'rgba(239,68,68,0.30)' : 'var(--brand-border)'}`,
          borderLeft: `3px solid ${isLive ? 'var(--status-green)' : isLate ? 'var(--status-red)' : 'var(--accent-gold)'}`,
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
