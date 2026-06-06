/**
 * "My sessions" — host-session dashboard.
 *
 * Used by Mitali (manager), Bhavneet (lead), Muskan & Kashish (account
 * managers). Same workflow for all four roles:
 *
 *   1. See today's scheduled host sessions (Tasks of type SESSION owned by me).
 *   2. Quick-log a session you just hosted (date, trainer, client, hours,
 *      brief notes).
 *   3. See your last 7 days of logged sessions so you know what's been
 *      counted toward the trainer payout.
 *
 * Calendar invite button on each upcoming row deep-links to Google Calendar's
 * "create event" UI pre-filled with the client + trainer details — sends from
 * the user's own Google account.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Pill } from '@/components/ui/pill';
import { useUI } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { todayISO } from '@/lib/utils';
import { EmptyState } from '@/components/EmptyState';
import { ClipboardList, Plus, Calendar as CalendarIcon, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';

function googleCalendarLink(opts: { title: string; details?: string; date?: string; timeIst?: string; durationMinutes?: number }) {
  // Build a Google Calendar pre-fill URL. Time IST defaults to 1 hour starting
  // at the time given. If no date/time, opens the create-event panel blank.
  const baseUrl = 'https://calendar.google.com/calendar/render';
  const params = new URLSearchParams({ action: 'TEMPLATE', text: opts.title });
  if (opts.details) params.set('details', opts.details);
  if (opts.date && opts.timeIst) {
    // Treat input as IST (+05:30). Convert to UTC for the URL's YYYYMMDDTHHMMSSZ format.
    const [hh, mm] = opts.timeIst.split(':').map(Number);
    const start = new Date(`${opts.date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+05:30`);
    const end = new Date(start.getTime() + (opts.durationMinutes || 60) * 60_000);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    params.set('dates', `${fmt(start)}/${fmt(end)}`);
  }
  return `${baseUrl}?${params.toString()}`;
}

export function MySessionsPage() {
  const user = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);

  const today = todayISO();
  const sevenAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); })();

  // Today's session tasks owned by the current user (or upcoming this week).
  const { data: tasks } = useQuery({
    queryKey: ['tasks', { type: 'SESSION', owner: user.id }],
    queryFn: () => api.get('/tasks', { params: { ownerId: user.id, type: 'SESSION' } }).then((r) => r.data),
  });

  // Recent session logs created by this user (last 7 days).
  const { data: recentLogs } = useQuery({
    queryKey: ['session-logs', { ownerSince: sevenAgo }],
    queryFn: () => api.get('/session-logs', { params: { dateFrom: sevenAgo } }).then((r) => r.data),
  });

  const todayTasks = (tasks || []).filter((t: any) => t.dueDate === today && t.status !== 'Done');
  const upcoming   = (tasks || []).filter((t: any) => t.dueDate && t.dueDate > today && t.status !== 'Done');
  const overdue    = (tasks || []).filter((t: any) => t.dueDate && t.dueDate < today && t.status !== 'Done');

  const markDone = useMutation({
    mutationFn: (id: string) => api.patch(`/tasks/${id}`, { status: 'Done', completedAt: today }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      showToast('Marked done');
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <>
      <Topbar
        title="My sessions"
        subtitle={`${todayTasks.length} today · ${overdue.length} overdue`}
        actions={<LogSessionButton onCreated={() => qc.invalidateQueries({ queryKey: ['session-logs'] })} />}
      />
      <Page>
        {overdue.length > 0 && (
          <Section title={`Overdue (${overdue.length})`} tone="red">
            {overdue.map((t: any) => <TaskRow key={t.id} t={t} onDone={() => markDone.mutate(t.id)} />)}
          </Section>
        )}

        <Section title={`Today (${todayTasks.length})`} tone="amber">
          {todayTasks.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              tone="green"
              title="No sessions scheduled for today"
              description="Log one anyway if you hosted a session — use the + Log session button at the top."
            />
          ) : (
            todayTasks.map((t: any) => <TaskRow key={t.id} t={t} onDone={() => markDone.mutate(t.id)} />)
          )}
        </Section>

        {upcoming.length > 0 && (
          <Section title={`Upcoming (${upcoming.length})`} tone="grey">
            {upcoming.slice(0, 12).map((t: any) => <TaskRow key={t.id} t={t} onDone={() => markDone.mutate(t.id)} />)}
          </Section>
        )}

        <Section title={`Recently logged (last 7d · ${(recentLogs || []).length})`} tone="grey">
          {(recentLogs || []).length === 0 ? (
            <div className="muted text-[12px] py-2">No sessions logged yet this week.</div>
          ) : (
            <div className="table-card">
              <table>
                <thead><tr><th>Date</th><th>Client</th><th>Trainer</th><th>Hours</th><th>Status</th></tr></thead>
                <tbody>
                  {(recentLogs || []).slice(0, 25).map((l: any) => (
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

function Section({ title, tone, children }: { title: string; tone: 'red' | 'amber' | 'grey'; children: React.ReactNode }) {
  const color = tone === 'red' ? 'var(--status-red)' : tone === 'amber' ? 'var(--status-amber)' : 'var(--brand-textMuted)';
  return (
    <div className="mb-4">
      <div className="text-xs uppercase tracking-wider mb-2 font-semibold" style={{ color }}>{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function TaskRow({ t, onDone }: { t: any; onDone: () => void }) {
  const calLink = googleCalendarLink({
    title: t.title || 'MITS session',
    details: [
      t.client?.name && `Client: ${t.client.name}`,
      t.trainer?.name && `Trainer: ${t.trainer.name}`,
      t.priority && `Priority: ${t.priority}`,
    ].filter(Boolean).join('\n'),
    date: t.dueDate,
    durationMinutes: Math.max(30, Math.round((t.estimatedHours || 1) * 60)),
  });
  return (
    <div
      className="rounded-lg p-3 flex justify-between items-start gap-3 flex-wrap"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}
    >
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
          <Button size="sm" title="Open Google Calendar (pre-filled) — saves to your own calendar">
            <CalendarIcon size={11}/> Calendar invite
          </Button>
        </a>
        <Button size="sm" variant="success" onClick={onDone} title="Mark this session as hosted/done">
          <CheckCircle2 size={11}/> Hosted
        </Button>
      </div>
    </div>
  );
}

function LogSessionButton({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const showToast = useUI((s) => s.showToast);
  const [form, setForm] = useState({
    trainerId: '',
    clientId: '',
    date: todayISO(),
    hours: 1,
    notes: '',
  });

  const { data: trainers } = useQuery({
    queryKey: ['trainers'],
    queryFn: () => api.get('/trainers').then((r) => r.data),
    enabled: open,
  });
  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get('/clients').then((r) => r.data),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () => api.post('/session-logs', form),
    onSuccess: () => {
      setOpen(false);
      onCreated();
      showToast('Session logged');
      setForm({ trainerId: '', clientId: '', date: todayISO(), hours: 1, notes: '' });
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary"><Plus size={12}/> Log session</Button>
      </DialogTrigger>
      <DialogContent
        title="Log a session you hosted"
        description="Adds a SessionLog so the trainer's hours roll up into the next payout batch."
      >
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
          <Button
            variant="primary"
            disabled={!form.trainerId || !form.date || !form.hours || create.isPending}
            disabledReason={!form.trainerId ? 'Pick a trainer first' : null}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Saving…' : 'Log session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
