import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { EmptyState } from '@/components/EmptyState';
import { useUI } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { todayISO, minPastDate, maxTodayDate } from '@/lib/utils';
import { useState, useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Clock, XCircle, ChevronsUp, ChevronUp, Minus } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type IssueStatus = 'Open' | 'InProgress' | 'Resolved' | 'Closed';

interface Issue {
  id: string;
  title: string;
  date: string;
  status: IssueStatus;
  description?: string;
  resolutionNotes?: string;
  escalationLevel: number;
  escalatedAt?: string | null;
  escalationLog?: string | null;
  coordinator?: { id: string; name: string };
  client?: { id: string; name: string } | null;
  trainer?: { id: string; name: string } | null;
}

interface Escalation {
  id: string;
  name: string;
  escalationFlaggedAt: string | null;
  escalationStatus: string | null;
  escalationActionsTaken: string | null;
  escalationDemoAck: string | null;
  client: { id: string; name: string; lifecycle: string } | null;
  trainer: { id: string; name: string } | null;
  hostedByDefault: { id: string; name: string } | null;
  sessions: { scheduledFor: string; status: string }[];
}

interface IdName { id: string; name: string }

// ── Issue status helpers ─────────────────────────────────────────────────────

const ESCALATION_LABELS: Record<number, string> = { 0: 'None', 1: 'Bhavneet', 2: 'Mitali', 3: 'Vaibhav' };
function EscalationBadge({ level }: { level: number }) {
  if (!level) return null;
  const color = level === 3 ? 'var(--status-red)' : level === 2 ? 'var(--status-amber)' : 'var(--accent-gold)';
  const Icon = level === 3 ? ChevronsUp : level === 2 ? ChevronUp : Minus;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ml-1"
      style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color, border: `1px solid color-mix(in srgb, ${color} 25%, transparent)` }}
      title={`L${level} — ${ESCALATION_LABELS[level]}`}
    >
      <Icon size={9} /> L{level}
    </span>
  );
}

const STATUS_META: Record<IssueStatus, {
  icon: React.ComponentType<{ size?: number | string; style?: React.CSSProperties }>;
  color: string;
  label: string;
}> = {
  Open:       { icon: AlertTriangle,  color: 'var(--status-red)',     label: 'Open' },
  InProgress: { icon: Clock,          color: 'var(--status-amber)',   label: 'In Progress' },
  Resolved:   { icon: CheckCircle2,   color: 'var(--status-green)',   label: 'Resolved' },
  Closed:     { icon: XCircle,        color: 'var(--brand-textMuted)', label: 'Closed' },
};

function StatusBadge({ status }: { status: IssueStatus }) {
  const m = STATUS_META[status];
  const Icon = m.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{
        background: `color-mix(in srgb, ${m.color} 12%, transparent)`,
        color: m.color,
        border: `1px solid color-mix(in srgb, ${m.color} 20%, transparent)`,
      }}
    >
      <Icon size={11} style={{ color: m.color }} />
      {m.label}
    </span>
  );
}

// ── Escalation inbox helpers ─────────────────────────────────────────────────

const ESC_STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  'Work in Progress': { label: 'Work in Progress', bg: 'rgba(234,179,8,0.15)',  color: '#ca8a04', border: 'rgba(234,179,8,0.4)' },
  'Not Resolved':     { label: 'Not Resolved',     bg: 'rgba(239,68,68,0.12)',  color: '#dc2626', border: 'rgba(239,68,68,0.35)' },
  Resolved:           { label: 'Resolved',          bg: 'rgba(34,197,94,0.12)', color: '#16a34a', border: 'rgba(34,197,94,0.35)' },
};
const ESC_STATUS_OPTIONS = ['Work in Progress', 'Not Resolved', 'Resolved'];
const DEMO_ROLES = ['demo_lead', 'demo_intake'];
const MGMT_ROLES = ['founder', 'manager', 'lead'];

function EscStatusPill({ status }: { status: string | null }) {
  if (!status) return <span style={{ color: 'var(--brand-textSecondary)', fontSize: 12 }}>— Select —</span>;
  const cfg = ESC_STATUS_CONFIG[status];
  if (!cfg) return <span style={{ fontSize: 12 }}>{status}</span>;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.color, display: 'inline-block', flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

function EscalationRow({ esc }: { esc: Escalation }) {
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const isDemoTeam = DEMO_ROLES.includes(user?.role || '');
  const isMgmt = MGMT_ROLES.includes(user?.role || '');

  const [status, setStatus] = useState(esc.escalationStatus || '');
  const [actions, setActions] = useState(esc.escalationActionsTaken || '');
  const [actionsEditing, setActionsEditing] = useState(false);
  const [ack, setAck] = useState(esc.escalationDemoAck || '');
  const [ackEditing, setAckEditing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [notes, setNotes] = useState('');
  const [statusOpen, setStatusOpen] = useState(false);

  const patchStatus = useMutation({
    mutationFn: (escalationStatus: string) => api.patch(`/escalations/${esc.id}/status`, { escalationStatus }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['escalations'] }),
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });
  const patchActions = useMutation({
    mutationFn: (escalationActionsTaken: string) => api.patch(`/escalations/${esc.id}/status`, { escalationActionsTaken }),
    onSuccess: () => { setActionsEditing(false); qc.invalidateQueries({ queryKey: ['escalations'] }); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });
  const patchAck = useMutation({
    mutationFn: (escalationDemoAck: string) => api.patch(`/escalations/${esc.id}/status`, { escalationDemoAck }),
    onSuccess: () => { setAckEditing(false); qc.invalidateQueries({ queryKey: ['escalations'] }); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });
  const resolve = useMutation({
    mutationFn: () => api.post(`/escalations/${esc.id}/resolve`, { notes }),
    onSuccess: () => { showToast('Escalation resolved'); qc.invalidateQueries({ queryKey: ['escalations'] }); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed to resolve', 'error'),
  });

  const dateStr = esc.escalationFlaggedAt
    ? new Date(esc.escalationFlaggedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  return (
    <tr style={{
      borderBottom: '1px solid var(--brand-borderSoft)',
      background: !esc.escalationDemoAck ? 'rgba(234,179,8,0.04)' : undefined,
    }}>
      <td className="py-3 px-3 text-[13px] muted whitespace-nowrap">{dateStr}</td>
      <td className="py-3 px-3 text-[13px] font-medium">{esc.client?.name || esc.name || '—'}</td>
      <td className="py-3 px-3" style={{ minWidth: 170 }}>
        {isMgmt ? (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setStatusOpen((o) => !o)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <EscStatusPill status={status || null} />
              <span style={{ fontSize: 10, color: 'var(--brand-textSecondary)' }}>▾</span>
            </button>
            {statusOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, background: 'var(--bg-card)', border: '1px solid var(--brand-border)', borderRadius: 10, padding: '6px 0', minWidth: 180, boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
                {ESC_STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => { setStatus(opt); setStatusOpen(false); patchStatus.mutate(opt); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontWeight: status === opt ? 700 : 400, color: ESC_STATUS_CONFIG[opt]?.color || 'var(--brand-text)' }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: ESC_STATUS_CONFIG[opt]?.color || 'var(--brand-textSecondary)' }} />
                    <span style={{ fontSize: 13 }}>{opt}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <EscStatusPill status={status || null} />
        )}
      </td>
      <td className="py-3 px-3 text-[13px] muted">{esc.name || '—'}</td>
      <td className="py-3 px-3" style={{ minWidth: 200, maxWidth: 260 }}>
        {ackEditing && isDemoTeam ? (
          <div className="space-y-1">
            <textarea value={ack} onChange={(e) => setAck(e.target.value)} rows={3} className="input w-full resize-none text-[12px]" autoFocus placeholder="Describe what the demo team is doing about this…" />
            <div className="flex gap-2">
              <button className="text-[11px] font-medium" style={{ color: 'var(--brand-primary)' }} onClick={() => patchAck.mutate(ack)} disabled={patchAck.isPending}>{patchAck.isPending ? 'Saving…' : 'Save'}</button>
              <button className="text-[11px] muted" onClick={() => { setAckEditing(false); setAck(esc.escalationDemoAck || ''); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="text-[12px]" style={{ color: ack ? 'var(--brand-text)' : 'var(--status-amber)', cursor: isDemoTeam ? 'pointer' : 'default' }} onClick={() => isDemoTeam && setAckEditing(true)} title={isDemoTeam ? 'Click to acknowledge / respond' : undefined}>
            {ack || <span style={{ fontStyle: 'italic', fontSize: 11 }}>{isDemoTeam ? '⚠ Click to acknowledge…' : '⚠ Awaiting demo team response'}</span>}
          </div>
        )}
      </td>
      <td className="py-3 px-3" style={{ minWidth: 180, maxWidth: 260 }}>
        {actionsEditing && isMgmt ? (
          <div className="space-y-1">
            <textarea value={actions} onChange={(e) => setActions(e.target.value)} rows={3} className="input w-full resize-none text-[12px]" autoFocus placeholder="Actions taken by management…" />
            <div className="flex gap-2">
              <button className="text-[11px] font-medium" style={{ color: 'var(--brand-primary)' }} onClick={() => patchActions.mutate(actions)} disabled={patchActions.isPending}>{patchActions.isPending ? 'Saving…' : 'Save'}</button>
              <button className="text-[11px] muted" onClick={() => { setActionsEditing(false); setActions(esc.escalationActionsTaken || ''); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="text-[12px]" style={{ color: actions ? 'var(--brand-text)' : 'var(--brand-textSecondary)', cursor: isMgmt ? 'pointer' : 'default' }} onClick={() => isMgmt && setActionsEditing(true)} title={isMgmt ? 'Click to edit' : undefined}>
            {actions || <span className="italic">—</span>}
          </div>
        )}
      </td>
      <td className="py-3 px-3 text-right">
        {isMgmt && (
          resolving ? (
            <div className="space-y-1 text-left" style={{ minWidth: 200 }}>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Resolution notes (optional)…" rows={2} className="input w-full resize-none text-[12px]" autoFocus />
              <div className="flex gap-2">
                <Button variant="primary" disabled={resolve.isPending} onClick={() => resolve.mutate()}>
                  {resolve.isPending ? 'Resolving…' : <><CheckCircle2 size={12} className="mr-1" />Confirm</>}
                </Button>
                <Button onClick={() => { setResolving(false); setNotes(''); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button variant="primary" onClick={() => setResolving(true)}>Resolve</Button>
          )
        )}
      </td>
    </tr>
  );
}

// ── New Issue form ───────────────────────────────────────────────────────────

function NewIssueModal({ clients, trainers, users }: { clients: IdName[]; trainers: IdName[]; users: IdName[] }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const me = useAuth((s) => s.user)!;
  const [open, setOpen] = useState(false);
  const blank = { title: '', date: todayISO(), clientId: '', trainerId: '', coordinatorId: me.id, description: '', status: 'Open' as IssueStatus };
  const [f, setF] = useState(blank);

  const create = useMutation({
    mutationFn: () => api.post('/issue-tracker', {
      title:         f.title,
      date:          f.date,
      clientId:      f.clientId      || undefined,
      trainerId:     f.trainerId     || undefined,
      coordinatorId: f.coordinatorId || undefined,
      description:   f.description   || undefined,
      status:        f.status,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['issue-tracker'] }); setOpen(false); setF(blank); showToast('Issue logged'); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed to create issue', 'error'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary"><AlertTriangle size={14} className="mr-1.5" />New Issue</Button>
      </DialogTrigger>
      <DialogContent title="Log new issue">
        <div className="space-y-3">
          <div className="form-row">
            <Label>Title *</Label>
            <Input placeholder="Brief description of the issue" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </div>
          <div className="form-row">
            <Label>Date</Label>
            <Input type="date" value={f.date} min={minPastDate()} max={maxTodayDate()} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Client</Label>
              <Select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}>
                <option value="">— None —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>Trainer</Label>
              <Select value={f.trainerId} onChange={(e) => setF({ ...f, trainerId: e.target.value })}>
                <option value="">— None —</option>
                {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </div>
          </div>
          <div className="form-row">
            <Label>Coordinator *</Label>
            <Select value={f.coordinatorId} onChange={(e) => setF({ ...f, coordinatorId: e.target.value })}>
              <option value="">— Select coordinator —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </div>
          <div className="form-row">
            <Label>Description</Label>
            <Textarea placeholder="Describe the issue in detail…" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </div>
          <div className="form-row">
            <Label>Status</Label>
            <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as IssueStatus })}>
              <option value="Open">Open</option>
              <option value="InProgress">In Progress</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={!f.title.trim() || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Saving…' : 'Log Issue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Update Issue modal ───────────────────────────────────────────────────────

function UpdateIssueModal({ issue }: { issue: Issue }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ status: issue.status, resolutionNotes: issue.resolutionNotes || '' });

  const update = useMutation({
    mutationFn: () => api.patch(`/issue-tracker/${issue.id}`, { status: f.status, resolutionNotes: f.resolutionNotes || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['issue-tracker'] }); setOpen(false); showToast('Issue updated'); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed to update', 'error'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm">Update</Button></DialogTrigger>
      <DialogContent title={`Update: ${issue.title}`}>
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px]" style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}>
            <span className="muted">Current status:</span>
            <StatusBadge status={issue.status} />
          </div>
          <div className="form-row">
            <Label>New status</Label>
            <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as IssueStatus })}>
              <option value="Open">Open</option>
              <option value="InProgress">In Progress</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
            </Select>
          </div>
          <div className="form-row">
            <Label>Resolution notes</Label>
            <Textarea placeholder="Describe how the issue was resolved or add a progress update…" value={f.resolutionNotes} onChange={(e) => setF({ ...f, resolutionNotes: e.target.value })} />
          </div>
          {issue.escalationLevel > 0 && (
            <div className="rounded-xl px-3 py-2.5 text-[12px]" style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}>
              <div className="muted mb-1.5 text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1"><ChevronsUp size={10} /> Escalation history</div>
              {(issue.escalationLog ? JSON.parse(issue.escalationLog) : []).map((entry: any, i: number) => (
                <div key={i} className="flex items-start gap-2 text-[11px] mb-1">
                  <span className="px-1 py-0.5 rounded text-[10px] font-bold shrink-0" style={{ background: 'var(--accent-gold-soft)', color: 'var(--accent-gold)' }}>L{entry.level}</span>
                  <span style={{ color: 'var(--brand-textSecondary)' }}>{entry.reason}<span className="muted ml-1">· {new Date(entry.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span></span>
                </div>
              ))}
            </div>
          )}
          {issue.description && (
            <div className="rounded-xl px-3 py-2.5 text-[12px]" style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}>
              <div className="muted mb-1 text-[10px] uppercase tracking-wider font-semibold">Original description</div>
              <div style={{ color: 'var(--brand-textSecondary)' }}>{issue.description}</div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant={f.status === 'Resolved' || f.status === 'Closed' ? 'success' : 'primary'} disabled={update.isPending} onClick={() => update.mutate()}>
            {update.isPending ? 'Saving…' : f.status === 'Resolved' ? 'Mark Resolved' : f.status === 'Closed' ? 'Close Issue' : 'Save Update'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Tab bar ──────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { value: 'All',        label: 'All' },
  { value: 'Open',       label: 'Open' },
  { value: 'InProgress', label: 'In Progress' },
  { value: 'Resolved',   label: 'Resolved' },
  { value: 'Closed',     label: 'Closed' },
];

type Tab = 'issues' | 'escalations';

// ── Main page ────────────────────────────────────────────────────────────────

export default function IssueTrackerPage() {
  const user = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);

  const [tab, setTab] = useState<Tab>('issues');
  const [statusFilter, setStatusFilter] = useState('Open');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate]     = useState('');
  const [purgeOpen, setPurgeOpen]   = useState(false);
  const [purgeInput, setPurgeInput] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const canDelete = ['founder', 'manager', 'lead'].includes(user.role);

  const deleteIssue = useMutation({
    mutationFn: (id: string) => api.delete(`/issue-tracker/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['issue-tracker'] }); showToast('Issue deleted'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const purgeAll = useMutation({
    mutationFn: () => api.delete('/issue-tracker/purge-all'),
    onSuccess: (r: any) => { qc.invalidateQueries({ queryKey: ['issue-tracker'] }); showToast(`Deleted ${r.data.deleted} issues`); setPurgeOpen(false); setPurgeInput(''); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const { data: issues, isLoading } = useQuery<Issue[]>({
    queryKey: ['issue-tracker'],
    queryFn: () => api.get('/issue-tracker').then((r) => r.data),
  });

  const { data: escalations = [], isLoading: escLoading } = useQuery<Escalation[]>({
    queryKey: ['escalations'],
    queryFn: () => api.get('/escalations').then((r) => r.data),
    refetchInterval: 10 * 60_000,
  });

  const { data: clients } = useQuery<IdName[]>({
    queryKey: ['clients', 'id-name'],
    queryFn: () => api.get('/clients').then((r) => (r.data as any[]).map((c) => ({ id: c.id, name: c.name }))),
  });
  const { data: trainers } = useQuery<IdName[]>({
    queryKey: ['trainers', 'id-name'],
    queryFn: () => api.get('/trainers').then((r) => (r.data as any[]).map((t) => ({ id: t.id, name: t.name }))),
  });
  const { data: users } = useQuery<IdName[]>({
    queryKey: ['users', 'id-name'],
    queryFn: () => api.get('/users').then((r) => (r.data as any[]).map((u) => ({ id: u.id, name: u.name }))),
  });

  const filtered = useMemo(() => {
    let rows = issues || [];
    if (statusFilter !== 'All') rows = rows.filter((i) => i.status === statusFilter);
    if (fromDate) rows = rows.filter((i) => i.date >= fromDate);
    if (toDate)   rows = rows.filter((i) => i.date <= toDate);
    return rows;
  }, [issues, statusFilter, fromDate, toDate]);

  const openCount = (issues || []).filter((i) => i.status === 'Open').length;
  const inProgressCount = (issues || []).filter((i) => i.status === 'InProgress').length;
  const pendingAck = escalations.filter((e) => !e.escalationDemoAck).length;

  return (
    <>
      <Topbar
        title="Issues & Escalations"
        subtitle={tab === 'issues' ? `${openCount} open · ${inProgressCount} in progress` : `${escalations.length} unresolved`}
        actions={
          tab === 'issues' ? (
            <div className="flex items-center gap-2">
              {user.role === 'founder' && (
                <Dialog open={purgeOpen} onOpenChange={(o) => { setPurgeOpen(o); if (!o) setPurgeInput(''); }}>
                  <DialogTrigger asChild>
                    <Button style={{ color: 'var(--status-red)' }}>Purge all</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>Purge all issues</div>
                      <div style={{ fontSize: 13, color: 'var(--brand-textMuted)', lineHeight: 1.6 }}>
                        This will permanently delete <strong>every issue</strong> in the tracker — open, in-progress, and resolved. This cannot be undone.
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--brand-textMuted)' }}>Type <strong>DELETE</strong> to confirm:</div>
                      <Input value={purgeInput} onChange={(e) => setPurgeInput(e.target.value)} placeholder="DELETE" autoFocus />
                    </div>
                    <DialogFooter>
                      <Button onClick={() => { setPurgeOpen(false); setPurgeInput(''); }}>Cancel</Button>
                      <Button onClick={() => purgeAll.mutate()} disabled={purgeInput !== 'DELETE' || purgeAll.isPending} style={{ color: purgeInput === 'DELETE' ? 'var(--status-red)' : undefined }}>
                        {purgeAll.isPending ? 'Deleting…' : 'Yes, delete all'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
              <NewIssueModal clients={clients || []} trainers={trainers || []} users={users || []} />
            </div>
          ) : undefined
        }
      />
      <Page>
        {/* Tab strip */}
        <div className="flex gap-1 mb-4" style={{ borderBottom: '1px solid var(--brand-border)', paddingBottom: 0 }}>
          {([
            { key: 'issues' as Tab, label: 'Operational issues', count: openCount },
            { key: 'escalations' as Tab, label: 'Demo escalations', count: pendingAck > 0 ? pendingAck : undefined, countColor: 'var(--status-amber)' },
          ] as { key: Tab; label: string; count?: number; countColor?: string }[]).map(({ key, label, count, countColor }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: tab === key ? 700 : 500,
                color: tab === key ? 'var(--brand-primary)' : 'var(--brand-textSecondary)',
                background: 'none',
                border: 'none',
                borderBottom: tab === key ? '2px solid var(--brand-primary)' : '2px solid transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: -1,
                transition: 'color 0.15s',
              }}
            >
              {label}
              {count !== undefined && (
                <span style={{ fontSize: 11, fontWeight: 700, background: countColor ? `color-mix(in srgb, ${countColor} 15%, transparent)` : 'var(--bg-input)', color: countColor || 'var(--brand-textMuted)', borderRadius: 20, padding: '1px 7px', border: `1px solid ${countColor ? `color-mix(in srgb, ${countColor} 30%, transparent)` : 'var(--brand-borderSoft)'}` }}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Issues tab ──────────────────────────────────────────────────── */}
        {tab === 'issues' && (
          <>
            <div className="callout">
              Track issues, escalations, and blockers across clients and trainers.
              Log new problems as they arise and update status as they progress to resolution.
            </div>

            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-2xl mb-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_FILTERS.map((sf) => {
                  const active = statusFilter === sf.value;
                  return (
                    <button
                      key={sf.value}
                      onClick={() => setStatusFilter(sf.value)}
                      className="px-3 py-1 rounded-full text-[12px] font-medium transition-all"
                      style={{ background: active ? 'var(--accent-gold)' : 'var(--bg-input)', color: active ? '#0a0c12' : 'var(--brand-textSecondary)', border: active ? '1px solid var(--accent-gold)' : '1px solid var(--brand-borderSoft)', fontWeight: active ? 700 : 500 }}
                    >
                      {sf.label}
                    </button>
                  );
                })}
              </div>
              <div className="h-5 w-px" style={{ background: 'var(--brand-borderSoft)' }} />
              <div className="flex items-center gap-2">
                <span className="text-[11px] muted uppercase tracking-wider font-semibold">From</span>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36 text-[12px] py-1" />
                <span className="text-[11px] muted uppercase tracking-wider font-semibold">To</span>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36 text-[12px] py-1" />
                {(fromDate || toDate) && (
                  <button className="text-[11px] muted hover:text-brand-text transition-colors" onClick={() => { setFromDate(''); setToDate(''); }}>Clear</button>
                )}
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-16 muted text-[13px]">Loading issues…</div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={AlertTriangle}
                tone="gold"
                title={statusFilter !== 'All' || fromDate || toDate ? 'No issues match your filters' : 'No issues logged yet'}
                description={statusFilter !== 'All' || fromDate || toDate ? 'Try adjusting the status filter or date range.' : 'Use the "New Issue" button to log the first escalation or blocker.'}
                action={(statusFilter !== 'All' || fromDate || toDate) ? <Button size="sm" onClick={() => { setStatusFilter('All'); setFromDate(''); setToDate(''); }}>Clear filters</Button> : undefined}
              />
            ) : (
              <div className="table-card">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Coordinator</th>
                      <th>Client</th>
                      <th>Trainer</th>
                      <th>Title</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((issue) => (
                      <tr key={issue.id} className="clickable">
                        <td className="mono text-[12px] whitespace-nowrap">{issue.date}</td>
                        <td className="text-[13px]">{issue.coordinator?.name || <span className="muted">—</span>}</td>
                        <td className="text-[13px]">{issue.client?.name    || <span className="muted">—</span>}</td>
                        <td className="text-[13px]">{issue.trainer?.name   || <span className="muted">—</span>}</td>
                        <td>
                          <div className="text-[13px] font-medium">
                            {issue.title}
                            <EscalationBadge level={issue.escalationLevel || 0} />
                          </div>
                          {issue.description && <div className="muted text-[11px] mt-0.5 max-w-xs truncate">{issue.description}</div>}
                          {issue.resolutionNotes && <div className="text-[11px] mt-0.5 max-w-xs truncate" style={{ color: 'var(--status-green)' }}>✓ {issue.resolutionNotes}</div>}
                        </td>
                        <td><StatusBadge status={issue.status} /></td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <UpdateIssueModal issue={issue} />
                            {canDelete && deleteConfirm !== issue.id && (
                              <button
                                onClick={() => setDeleteConfirm(issue.id)}
                                className="text-[11px] px-2 py-1 rounded"
                                style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--status-red)', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer' }}
                                title="Delete issue"
                              >✕</button>
                            )}
                            {canDelete && deleteConfirm === issue.id && (
                              <span className="flex items-center gap-1">
                                <span className="text-[11px]" style={{ color: 'var(--status-red)' }}>Delete?</span>
                                <button onClick={() => { deleteIssue.mutate(issue.id); setDeleteConfirm(null); }} className="text-[11px] px-2 py-1 rounded" style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--status-red)', border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer', fontWeight: 600 }}>Yes</button>
                                <button onClick={() => setDeleteConfirm(null)} className="text-[11px] px-2 py-1 rounded" style={{ background: 'var(--bg-input)', color: 'var(--brand-textMuted)', border: '1px solid var(--brand-borderSoft)', cursor: 'pointer' }}>No</button>
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Escalations tab ─────────────────────────────────────────────── */}
        {tab === 'escalations' && (
          <>
            <div className="callout">
              Trainings where a demo escalation has been requested.
              {DEMO_ROLES.includes(user?.role || '') && pendingAck > 0 && (
                <span style={{ marginLeft: 10, color: '#ca8a04', fontWeight: 600 }}>
                  ⚠ {pendingAck} escalation{pendingAck > 1 ? 's' : ''} awaiting your acknowledgment.
                </span>
              )}
            </div>
            {escLoading ? (
              <div className="muted text-[13px] py-12 text-center">Loading escalations…</div>
            ) : escalations.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16">
                <CheckCircle2 size={32} style={{ color: 'var(--status-green)' }} />
                <div className="text-[15px] font-medium">All clear!</div>
                <div className="text-[13px] muted">No unresolved escalations.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--brand-border)' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-tableHeader, var(--bg-card))', borderBottom: '2px solid var(--brand-border)' }}>
                      {['Date', 'Client Name', 'Status', 'Title', 'Demo Team Response', 'Actions Taken', ''].map((h) => (
                        <th key={h} className="py-3 px-3 text-left text-[12px] font-semibold muted">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {escalations.map((e) => <EscalationRow key={e.id} esc={e} />)}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Page>
    </>
  );
}
