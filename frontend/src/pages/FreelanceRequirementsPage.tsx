import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { useUI } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { MessageSquare, Plus, Trash2, AlertTriangle, Clock, Pencil, X } from 'lucide-react';

interface Comment {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
}

interface TrainerProposal {
  trainerName: string | null;
  trainerPhone: string | null;
  trainerEmail: string | null;
  trainerRecording: string | null;
  trainerTimings: string | null;
  notes: string | null;
  addedByName?: string;
  addedAt?: string;
}

interface FreelanceReq {
  id: string;
  createdAt: string;
  updatedAt: string;
  clientName: string;
  skillRequired: string;
  currentTrainer: string | null;
  clientTimings: string | null;
  trainersUsed: string | null;
  trainerName: string | null;
  trainerRecording: string | null;
  trainerTimings: string | null;
  trainerPhone: string | null;
  trainerEmail: string | null;
  proposals: TrainerProposal[] | null;
  status: string;
  priority: string;
  isEscalated: boolean;
  flaggedBy: { id: string; name: string } | null;
  lastUpdatedBy: { id: string; name: string } | null;
  comments: Comment[];
}

const STATUS_OPTIONS = [
  'Open', 'In Progress', 'Trainer Shared', 'Demo Scheduled', 'Demo Completed',
  'Session Started', 'Good', 'Bad', 'Call Not Received', 'Settled',
  'Not Settled', 'Rejected by Client', 'Trainer Not Available',
];

const PRIORITY_OPTIONS = ['High', 'Medium', 'Low'];

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  'Open':                 { bg: 'rgba(239,68,68,0.12)',  color: '#dc2626', border: 'rgba(239,68,68,0.3)' },
  'In Progress':          { bg: 'rgba(234,179,8,0.15)',  color: '#ca8a04', border: 'rgba(234,179,8,0.35)' },
  'Trainer Shared':       { bg: 'rgba(96,165,250,0.15)', color: '#2563eb', border: 'rgba(96,165,250,0.35)' },
  'Demo Scheduled':       { bg: 'rgba(96,165,250,0.15)', color: '#2563eb', border: 'rgba(96,165,250,0.35)' },
  'Demo Completed':       { bg: 'rgba(96,165,250,0.15)', color: '#2563eb', border: 'rgba(96,165,250,0.35)' },
  'Session Started':      { bg: 'rgba(34,197,94,0.12)',  color: '#16a34a', border: 'rgba(34,197,94,0.3)' },
  'Good':                 { bg: 'rgba(34,197,94,0.12)',  color: '#16a34a', border: 'rgba(34,197,94,0.3)' },
  'Settled':              { bg: 'rgba(34,197,94,0.12)',  color: '#16a34a', border: 'rgba(34,197,94,0.3)' },
  'Bad':                  { bg: 'rgba(239,68,68,0.12)',  color: '#dc2626', border: 'rgba(239,68,68,0.3)' },
  'Call Not Received':    { bg: 'rgba(239,68,68,0.12)',  color: '#dc2626', border: 'rgba(239,68,68,0.3)' },
  'Not Settled':          { bg: 'rgba(239,68,68,0.12)',  color: '#dc2626', border: 'rgba(239,68,68,0.3)' },
  'Rejected by Client':   { bg: 'rgba(239,68,68,0.12)',  color: '#dc2626', border: 'rgba(239,68,68,0.3)' },
  'Trainer Not Available':{ bg: 'rgba(239,68,68,0.12)',  color: '#dc2626', border: 'rgba(239,68,68,0.3)' },
};

const PRIORITY_STYLE: Record<string, { color: string }> = {
  High:   { color: '#dc2626' },
  Medium: { color: '#ca8a04' },
  Low:    { color: '#6b7280' },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || { bg: 'rgba(156,163,175,0.15)', color: '#6b7280', border: 'rgba(156,163,175,0.3)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
      {status}
    </span>
  );
}

function ageLabel(createdAt: string) {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const REGULAR_ROLES = ['founder', 'manager', 'lead', 'account_manager'];

// ── New Requirement Form ──────────────────────────────────────────────────────
function NewRequirementDialog({ onCreated }: { onCreated: () => void }) {
  const showToast = useUI((s) => s.showToast);
  const user = useAuth((s) => s.user);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    clientName: '', skillRequired: '', currentTrainer: '', clientTimings: '',
    trainersUsed: '', priority: 'Medium',
  });

  const create = useMutation({
    mutationFn: () => api.post('/freelance-requirements', f),
    onSuccess: () => { setOpen(false); onCreated(); showToast('Requirement added'); setF({ clientName: '', skillRequired: '', currentTrainer: '', clientTimings: '', trainersUsed: '', priority: 'Medium' }); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  if (!REGULAR_ROLES.includes(user?.role || '')) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary"><Plus size={14} className="mr-1" /> New Requirement</Button>
      </DialogTrigger>
      <DialogContent title="Add Freelance Requirement" description="Fill details for the Regular Team section.">
        <div className="space-y-3">
          <div className="form-row">
            <Label>Client Name *</Label>
            <Input value={f.clientName} onChange={(e) => setF({ ...f, clientName: e.target.value })} placeholder="e.g. Rahul Sharma" />
          </div>
          <div className="form-row">
            <Label>Skill Required *</Label>
            <Input value={f.skillRequired} onChange={(e) => setF({ ...f, skillRequired: e.target.value })} placeholder="e.g. Salesforce, Python, Data Analysis" />
          </div>
          <div className="form-row">
            <Label>Current Trainer (if any)</Label>
            <Input value={f.currentTrainer} onChange={(e) => setF({ ...f, currentTrainer: e.target.value })} placeholder="Name of current/previous trainer" />
          </div>
          <div className="form-row">
            <Label>Client Available Timings</Label>
            <Textarea value={f.clientTimings} onChange={(e) => setF({ ...f, clientTimings: e.target.value })} placeholder="e.g. 9 AM – 11 AM IST Mon–Fri, Evening 7–9 PM" rows={2} />
          </div>
          <div className="form-row">
            <Label>Trainers Already Used</Label>
            <Textarea value={f.trainersUsed} onChange={(e) => setF({ ...f, trainersUsed: e.target.value })} placeholder="Names of trainers already contacted / tried" rows={2} />
          </div>
          <div className="form-row">
            <Label>Priority</Label>
            <Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
              {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="primary" onClick={() => create.mutate()} disabled={!f.clientName || !f.skillRequired || create.isPending}>
            {create.isPending ? 'Adding…' : 'Add Requirement'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Comments Thread ───────────────────────────────────────────────────────────
function CommentsPanel({ req, onClose }: { req: FreelanceReq; onClose: () => void }) {
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const addComment = useMutation({
    mutationFn: () => api.post(`/freelance-requirements/${req.id}/comments`, { body }),
    onSuccess: () => { setBody(''); qc.invalidateQueries({ queryKey: ['freelance-requirements'] }); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
    }} onClick={onClose}>
      <div style={{
        width: 380, height: '100vh', background: 'var(--bg-card)',
        borderLeft: '1px solid var(--brand-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--brand-borderSoft)', fontWeight: 700, fontSize: 14 }}>
          Comments — {req.clientName}
          <button onClick={onClose} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--brand-textMuted)' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px' }}>
          {req.comments.length === 0 && <div className="muted text-[12px]">No comments yet.</div>}
          {req.comments.map((c) => (
            <div key={c.id} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--brand-textSecondary)' }}>{c.authorName} · {timeAgo(c.createdAt)}</div>
              <div style={{ fontSize: 13, marginTop: 2 }}>{c.body}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--brand-borderSoft)' }}>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment…"
            rows={3}
            className="w-full mb-2"
          />
          <Button variant="primary" onClick={() => addComment.mutate()} disabled={!body.trim() || addComment.isPending}>
            {addComment.isPending ? 'Posting…' : 'Post'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Empty proposal draft ──────────────────────────────────────────────────────
function emptyDraft(): TrainerProposal {
  return { trainerName: '', trainerPhone: '', trainerEmail: '', trainerRecording: '', trainerTimings: '', notes: '' };
}

// ── Propose Trainers Dialog ───────────────────────────────────────────────────
function ProposeDialog({ req, onClose }: { req: FreelanceReq; onClose: () => void }) {
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const [rows, setRows] = useState<TrainerProposal[]>([emptyDraft()]);

  function update(i: number, patch: Partial<TrainerProposal>) {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }

  const submit = useMutation({
    mutationFn: () => {
      const filled = rows.filter((r) => r.trainerName?.trim());
      if (!filled.length) return Promise.reject(new Error('Add at least one trainer name.'));
      return api.post(`/freelance-requirements/${req.id}/proposals`, { proposals: filled });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['freelance-requirements'] });
      showToast('Trainers proposed');
      onClose();
    },
    onError: (e: any) => showToast(e?.response?.data?.error || e?.message || 'Failed', 'error'),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`Propose trainers · ${req.clientName}`} description="Add 1 or more trainer proposals. You can add more later." className="max-w-2xl">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--brand-borderSoft)', background: 'var(--bg-input)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-accent)' }}>Trainer {i + 1}</span>
                {rows.length > 1 && (
                  <button onClick={() => setRows((p) => p.filter((_, ix) => ix !== i))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--status-red)' }}>
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="form-row"><Label>Name *</Label><Input value={r.trainerName || ''} onChange={(e) => update(i, { trainerName: e.target.value })} placeholder="Trainer name" /></div>
              <div className="form-row"><Label>Phone</Label><Input value={r.trainerPhone || ''} onChange={(e) => update(i, { trainerPhone: e.target.value })} placeholder="+91 9876543210" /></div>
              <div className="form-row"><Label>Email</Label><Input value={r.trainerEmail || ''} onChange={(e) => update(i, { trainerEmail: e.target.value })} placeholder="trainer@email.com" /></div>
              <div className="form-row"><Label>Recording link</Label><Input value={r.trainerRecording || ''} onChange={(e) => update(i, { trainerRecording: e.target.value })} placeholder="Drive / Loom link…" /></div>
              <div className="form-row" style={{ gridColumn: '1 / -1' }}><Label>Available timings</Label><Textarea value={r.trainerTimings || ''} onChange={(e) => update(i, { trainerTimings: e.target.value })} rows={2} placeholder="e.g. Mon–Fri 9–11 AM IST, evenings 7–9 PM" /></div>
              <div className="form-row" style={{ gridColumn: '1 / -1' }}><Label>Notes</Label><Textarea value={r.notes || ''} onChange={(e) => update(i, { notes: e.target.value })} rows={2} placeholder="Any additional info…" /></div>
            </div>
          ))}
          <Button onClick={() => setRows((p) => [...p, emptyDraft()])} variant="default">
            <Plus size={13} /> Add another trainer
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => submit.mutate()} disabled={submit.isPending}>
            {submit.isPending ? 'Saving…' : 'Submit proposals'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Requirement Card ──────────────────────────────────────────────────────────
function ReqCard({ req }: { req: FreelanceReq }) {
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const canDelete = ['founder', 'manager', 'lead'].includes(user?.role || '');
  const isRecruiter = user?.role === 'recruiter';
  const [showComments, setShowComments] = useState(false);
  const [showPropose, setShowPropose] = useState(false);

  const patch = useMutation({
    mutationFn: (data: Partial<FreelanceReq>) => api.patch(`/freelance-requirements/${req.id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['freelance-requirements'] }),
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const del = useMutation({
    mutationFn: () => api.delete(`/freelance-requirements/${req.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['freelance-requirements'] }); showToast('Deleted'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const removeProposal = useMutation({
    mutationFn: (idx: number) => api.delete(`/freelance-requirements/${req.id}/proposals/${idx}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['freelance-requirements'] }); showToast('Proposal removed'); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  function InlineText({ field, value, placeholder, multiline }: { field: keyof FreelanceReq; value: string | null; placeholder: string; multiline?: boolean }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value || '');
    if (isRecruiter) return <span style={{ color: value ? 'var(--brand-text)' : 'var(--brand-textSecondary)', fontStyle: value ? 'normal' : 'italic', fontSize: 12 }}>{value || placeholder}</span>;
    function save() { patch.mutate({ [field]: draft || null } as any); setEditing(false); }
    if (editing) {
      return (
        <div>
          {multiline
            ? <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} className="w-full text-[12px] mb-1" autoFocus />
            : <Input value={draft} onChange={(e) => setDraft(e.target.value)} className="text-[12px] mb-1" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }} />}
          <div className="flex gap-2">
            <button onClick={save} className="text-[11px] font-medium" style={{ color: 'var(--brand-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>Save</button>
            <button onClick={() => setEditing(false)} className="text-[11px] muted" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      );
    }
    return (
      <span onClick={() => setEditing(true)} className="flex items-center gap-1 group"
        style={{ cursor: 'pointer', color: value ? 'var(--brand-text)' : 'var(--brand-textMuted)', fontStyle: value ? 'normal' : 'italic', fontSize: 12 }}>
        {value || placeholder}
        <Pencil size={10} className="opacity-30 group-hover:opacity-80" style={{ flexShrink: 0 }} />
      </span>
    );
  }

  const proposals: TrainerProposal[] = Array.isArray(req.proposals) ? req.proposals : [];
  const escalatedBorder = req.isEscalated ? '2px solid rgba(249,115,22,0.6)' : '1px solid var(--brand-border)';

  return (
    <>
      <div style={{ background: 'var(--bg-card)', border: escalatedBorder, borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--brand-borderSoft)', background: req.isEscalated ? 'rgba(249,115,22,0.06)' : undefined }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {req.isEscalated && <span title="Escalated" style={{ color: '#f97316', display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700 }}><AlertTriangle size={13} /> ESCALATED</span>}
            <span style={{ fontWeight: 700, fontSize: 14 }}>{req.clientName}</span>
            <span style={{ fontSize: 12, color: PRIORITY_STYLE[req.priority]?.color || 'var(--brand-textSecondary)', fontWeight: 600 }}>{req.priority} Priority</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusPill status={req.status} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--brand-textSecondary)' }}><Clock size={11} /> {ageLabel(req.createdAt)}</span>
            <button onClick={() => setShowComments(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 11, color: 'var(--brand-textSecondary)' }}>
              <MessageSquare size={11} /> {req.comments.length}
            </button>
            <Button size="sm" variant="primary" onClick={() => setShowPropose(true)}>
              <Plus size={12} /> {proposals.length > 0 ? 'Add more' : 'Propose trainers'}
            </Button>
            {canDelete && (
              <button onClick={() => del.mutate()} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--status-red)', padding: 4 }}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Body: two columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
          {/* Left: Regular Team Input */}
          <div style={{ padding: '12px 16px', borderRight: '1px solid var(--brand-borderSoft)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-textSecondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Regular Team Input</div>
            <div style={{ display: 'grid', gap: 8 }}>
              <Field label="Skill Required"><InlineText field="skillRequired" value={req.skillRequired} placeholder="Add skill…" /></Field>
              <Field label="Current Trainer"><InlineText field="currentTrainer" value={req.currentTrainer} placeholder="None" /></Field>
              <Field label="Client Timings"><InlineText field="clientTimings" value={req.clientTimings} placeholder="Add timings…" multiline /></Field>
              <Field label="Trainers Already Used"><InlineText field="trainersUsed" value={req.trainersUsed} placeholder="None yet" multiline /></Field>
              <Field label="Status">
                {isRecruiter
                  ? <span style={{ fontSize: 12 }}>{req.status}</span>
                  : <Select value={req.status} onChange={(e) => patch.mutate({ status: e.target.value } as any)} style={{ fontSize: 12, padding: '3px 8px', height: 30 }}>{STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</Select>}
              </Field>
              <Field label="Priority">
                {isRecruiter
                  ? <span style={{ fontSize: 12 }}>{req.priority}</span>
                  : <Select value={req.priority} onChange={(e) => patch.mutate({ priority: e.target.value } as any)} style={{ fontSize: 12, padding: '3px 8px', height: 30 }}>{PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}</Select>}
              </Field>
            </div>
          </div>

          {/* Right: Freelance Team Proposals */}
          <div style={{ padding: '12px 16px', background: isRecruiter ? 'rgba(99,102,241,0.04)' : undefined }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, color: isRecruiter ? 'var(--brand-accent)' : 'var(--brand-textSecondary)' }}>
              {isRecruiter ? '✏️ Your section — Trainer proposals' : `Trainer Proposals · ${proposals.length}`}
            </div>
            {proposals.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--brand-textMuted)', fontStyle: 'italic', padding: '8px 0' }}>
                No trainers proposed yet. Click "Propose trainers" to add.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {proposals.map((p, i) => (
                  <div key={i} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--brand-borderSoft)', background: 'var(--bg-card)', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--brand-text)' }}>{p.trainerName || '—'}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {p.addedByName && <span style={{ fontSize: 10, color: 'var(--brand-textMuted)' }}>by {p.addedByName}</span>}
                        {!isRecruiter && (
                          <button
                            onClick={() => { if (confirm('Remove this proposal?')) removeProposal.mutate(i); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--status-red)', padding: 2 }}
                            title="Remove proposal"
                          ><X size={12} /></button>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px', fontSize: 11 }}>
                      {p.trainerPhone && <span style={{ color: 'var(--brand-textSecondary)' }}>📞 {p.trainerPhone}</span>}
                      {p.trainerEmail && <span style={{ color: 'var(--brand-textSecondary)' }}>✉ {p.trainerEmail}</span>}
                      {p.trainerTimings && <span style={{ gridColumn: '1 / -1', color: 'var(--brand-textSecondary)' }}>🕐 {p.trainerTimings}</span>}
                      {p.trainerRecording && (
                        <span style={{ gridColumn: '1 / -1' }}>
                          <a href={p.trainerRecording} target="_blank" rel="noreferrer" style={{ color: 'var(--brand-primary)', fontSize: 11 }}>🎙 Recording link</a>
                        </span>
                      )}
                      {p.notes && <span style={{ gridColumn: '1 / -1', color: 'var(--brand-textMuted)', fontStyle: 'italic' }}>{p.notes}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--brand-borderSoft)', fontSize: 11, color: 'var(--brand-textSecondary)', display: 'flex', gap: 16 }}>
          {req.flaggedBy && <span>Raised by: {req.flaggedBy.name}</span>}
          {req.lastUpdatedBy && <span>Last updated by: {req.lastUpdatedBy.name}</span>}
          <span>{new Date(req.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        </div>
      </div>
      {showComments && <CommentsPanel req={req} onClose={() => setShowComments(false)} />}
      {showPropose && <ProposeDialog req={req} onClose={() => setShowPropose(false)} />}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--brand-textSecondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const FILTER_OPTIONS = ['All', 'Open', 'In Progress', 'Escalated', 'Settled'];

export default function FreelanceRequirementsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('All');

  const { data: reqs = [], isLoading } = useQuery<FreelanceReq[]>({
    queryKey: ['freelance-requirements'],
    queryFn: () => api.get('/freelance-requirements').then((r) => r.data),
    refetchInterval: 5 * 60_000,
  });

  const escalated = reqs.filter((r) => r.isEscalated);

  const filtered = useMemo(() => {
    if (filter === 'All') return reqs;
    if (filter === 'Escalated') return reqs.filter((r) => r.isEscalated);
    if (filter === 'Settled') return reqs.filter((r) => r.status === 'Settled' || r.status === 'Session Started');
    return reqs.filter((r) => r.status === filter);
  }, [reqs, filter]);

  return (
    <>
      <Topbar
        title="Freelance Requirements"
        subtitle={escalated.length > 0 ? `${escalated.length} escalated` : `${reqs.length} total`}
        actions={<NewRequirementDialog onCreated={() => qc.invalidateQueries({ queryKey: ['freelance-requirements'] })} />}
      />
      <Page>
        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {FILTER_OPTIONS.map((f) => {
            const count = f === 'All' ? reqs.length
              : f === 'Escalated' ? escalated.length
              : f === 'Settled' ? reqs.filter((r) => r.status === 'Settled' || r.status === 'Session Started').length
              : reqs.filter((r) => r.status === f).length;
            const active = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer',
                  background: active ? 'var(--brand-primary)' : 'var(--bg-input)',
                  color: active ? '#fff' : 'var(--brand-textSecondary)',
                  border: active ? 'none' : '1px solid var(--brand-borderSoft)',
                }}
              >
                {f} {count > 0 && <span style={{ marginLeft: 4, opacity: 0.75 }}>({count})</span>}
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div className="muted text-[13px] py-12 text-center">Loading requirements…</div>
        ) : filtered.length === 0 ? (
          <div className="muted text-[13px] py-12 text-center">
            {filter === 'All' ? 'No freelance requirements yet. Click "New Requirement" to add one.' : `No requirements with filter "${filter}".`}
          </div>
        ) : (
          filtered.map((r) => <ReqCard key={r.id} req={r} />)
        )}
      </Page>
    </>
  );
}
