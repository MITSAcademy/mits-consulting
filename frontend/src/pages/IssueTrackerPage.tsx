import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Pill } from '@/components/ui/pill';
import { EmptyState } from '@/components/EmptyState';
import { useUI } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { todayISO, minPastDate, maxTodayDate, minFutureDate } from '@/lib/utils';
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

interface IdName { id: string; name: string }

// ── Status badge helpers ─────────────────────────────────────────────────────

const STATUS_META: Record<IssueStatus, {
  icon: React.ComponentType<{ size?: number | string; style?: React.CSSProperties }>;
  color: string;
  pillColor: 'red' | 'amber' | 'green' | 'grey';
  label: string;
}> = {
  Open:       { icon: AlertTriangle,  color: 'var(--status-red)',   pillColor: 'red',   label: 'Open' },
  InProgress: { icon: Clock,          color: 'var(--status-amber)', pillColor: 'amber', label: 'In Progress' },
  Resolved:   { icon: CheckCircle2,   color: 'var(--status-green)', pillColor: 'green', label: 'Resolved' },
  Closed:     { icon: XCircle,        color: 'var(--brand-textMuted)', pillColor: 'grey', label: 'Closed' },
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issue-tracker'] });
      setOpen(false);
      setF(blank);
      showToast('Issue logged');
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed to create issue', 'error'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary">
          <AlertTriangle size={14} className="mr-1.5" />
          New Issue
        </Button>
      </DialogTrigger>
      <DialogContent title="Log new issue">
        <div className="space-y-3">
          <div className="form-row">
            <Label>Title *</Label>
            <Input
              placeholder="Brief description of the issue"
              value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })}
            />
          </div>
          <div className="form-row">
            <Label>Date</Label>
            <Input
              type="date"
              value={f.date}
              min={minPastDate()}
              max={maxTodayDate()}
              onChange={(e) => setF({ ...f, date: e.target.value })}
            />
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
            <Textarea
              placeholder="Describe the issue in detail…"
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
            />
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
          <Button
            variant="primary"
            disabled={!f.title.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
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
    mutationFn: () => api.patch(`/issue-tracker/${issue.id}`, {
      status:          f.status,
      resolutionNotes: f.resolutionNotes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issue-tracker'] });
      setOpen(false);
      showToast('Issue updated');
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed to update', 'error'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Update</Button>
      </DialogTrigger>
      <DialogContent title={`Update: ${issue.title}`}>
        <div className="space-y-3">
          {/* Current status summary */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px]"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}
          >
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
            <Textarea
              placeholder="Describe how the issue was resolved or add a progress update…"
              value={f.resolutionNotes}
              onChange={(e) => setF({ ...f, resolutionNotes: e.target.value })}
            />
          </div>

          {/* Escalation history */}
          {issue.escalationLevel > 0 && (
            <div
              className="rounded-xl px-3 py-2.5 text-[12px]"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}
            >
              <div className="muted mb-1.5 text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1">
                <ChevronsUp size={10} /> Escalation history
              </div>
              {(issue.escalationLog ? JSON.parse(issue.escalationLog) : []).map((entry: any, i: number) => (
                <div key={i} className="flex items-start gap-2 text-[11px] mb-1">
                  <span
                    className="px-1 py-0.5 rounded text-[10px] font-bold shrink-0"
                    style={{ background: 'var(--accent-gold-soft)', color: 'var(--accent-gold)' }}
                  >
                    L{entry.level}
                  </span>
                  <span style={{ color: 'var(--brand-textSecondary)' }}>
                    {entry.reason}
                    <span className="muted ml-1">· {new Date(entry.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Show existing description read-only if present */}
          {issue.description && (
            <div
              className="rounded-xl px-3 py-2.5 text-[12px]"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}
            >
              <div className="muted mb-1 text-[10px] uppercase tracking-wider font-semibold">Original description</div>
              <div style={{ color: 'var(--brand-textSecondary)' }}>{issue.description}</div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant={f.status === 'Resolved' || f.status === 'Closed' ? 'success' : 'primary'}
            disabled={update.isPending}
            onClick={() => update.mutate()}
          >
            {update.isPending ? 'Saving…' : f.status === 'Resolved' ? 'Mark Resolved' : f.status === 'Closed' ? 'Close Issue' : 'Save Update'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Filter bar ───────────────────────────────────────────────────────────────

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'All',        label: 'All' },
  { value: 'Open',       label: 'Open' },
  { value: 'InProgress', label: 'In Progress' },
  { value: 'Resolved',   label: 'Resolved' },
  { value: 'Closed',     label: 'Closed' },
];

// ── Main page ────────────────────────────────────────────────────────────────

export default function IssueTrackerPage() {
  const [statusFilter, setStatusFilter] = useState('All');
  const [fromDate, setFromDate]         = useState('');
  const [toDate, setToDate]             = useState('');

  const { data: issues, isLoading } = useQuery<Issue[]>({
    queryKey: ['issue-tracker'],
    queryFn: () => api.get('/issue-tracker').then((r) => r.data),
  });

  // Fetch clients and trainers for the new-issue form (id+name only)
  const { data: clients } = useQuery<IdName[]>({
    queryKey: ['clients', 'id-name'],
    queryFn: () =>
      api.get('/clients').then((r) =>
        (r.data as any[]).map((c) => ({ id: c.id, name: c.name }))
      ),
  });

  const { data: trainers } = useQuery<IdName[]>({
    queryKey: ['trainers', 'id-name'],
    queryFn: () =>
      api.get('/trainers').then((r) =>
        (r.data as any[]).map((t) => ({ id: t.id, name: t.name }))
      ),
  });

  const { data: users } = useQuery<IdName[]>({
    queryKey: ['users', 'id-name'],
    queryFn: () =>
      api.get('/users').then((r) =>
        (r.data as any[]).map((u) => ({ id: u.id, name: u.name }))
      ),
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

  return (
    <>
      <Topbar
        title="Issues & Escalation Tracker"
        subtitle={`${openCount} open · ${inProgressCount} in progress`}
        actions={
          <NewIssueModal clients={clients || []} trainers={trainers || []} users={users || []} />
        }
      />
      <Page>
        {/* Callout */}
        <div className="callout">
          Track issues, escalations, and blockers across clients and trainers.
          Log new problems as they arise and update status as they progress to resolution.
        </div>

        {/* Filter bar */}
        <div
          className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-2xl mb-4"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}
        >
          {/* Status pills */}
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((sf) => {
              const active = statusFilter === sf.value;
              return (
                <button
                  key={sf.value}
                  onClick={() => setStatusFilter(sf.value)}
                  className="px-3 py-1 rounded-full text-[12px] font-medium transition-all"
                  style={{
                    background: active ? 'var(--accent-gold)' : 'var(--bg-input)',
                    color:      active ? '#0a0c12' : 'var(--brand-textSecondary)',
                    border:     active ? '1px solid var(--accent-gold)' : '1px solid var(--brand-borderSoft)',
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  {sf.label}
                </button>
              );
            })}
          </div>

          {/* Separator */}
          <div className="h-5 w-px" style={{ background: 'var(--brand-borderSoft)' }} />

          {/* Date range */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] muted uppercase tracking-wider font-semibold">From</span>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-36 text-[12px] py-1"
            />
            <span className="text-[11px] muted uppercase tracking-wider font-semibold">To</span>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-36 text-[12px] py-1"
            />
            {(fromDate || toDate) && (
              <button
                className="text-[11px] muted hover:text-brand-text transition-colors"
                onClick={() => { setFromDate(''); setToDate(''); }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 muted text-[13px]">Loading issues…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            tone="gold"
            title={statusFilter !== 'All' || fromDate || toDate ? 'No issues match your filters' : 'No issues logged yet'}
            description={
              statusFilter !== 'All' || fromDate || toDate
                ? 'Try adjusting the status filter or date range to see more results.'
                : 'Use the "New Issue" button to log the first escalation or blocker.'
            }
            action={
              (statusFilter !== 'All' || fromDate || toDate) ? (
                <Button
                  size="sm"
                  onClick={() => { setStatusFilter('All'); setFromDate(''); setToDate(''); }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
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
                      {issue.description && (
                        <div className="muted text-[11px] mt-0.5 max-w-xs truncate">{issue.description}</div>
                      )}
                      {issue.resolutionNotes && (
                        <div
                          className="text-[11px] mt-0.5 max-w-xs truncate"
                          style={{ color: 'var(--status-green)' }}
                        >
                          ✓ {issue.resolutionNotes}
                        </div>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={issue.status} />
                    </td>
                    <td>
                      <UpdateIssueModal issue={issue} />
                    </td>
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
