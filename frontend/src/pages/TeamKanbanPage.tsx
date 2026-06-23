/**
 * Team Kanban — assignment board.
 *
 * Founder / Manager / Lead (Bhavneet):
 *   5 columns — All Clients | Unassigned | Bhavneet | Kashish | Muskan
 *
 * Kashish / Muskan (account_manager):
 *   1 column — their own clients only
 *
 * Each card: name, engagement type, next payment due (coloured), feedback warning.
 * Hover → reassign button (manager/founder/lead).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { useUI } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { ExternalLink, UserPlus, AlertTriangle, Clock, CheckCircle2, MessageSquare, ChevronDown, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPortal } from 'react-dom';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Textarea, Label } from '@/components/ui/input';

// ─── constants ────────────────────────────────────────────────────────────────

const TEAM_MEMBERS = [
  { id: 'u-bhavneet', name: 'Bhavneet', role: 'Lead',            color: 'var(--accent-gold)' },
  { id: 'u-kashish',  name: 'Kashish',  role: 'Account manager', color: '#60a5fa' },
  { id: 'u-muskan',   name: 'Muskan',   role: 'Account manager', color: '#a78bfa' },
];

// Which columns each role can see
const VISIBLE_COLUMNS: Record<string, string[]> = {
  founder:         ['unassigned', 'u-bhavneet', 'u-kashish', 'u-muskan'],
  manager:         ['unassigned', 'u-bhavneet', 'u-kashish', 'u-muskan'],
  lead:            ['u-bhavneet', 'u-kashish',  'u-muskan'],
  account_manager: [], // dynamic — filled by user's own id
};

// ─── types ────────────────────────────────────────────────────────────────────

interface Client {
  id: string;
  name: string;
  engagementType: string;
  lifecycle: string;
  cycleAmount: number;
  currency: string;
  payDate2: string | null;
  lastFeedbackTakenAt: string | null;
  assignedAmId: string | null;
  assignedAm: { id: string; name: string } | null;
  primaryTrainer: { id: string; name: string } | null;
  regularTrainings: Array<{ id: string; status: string; hostedByDefault: { id: string; name: string } | null }>;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function todayISO() { return new Date().toISOString().slice(0, 10); }

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]}`;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.parse(iso) - Date.parse(todayISO())) / 86_400_000);
}

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.parse(todayISO()) - Date.parse(iso)) / 86_400_000);
}

// ─── assign modal ─────────────────────────────────────────────────────────────

function AssignModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [amId, setAmId] = useState(client.assignedAmId || '');

  const save = useMutation({
    mutationFn: () => api.patch(`/clients/${client.id}`, { assignedAmId: amId || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients', 'team-kanban'] });
      const who = TEAM_MEMBERS.find(t => t.id === amId)?.name;
      showToast(who ? `Assigned to ${who}` : 'Unassigned');
      onClose();
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const content = (
    <div className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 9999, background: 'rgba(0,0,0,0.55)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-2xl p-5 w-[360px]"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}>
        <div className="font-bold text-sm mb-0.5">Assign coordinator</div>
        <div className="text-xs mb-4" style={{ color: 'var(--accent-gold)' }}>{client.name}</div>

        {/* Coordinator cards */}
        <div className="flex flex-col gap-2 mb-4">
          {/* Unassigned option */}
          <button
            onClick={() => setAmId('')}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all"
            style={{
              background: amId === '' ? 'rgba(148,163,184,0.15)' : 'var(--bg-input)',
              border: `1px solid ${amId === '' ? 'rgba(148,163,184,0.5)' : 'var(--brand-borderSoft)'}`,
            }}
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
              style={{ background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>—</div>
            <div>
              <div className="text-sm font-semibold" style={{ color: '#94a3b8' }}>Unassigned</div>
              <div className="text-[10px]" style={{ color: 'var(--brand-textMuted)' }}>No coordinator yet</div>
            </div>
            {amId === '' && <div className="ml-auto w-4 h-4 rounded-full flex items-center justify-center" style={{ background: '#94a3b8' }}>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>}
          </button>

          {TEAM_MEMBERS.map(t => {
            const selected = amId === t.id;
            const ini = t.name.split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2);
            return (
              <button
                key={t.id}
                onClick={() => setAmId(t.id)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all"
                style={{
                  background: selected ? `${t.color}18` : 'var(--bg-input)',
                  border: `1px solid ${selected ? t.color + '60' : 'var(--brand-borderSoft)'}`,
                }}
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: t.color + '25', color: t.color }}>
                  {ini}
                </div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: selected ? t.color : 'var(--brand-text)' }}>{t.name}</div>
                  <div className="text-[10px]" style={{ color: 'var(--brand-textMuted)' }}>{t.role}</div>
                </div>
                {selected && <div className="ml-auto w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: t.color }}>
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 justify-end">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Assign'}
          </Button>
        </div>
      </div>
    </div>
  );
  return createPortal(content, document.body);
}

// ─── host chip ────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

function HostChip({ training, canReassign }: { training: Client['regularTrainings'][0]; canReassign: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const reassign = useMutation({
    mutationFn: (userId: string | null) =>
      api.patch(`/regular-trainings/trainings/${training.id}`, { hostedByDefaultId: userId }),
    onSuccess: (_data, userId) => {
      qc.invalidateQueries({ queryKey: ['clients', 'team-kanban'] });
      const who = TEAM_MEMBERS.find(t => t.id === userId)?.name;
      showToast(who ? `Host set to ${who}` : 'Host cleared');
      setOpen(false);
    },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const host = training.hostedByDefault;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={(e) => { e.stopPropagation(); if (canReassign) setOpen(v => !v); }}
        className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold transition-colors"
        style={{
          background: host ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${host ? 'rgba(251,191,36,0.30)' : 'rgba(255,255,255,0.12)'}`,
          color: host ? 'var(--accent-gold)' : 'var(--brand-textMuted)',
          cursor: canReassign ? 'pointer' : 'default',
        }}
        title={host ? `Host: ${host.name}` : 'No host assigned'}
      >
        {host ? initials(host.name) : '—'}
        {canReassign && <ChevronDown size={8} style={{ opacity: 0.6 }}/>}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 rounded-xl overflow-hidden z-50"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)', minWidth: 130, boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}
          onClick={e => e.stopPropagation()}>
          <div className="text-[10px] font-semibold uppercase tracking-wide px-2.5 pt-2 pb-1" style={{ color: 'var(--brand-textMuted)' }}>Set host</div>
          {TEAM_MEMBERS.map(m => (
            <button
              key={m.id}
              disabled={reassign.isPending}
              onClick={() => reassign.mutate(m.id)}
              className="w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-white/5 flex items-center gap-2"
              style={{ color: host?.id === m.id ? 'var(--accent-gold)' : 'var(--brand-text)', fontWeight: host?.id === m.id ? 600 : 400 }}
            >
              <span className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[9px] font-bold shrink-0"
                style={{ background: m.color + '33', color: m.color }}>
                {initials(m.name)}
              </span>
              {m.name}
            </button>
          ))}
          {host && (
            <button
              disabled={reassign.isPending}
              onClick={() => reassign.mutate(null)}
              className="w-full text-left px-2.5 py-1.5 text-[10px] hover:bg-white/5 border-t"
              style={{ color: 'var(--status-red)', borderColor: 'var(--brand-borderSoft)' }}
            >
              Clear host
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── call log modal ───────────────────────────────────────────────────────────

function CallLogModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const showToast = useUI((s) => s.showToast);
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState<'answered' | 'no_answer' | 'callback'>('answered');

  const log = useMutation({
    mutationFn: () => api.post('/call-logs', {
      clientId: client.id,
      kind: 'checkin',
      outcome: outcome === 'answered' ? 'connected' : outcome === 'no_answer' ? 'no_answer' : 'callback_requested',
      notes: note || undefined,
    }),
    onSuccess: () => { showToast('Call logged ✓'); onClose(); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed to log call', 'error'),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`Log call · ${client.name}`} className="max-w-sm">
        <div className="space-y-3">
          <div>
            <Label>Outcome</Label>
            <div className="flex gap-2 mt-1">
              {(['answered', 'no_answer', 'callback'] as const).map(o => (
                <button key={o} onClick={() => setOutcome(o)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors"
                  style={{
                    background: outcome === o ? 'var(--brand-accent)' : 'var(--bg-input)',
                    color: outcome === o ? '#fff' : 'var(--brand-text)',
                    borderColor: outcome === o ? 'var(--brand-accent)' : 'var(--brand-border)',
                  }}>
                  {o === 'answered' ? '✓ Answered' : o === 'no_answer' ? '✗ No answer' : '↩ Callback'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={note} onChange={(e: any) => setNote(e.target.value)}
              placeholder="What was discussed? Any follow-up needed?" rows={3} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={log.isPending} onClick={() => log.mutate()}>
            <Phone size={12}/> {log.isPending ? 'Saving…' : 'Log call'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── client card ──────────────────────────────────────────────────────────────

function ClientCard({ client, canAssign, canReassignHost, showAmount = true, canLogCall = false, isUnassigned = false, isAllColumn = false }: { client: Client; canAssign: boolean; canReassignHost: boolean; showAmount?: boolean; canLogCall?: boolean; isUnassigned?: boolean; isAllColumn?: boolean }) {
  const [assigning, setAssigning] = useState(false);
  const [loggingCall, setLoggingCall] = useState(false);
  const activeTraining = client.regularTrainings?.[0] ?? null;
  const due = daysUntil(client.payDate2);
  const fbAge = daysAgo(client.lastFeedbackTakenAt);
  const feedbackWarn = fbAge === null || fbAge > 30;
  const isOverdue = due !== null && due < 0;
  const isDueSoon = due !== null && due >= 0 && due <= 3;

  return (
    <>
      <div className="rounded-xl p-3 mb-2 group cursor-default" style={{
        background: 'var(--bg-card)',
        border: `1px solid ${
          isOverdue  ? 'rgba(239,68,68,0.40)' :
          isDueSoon  ? 'rgba(245,158,11,0.35)' :
          'var(--brand-borderSoft)'}`,
        boxShadow: isOverdue ? '0 0 0 1px rgba(239,68,68,0.10) inset' : undefined,
      }}>
        {/* Header row */}
        <div className="flex items-start justify-between gap-1">
          <Link to={`/clients/${client.id}`}
            className="font-semibold text-[12px] hover:underline flex items-center gap-1 leading-tight"
            style={{ color: 'var(--brand-text)' }}>
            {client.name}
            <ExternalLink size={9} className="opacity-0 group-hover:opacity-60"/>
          </Link>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {canLogCall && (
              <button onClick={() => setLoggingCall(true)}
                className="p-0.5 rounded hover:bg-white/10"
                title="Log call">
                <Phone size={12} style={{ color: 'var(--status-green)' }}/>
              </button>
            )}
            {canAssign && !isUnassigned && (
              <button onClick={() => setAssigning(true)}
                className="p-0.5 rounded hover:bg-white/10"
                title="Reassign AM">
                <UserPlus size={12} style={{ color: 'var(--accent-gold)' }}/>
              </button>
            )}
          </div>
        </div>

        {/* Engagement type */}
        <div className="text-[10px] muted mt-0.5">{client.engagementType}</div>

        {/* Payment row */}
        <div className="flex items-center gap-1 mt-1.5 text-[11px]">
          {isOverdue ? <AlertTriangle size={10} style={{ color: 'var(--status-red)' }}/> :
           isDueSoon  ? <Clock size={10} style={{ color: 'var(--status-amber)' }}/> :
                        <CheckCircle2 size={10} style={{ color: 'var(--status-green)', opacity: 0.6 }}/>}
          <span style={{
            color: isOverdue ? 'var(--status-red)' : isDueSoon ? 'var(--status-amber)' : 'var(--brand-textSecondary)',
            fontWeight: isOverdue || isDueSoon ? 600 : 400,
          }}>
            {client.payDate2
              ? (isOverdue
                  ? `${Math.abs(due!)}d overdue · ${fmtDate(client.payDate2)}`
                  : `Due ${fmtDate(client.payDate2)}${isDueSoon ? ` (${due}d)` : ''}`)
              : 'No due date'}
          </span>
        </div>

        {/* Feedback warning */}
        {feedbackWarn && (
          <div className="flex items-center gap-1 mt-0.5 text-[10px]"
            style={{ color: 'var(--status-amber)' }}>
            <MessageSquare size={9}/>
            <span>{fbAge === null ? 'Feedback never taken' : `Feedback ${fbAge}d ago`} ⚠</span>
          </div>
        )}

        {/* Amount — hidden for lead role */}
        {showAmount && client.cycleAmount > 0 && (
          <div className="text-[10px] muted mt-1 font-mono">
            {client.currency} {client.cycleAmount}
          </div>
        )}

        {/* Host chip — only when there's an active regular training */}
        {activeTraining && (
          <div className="flex items-center gap-1 mt-1.5">
            <span className="text-[10px] muted">Host</span>
            <HostChip training={activeTraining} canReassign={canReassignHost} />
          </div>
        )}

        {/* Assign button — always visible on unassigned cards */}
        {/* In All Clients column — show assigned AM as a small tag */}
        {isAllColumn && (
          <div className="mt-1.5 text-[10px]" style={{ color: 'var(--brand-textMuted)' }}>
            {client.assignedAm
              ? <span style={{ color: TEAM_MEMBERS.find(t => t.id === client.assignedAm?.id)?.color || 'var(--accent-gold)' }}>
                  👤 {client.assignedAm.name}
                </span>
              : <span style={{ color: 'var(--status-amber)' }}>⚠ Unassigned</span>}
          </div>
        )}

        {canAssign && isUnassigned && (
          <button
            onClick={() => setAssigning(true)}
            className="mt-2 w-full flex items-center justify-center gap-1 rounded-lg py-1 text-[11px] font-semibold transition-colors hover:opacity-90"
            style={{ background: 'rgba(251,191,36,0.15)', color: 'var(--accent-gold)', border: '1px solid rgba(251,191,36,0.30)' }}>
            <UserPlus size={11}/> Assign AM
          </button>
        )}
      </div>

      {assigning && <AssignModal client={client} onClose={() => setAssigning(false)}/>}
      {loggingCall && <CallLogModal client={client} onClose={() => setLoggingCall(false)}/>}
    </>
  );
}

// ─── column ───────────────────────────────────────────────────────────────────

function KanbanColumn({
  title, subtitle, color, clients, canAssign, canReassignHost, showAmount, canLogCall, isUnassigned, isAllColumn,
}: {
  title: string;
  subtitle: string;
  color: string;
  clients: Client[];
  canAssign: boolean;
  canReassignHost: boolean;
  showAmount?: boolean;
  canLogCall?: boolean;
  isUnassigned?: boolean;
  isAllColumn?: boolean;
}) {
  const overdue = clients.filter(c => {
    const d = daysUntil(c.payDate2);
    return d !== null && d < 0;
  }).length;
  const dueSoon = clients.filter(c => {
    const d = daysUntil(c.payDate2);
    return d !== null && d >= 0 && d <= 3;
  }).length;

  return (
    <div className="flex flex-col rounded-2xl" style={{
      minWidth: 240,
      maxWidth: 280,
      flex: '1 1 0',
      background: 'var(--bg-input)',
      border: '1px solid var(--brand-borderSoft)',
    }}>
      {/* Column header */}
      <div className="px-3 py-3" style={{ borderBottom: '1px solid var(--brand-borderSoft)' }}>
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }}/>
            <span className="font-bold text-[13px]">{title}</span>
          </div>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: 'var(--bg-card)', color: 'var(--brand-textSecondary)' }}>
            {clients.length}
          </span>
        </div>
        <div className="text-[10px] muted pl-[18px]">{subtitle}</div>
        {(overdue > 0 || dueSoon > 0) && (
          <div className="flex gap-2 mt-1 pl-[18px]">
            {overdue > 0 && <span className="text-[10px] font-semibold" style={{ color: 'var(--status-red)' }}>{overdue} overdue</span>}
            {dueSoon > 0 && <span className="text-[10px] font-semibold" style={{ color: 'var(--status-amber)' }}>{dueSoon} due soon</span>}
          </div>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2" style={{ maxHeight: 'calc(100vh - 220px)' }}>
        {clients.length === 0 ? (
          <div className="text-[11px] muted text-center py-8">No active clients</div>
        ) : (
          clients.map(c => <ClientCard key={c.id} client={c} canAssign={canAssign} canReassignHost={canReassignHost} showAmount={showAmount} canLogCall={canLogCall} isUnassigned={isUnassigned} isAllColumn={isAllColumn}/>)
        )}
      </div>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export function TeamKanbanPage() {
  const user = useAuth((s) => s.user);
  const [search, setSearch] = useState('');

  const { data: allClients = [], isLoading } = useQuery<Client[]>({
    queryKey: ['clients', 'team-kanban'],
    queryFn: () =>
      api.get('/clients?lifecycle=Active,LeverageGranted&scope=team').then((r) => r.data),
  });

  const clients = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return allClients;
    return allClients.filter(c => c.name.toLowerCase().includes(q));
  }, [allClients, search]);

  // Determine which columns this role sees
  const role = user?.role || '';
  const canAssign = role === 'manager' || role === 'founder' || role === 'lead';
  const canReassignHost = role === 'lead';
  const showAmount = role === 'founder' || role === 'manager' || role === 'accounts';
  const canLogCall = role === 'manager' || role === 'founder' || role === 'lead' || role === 'account_manager';

  const columns = useMemo(() => {
    const unassigned = clients.filter(c => !c.assignedAmId);

    if (role === 'account_manager') {
      // AM sees only their own column
      const mine = clients.filter(c => c.assignedAmId === user?.id);
      const me = TEAM_MEMBERS.find(t => t.id === user?.id);
      return [
        {
          id: 'mine',
          title: me?.name || 'My clients',
          subtitle: me?.role || 'Account manager',
          color: me?.color || 'var(--accent-gold)',
          clients: mine,
        },
      ];
    }

    // lead / manager / founder: 5 columns — All | Unassigned | Bhavneet | Kashish | Muskan
    return [
      {
        id: 'all',
        title: 'All Clients',
        subtitle: 'Every active client',
        color: '#94a3b8',
        clients: clients,
      },
      {
        id: 'unassigned',
        title: 'Unassigned',
        subtitle: 'New · needs a coordinator',
        color: 'var(--brand-textMuted)',
        clients: unassigned,
      },
      ...TEAM_MEMBERS.map(t => ({
        id: t.id,
        title: t.name,
        subtitle: t.role,
        color: t.color,
        clients: clients.filter(c => c.assignedAmId === t.id),
      })),
    ];
  }, [clients, role, user?.id]);

  const total = allClients.length;
  const assigned = allClients.filter(c => c.assignedAmId).length;

  return (
    <>
      <Topbar
        title="Team board"
        subtitle={`${total} active · ${total - assigned} unassigned`}
        actions={
          <input
            type="text"
            placeholder="Search client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-[12px] outline-none"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--brand-border)',
              color: 'var(--brand-text)',
              width: 200,
            }}
          />
        }
      />
      <Page>
        {isLoading ? (
          <div className="muted text-sm">Loading…</div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-6" style={{ alignItems: 'flex-start', minHeight: '60vh' }}>
            {columns.map(col => (
              <KanbanColumn
                key={col.id}
                title={col.title}
                subtitle={col.subtitle}
                color={col.color}
                clients={col.clients}
                canAssign={canAssign}
                canReassignHost={canReassignHost}
                showAmount={showAmount}
                canLogCall={canLogCall}
                isUnassigned={col.id === 'unassigned'}
                isAllColumn={col.id === 'all'}
              />
            ))}
          </div>
        )}
      </Page>
    </>
  );
}
