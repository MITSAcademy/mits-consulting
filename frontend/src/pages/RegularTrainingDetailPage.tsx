/**
 * Single regular-training detail view.
 *
 * Shows:
 *   • Header — name, host, schedule notes, recording account, folder link
 *   • Past sessions table — date, host, duration, recording URL, feedback
 *   • Upcoming + live sessions with start/end + feedback flow
 *   • "Schedule session" + "Edit training" + "Archive" actions
 */
import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Pill } from '@/components/ui/pill';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { useUI } from '@/store/ui';
import { useFeatures } from '@/hooks/useFeatures';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/store/auth';
import { todayISO, minPastDate, maxTodayDate, minFutureDate } from '@/lib/utils';
import {
  FolderOpen, ExternalLink, Calendar as CalendarIcon, Play, Square, Plus, Pencil, Archive, Video,
} from 'lucide-react';

interface Session {
  id: string;
  scheduledFor: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'missed' | 'cancelled' | string;
  actualStartAt: string | null;
  actualEndAt: string | null;
  durationMinutes: number | null;
  recordingUrl: string | null;
  feedback: string | null;
  notes: string | null;
  hostedBy: { id: string; name: string } | null;
}

interface TrainingDetail {
  id: string; name: string; status: string;
  recordingAccountEmail: string | null; recordingAccountLabel: string | null; recordingFolderUrl: string | null;
  scheduleNotes: string | null; notes: string | null;
  hostedByDefault: { id: string; name: string } | null;
  client: { id: string; name: string } | null;
  trainer: { id: string; name: string } | null;
  sessions: Session[];
  createdAt: string; updatedAt: string;
}

/* ─── Inline duration editor (click-to-edit on past sessions) ───────── */
function InlineDuration({ session }: { session: Session }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(session.durationMinutes?.toString() || '');
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const save = useMutation({
    mutationFn: (minutes: number) => api.patch(`/regular-trainings/sessions/${session.id}`, { durationMinutes: minutes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['regular-training'] }); showToast('Duration updated'); setEditing(false); },
    onError: (e: any) => { showToast(e?.response?.data?.error || 'Failed', 'error'); setEditing(false); },
  });

  if (!editing) {
    return (
      <button
        className="mono text-[12px] hover:underline cursor-pointer"
        style={{ color: session.durationMinutes ? 'inherit' : 'var(--brand-textMuted)' }}
        title="Click to edit duration"
        onClick={() => { setVal(session.durationMinutes?.toString() || ''); setEditing(true); }}
      >
        {session.durationMinutes ? `${session.durationMinutes}m` : '—'}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        type="number"
        min={1}
        className="mono text-[12px] w-16 rounded px-1 py-0.5 border"
        style={{ background: 'var(--bg-input)', borderColor: 'var(--brand-border)', color: 'inherit' }}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { const n = parseInt(val); if (n > 0) save.mutate(n); else setEditing(false); }
          if (e.key === 'Escape') setEditing(false);
        }}
      />
      <span className="text-[11px] muted">m</span>
      <button
        className="text-[11px] font-medium"
        style={{ color: 'var(--accent-gold)' }}
        onClick={() => { const n = parseInt(val); if (n > 0) save.mutate(n); else setEditing(false); }}
      >✓</button>
      <button className="text-[11px] muted" onClick={() => setEditing(false)}>✕</button>
    </div>
  );
}

export function RegularTrainingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const features = useFeatures();
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);

  const { data, isLoading } = useQuery<TrainingDetail>({
    queryKey: ['regular-training', id],
    queryFn: () => api.get(`/regular-trainings/trainings/${id}`).then((r) => r.data),
    enabled: features.regularCalls && !!id,
    refetchInterval: 5 * 60_000,
  });

  const archive = useMutation({
    mutationFn: () => api.delete(`/regular-trainings/trainings/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['regular-trainings'] }); qc.invalidateQueries({ queryKey: ['regular-training', id] }); showToast('Training archived'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  if (!features.regularCalls) {
    return <Page><EmptyState icon={Video} tone="grey" title="Feature not enabled" description="Set FEATURES_REGULAR_CALLS=true to enable." /></Page>;
  }
  if (isLoading || !data) {
    return (
      <>
        <Topbar title="Training" />
        <Page><div className="muted">Loading…</div></Page>
      </>
    );
  }

  const upcoming = data.sessions.filter((s) => s.status === 'scheduled' || s.status === 'in_progress')
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  const past = data.sessions.filter((s) => s.status === 'completed' || s.status === 'missed' || s.status === 'cancelled')
    .sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor));

  return (
    <>
      <Topbar
        title={data.name}
        subtitle={data.scheduleNotes || ''}
        actions={
          <>
            <ScheduleSessionButton trainingId={data.id} defaultHostId={data.hostedByDefault?.id} />
            <EditTrainingButton training={data} />
            <Button variant="danger" onClick={() => { if (confirm(`Archive "${data.name}"?`)) archive.mutate(); }}>
              <Archive size={12}/> Archive
            </Button>
          </>
        }
      />
      <Page>
        {/* Header card */}
        <div className="card-hero mb-4">
          <div className="grid md:grid-cols-4 gap-4 text-[12.5px]">
            <HeaderField label="Status" value={<Pill color={data.status === 'active' ? 'green' : data.status === 'paused' ? 'amber' : 'grey'}>{data.status}</Pill>} />
            <HeaderField label="Default host" value={data.hostedByDefault?.name || '—'} />
            <HeaderField label="Recording account" value={data.recordingAccountEmail || '—'} sub={data.recordingAccountLabel || undefined} />
            <HeaderField
              label="Recording folder"
              value={
                data.recordingFolderUrl ? (
                  <a href={data.recordingFolderUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline" style={{ color: 'var(--accent-gold)' }}>
                    <FolderOpen size={12}/> Open <ExternalLink size={10}/>
                  </a>
                ) : '—'
              }
            />
            {data.client && <HeaderField label="Client" value={<Link to={`/clients/${data.client.id}`} className="hover:underline">{data.client.name}</Link>} />}
            {data.trainer && <HeaderField label="Trainer" value={data.trainer.name} />}
            {data.notes && <HeaderField label="Notes" value={data.notes} />}
          </div>
        </div>

        {/* Upcoming + live sessions */}
        <div className="text-xs uppercase tracking-wider mb-2 font-semibold" style={{ color: 'var(--status-amber)' }}>
          Upcoming + live sessions ({upcoming.length})
        </div>
        {upcoming.length === 0 ? (
          <div className="muted text-[12px] mb-4">No upcoming sessions. Click "+ Schedule session" to plan one.</div>
        ) : (
          <div className="space-y-2 mb-4">
            {upcoming.map((s) => <SessionRow key={s.id} s={s} trainingId={data.id} folderUrl={data.recordingFolderUrl} />)}
          </div>
        )}

        {/* Past sessions */}
        <div className="text-xs uppercase tracking-wider mb-2 font-semibold muted">
          Past sessions ({past.length})
        </div>
        {past.length === 0 ? (
          <div className="muted text-[12px]">No past sessions yet.</div>
        ) : (
          <div className="table-card">
            <table>
              <thead><tr><th>When</th><th>Host</th><th>Duration</th><th>Recording</th><th>Feedback</th><th>Status</th></tr></thead>
              <tbody>
                {past.map((s) => (
                  <tr key={s.id}>
                    <td className="mono text-[11.5px]">{new Date(s.scheduledFor).toLocaleString()}</td>
                    <td>{s.hostedBy?.name || <span className="muted">—</span>}</td>
                    <td><InlineDuration session={s} /></td>
                    <td>
                      {s.recordingUrl ? (
                        <a href={s.recordingUrl} target="_blank" rel="noreferrer" className="text-[11px] hover:underline" style={{ color: 'var(--accent-gold)' }}>
                          <Video size={10} className="inline mr-0.5"/> Watch <ExternalLink size={9} className="inline"/>
                        </a>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td className="text-[11px]">{(s.feedback || s.notes || '—').slice(0, 80)}</td>
                    <td><Pill color={s.status === 'completed' ? 'green' : s.status === 'missed' ? 'red' : 'grey'}>{s.status}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Page>
    </>
  );
}

function HeaderField({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider muted">{label}</div>
      <div className="font-medium mt-0.5">{value}</div>
      {sub && <div className="text-[10px] muted">{sub}</div>}
    </div>
  );
}

/* ─── Session row with live timer + punch-in/out ─────────────────────── */
function SessionRow({ s, folderUrl }: { s: Session; trainingId: string; folderUrl: string | null }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const user = useAuth((s) => s.user)!;
  const isMine = s.hostedBy?.id === user.id || ['founder', 'manager'].includes(user.role);

  // Live timer
  const [, setTick] = useState(0);
  useEffect(() => {
    if (s.status !== 'in_progress') return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [s.status]);
  const liveSec = s.actualStartAt ? Math.floor((Date.now() - new Date(s.actualStartAt).getTime()) / 1000) : 0;

  const start = useMutation({
    mutationFn: () => api.post(`/regular-trainings/sessions/${s.id}/start`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['regular-training'] }); showToast('Session started — timer running'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const [endOpen, setEndOpen] = useState(false);
  const isLive = s.status === 'in_progress';
  const isScheduled = s.status === 'scheduled';

  return (
    <>
      <div
        className="rounded-xl p-3.5 flex justify-between items-start gap-3 flex-wrap transition-all hover-lift"
        style={{
          background: isLive
            ? 'linear-gradient(90deg, rgba(74,222,128,0.06) 0%, var(--bg-card) 60%)'
            : 'var(--bg-card)',
          border: '1px solid var(--brand-border)',
          borderLeft: `3px solid ${isLive ? 'var(--status-green)' : 'var(--accent-gold)'}`,
          boxShadow: isLive ? '0 4px 16px rgba(74,222,128,0.10)' : 'var(--shadow-sm)',
        }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[13px]">{new Date(s.scheduledFor).toLocaleString()}</span>
            {isLive && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(74,222,128,0.18)', color: 'var(--status-green)' }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--status-green)', animation: 'pulse 1.4s ease-in-out infinite' }} />
                LIVE · {Math.floor(liveSec / 60)}:{String(liveSec % 60).padStart(2, '0')}
              </span>
            )}
          </div>
          <div className="text-[11px] muted mt-0.5">
            host: {s.hostedBy?.name || '—'}
            {s.notes && <> · {s.notes.slice(0, 60)}</>}
          </div>
        </div>
        <div className="flex gap-1.5 items-center">
          {isScheduled && isMine && (
            <Button size="sm" variant="success" onClick={() => start.mutate()} disabled={start.isPending}>
              <Play size={11}/> Start
            </Button>
          )}
          {isLive && isMine && (
            <Button size="sm" variant="danger" onClick={() => setEndOpen(true)}>
              <Square size={11}/> End + feedback
            </Button>
          )}
        </div>
      </div>
      {endOpen && <EndSessionModal session={s} folderUrl={folderUrl} onClose={() => setEndOpen(false)} />}
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
    </>
  );
}

/* ─── End-session modal: feedback + per-session recording URL ────────── */
function EndSessionModal({ session, folderUrl, onClose }: { session: Session; folderUrl: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [feedback, setFeedback] = useState('');
  const [recordingUrl, setRecordingUrl] = useState('');

  const end = useMutation({
    mutationFn: () => api.post(`/regular-trainings/sessions/${session.id}/end`, { feedback, recordingUrl: recordingUrl || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['regular-training'] }); showToast('Session ended · feedback saved'); onClose(); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title="End session" description="Capture feedback + paste this session's recording URL.">
        <div className="form-row">
          <Label>Feedback from this session</Label>
          <Textarea
            rows={4}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="What was covered, blockers, commitments, etc."
            autoFocus
          />
        </div>
        <div className="form-row">
          <Label>Recording URL (specific to this session)</Label>
          <Input value={recordingUrl} onChange={(e) => setRecordingUrl(e.target.value)} placeholder="https://drive.google.com/file/d/…" />
          {folderUrl && (
            <div className="text-[10px] muted mt-1">
              Or leave blank — the parent folder is <a href={folderUrl} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: 'var(--accent-gold)' }}>here</a>.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={end.isPending} onClick={() => end.mutate()}>
            {end.isPending ? 'Saving…' : 'End session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Schedule a session ─────────────────────────────────────────────── */
function ScheduleSessionButton({ trainingId, defaultHostId }: { trainingId: string; defaultHostId?: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [form, setForm] = useState({ date: todayISO(), time: '19:00', notes: '' });
  const [hostId, setHostId] = useState(defaultHostId || '');
  const [meetingLinkId, setMeetingLinkId] = useState('');

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data),
    enabled: open,
  });

  const { data: meetingLinks } = useQuery({
    queryKey: ['meeting-links'],
    queryFn: () => api.get('/meeting-links').then((r) => r.data),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () => {
      const isoLocal = `${form.date}T${form.time}:00+05:30`;
      const selectedLink = (meetingLinks || []).find((l: any) => l.id === meetingLinkId);
      return api.post(`/regular-trainings/trainings/${trainingId}/sessions`, {
        scheduledFor: new Date(isoLocal).toISOString(),
        hostedById: hostId || undefined,
        notes: form.notes || null,
        meetingLink: selectedLink?.url || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['regular-training', trainingId] });
      showToast('Session scheduled');
      setOpen(false);
      setForm({ date: todayISO(), time: '19:00', notes: '' });
      setMeetingLinkId('');
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary"><Plus size={12}/> Schedule session</Button>
      </DialogTrigger>
      <DialogContent title="Schedule a session" description="Plan a session under this training.">
        <div className="grid md:grid-cols-2 gap-2">
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
          <Label>Host (optional override)</Label>
          <Select value={hostId} onChange={(e) => setHostId(e.target.value)}>
            <option value="">— default —</option>
            {(users || [])
              .filter((u: any) => ['manager', 'lead', 'account_manager', 'founder'].includes(u.role))
              .map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </div>
        <div className="form-row">
          <Label>Meeting link</Label>
          <Select value={meetingLinkId} onChange={(e) => setMeetingLinkId(e.target.value)}>
            <option value="">— none / paste manually below —</option>
            {(meetingLinks || []).map((l: any) => (
              <option key={l.id} value={l.id}>{l.label} ({l.platform})</option>
            ))}
          </Select>
        </div>
        <div className="form-row">
          <Label>Pre-session notes (optional)</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="What's planned, prep items, etc." />
        </div>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Scheduling…' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Edit training metadata ─────────────────────────────────────────── */
function EditTrainingButton({ training }: { training: TrainingDetail }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [form, setForm] = useState({
    name: training.name,
    status: training.status,
    recordingAccountEmail: training.recordingAccountEmail || '',
    recordingAccountLabel: training.recordingAccountLabel || '',
    recordingFolderUrl:    training.recordingFolderUrl    || '',
    scheduleNotes:         training.scheduleNotes         || '',
    notes:                 training.notes                 || '',
    hostedByDefaultId:     training.hostedByDefault?.id   || '',
    trainerId:             training.trainer?.id            || '',
    trainerReplacementReason: '',
  });

  const originalTrainerId = training.trainer?.id || '';
  const trainerChanged = form.trainerId !== originalTrainerId && originalTrainerId !== '';
  const needsReason = trainerChanged && !form.trainerReplacementReason.trim();

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data),
    enabled: open,
  });

  const { data: trainers } = useQuery({
    queryKey: ['trainers'],
    queryFn: () => api.get('/trainers').then((r) => r.data),
    enabled: open,
  });

  const save = useMutation({
    mutationFn: () => {
      const payload: any = { ...form };
      if (!trainerChanged) { delete payload.trainerReplacementReason; }
      if (!payload.trainerId) payload.trainerId = null;
      return api.patch(`/regular-trainings/trainings/${training.id}`, payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['regular-training', training.id] }); qc.invalidateQueries({ queryKey: ['regular-trainings'] }); showToast('Saved'); setOpen(false); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Pencil size={12}/> Edit</Button>
      </DialogTrigger>
      <DialogContent title="Edit training" description="Update metadata. Sessions are not affected.">
        <div className="form-row">
          <Label>Name *</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid md:grid-cols-2 gap-2">
          <div className="form-row">
            <Label>Status</Label>
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </Select>
          </div>
          <div className="form-row">
            <Label>Default host</Label>
            <Select value={form.hostedByDefaultId} onChange={(e) => setForm({ ...form, hostedByDefaultId: e.target.value })}>
              <option value="">— none —</option>
              {(users || [])
                .filter((u: any) => ['manager', 'lead', 'account_manager', 'founder'].includes(u.role))
                .map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </div>
        </div>
        <div className="form-row">
          <Label>Trainer</Label>
          <Select value={form.trainerId} onChange={(e) => setForm({ ...form, trainerId: e.target.value, trainerReplacementReason: '' })}>
            <option value="">— none —</option>
            {(trainers || []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </div>
        {trainerChanged && (
          <div className="form-row">
            <Label>Reason for trainer change *</Label>
            <Textarea
              rows={2}
              placeholder="Why is the trainer being changed? (required)"
              value={form.trainerReplacementReason}
              onChange={(e) => setForm({ ...form, trainerReplacementReason: e.target.value })}
              style={{ borderColor: needsReason ? 'var(--status-amber)' : undefined }}
            />
            {needsReason && <p className="text-[11px] mt-1" style={{ color: 'var(--status-amber)' }}>Reason is required when changing the trainer.</p>}
          </div>
        )}
        <div className="grid md:grid-cols-2 gap-2">
          <div className="form-row">
            <Label>Recording account email</Label>
            <Input type="email" value={form.recordingAccountEmail} onChange={(e) => setForm({ ...form, recordingAccountEmail: e.target.value })} />
          </div>
          <div className="form-row">
            <Label>Account label</Label>
            <Input value={form.recordingAccountLabel} onChange={(e) => setForm({ ...form, recordingAccountLabel: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <Label>Recording folder URL</Label>
          <Input value={form.recordingFolderUrl} onChange={(e) => setForm({ ...form, recordingFolderUrl: e.target.value })} />
        </div>
        <div className="form-row">
          <Label>Schedule notes</Label>
          <Input value={form.scheduleNotes} onChange={(e) => setForm({ ...form, scheduleNotes: e.target.value })} />
        </div>
        <div className="form-row">
          <Label>Notes</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending || needsReason} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
