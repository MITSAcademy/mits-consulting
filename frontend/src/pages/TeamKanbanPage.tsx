/**
 * Team Kanban — Mitali's assignment board + individual AM views.
 *
 * Mitali (manager):  4 columns — Unassigned | Bhavneet | Kashish | Muskan
 * Bhavneet (lead):   3 columns — her own + Kashish + Muskan (team overview)
 * Kashish / Muskan:  1 column  — their own clients only
 * Founder:           all 4 columns
 *
 * Each card: name, engagement type, next payment due (coloured), feedback warning.
 * Hover → reassign button (manager/founder only).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { useUI } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { ExternalLink, UserPlus, AlertTriangle, Clock, CheckCircle2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, Label } from '@/components/ui/input';
import { createPortal } from 'react-dom';

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
      <div className="rounded-2xl p-5 w-[320px]"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-border)' }}>
        <div className="font-bold text-sm mb-1">Assign AM — {client.name}</div>
        <div className="muted text-[11px] mb-3">Pick who handles sessions, feedback and trainer liaison.</div>
        <div className="form-row mb-4">
          <Label>Account manager</Label>
          <Select value={amId} onChange={(e) => setAmId(e.target.value)}>
            <option value="">— Unassigned —</option>
            {TEAM_MEMBERS.map(t => (
              <option key={t.id} value={t.id}>{t.name} · {t.role}</option>
            ))}
          </Select>
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

// ─── client card ──────────────────────────────────────────────────────────────

function ClientCard({ client, canAssign }: { client: Client; canAssign: boolean }) {
  const [assigning, setAssigning] = useState(false);
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
          {canAssign && (
            <button onClick={() => setAssigning(true)}
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-white/10"
              title="Reassign AM">
              <UserPlus size={12} style={{ color: 'var(--accent-gold)' }}/>
            </button>
          )}
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

        {/* Amount */}
        {client.cycleAmount > 0 && (
          <div className="text-[10px] muted mt-1 font-mono">
            {client.currency} {client.cycleAmount}
          </div>
        )}
      </div>

      {assigning && <AssignModal client={client} onClose={() => setAssigning(false)}/>}
    </>
  );
}

// ─── column ───────────────────────────────────────────────────────────────────

function KanbanColumn({
  title, subtitle, color, clients, canAssign,
}: {
  title: string;
  subtitle: string;
  color: string;
  clients: Client[];
  canAssign: boolean;
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
          clients.map(c => <ClientCard key={c.id} client={c} canAssign={canAssign}/>)
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
  const canAssign = role === 'manager' || role === 'founder';

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

    if (role === 'lead') {
      // Bhavneet sees her own + Kashish + Muskan
      return TEAM_MEMBERS.map(t => ({
        id: t.id,
        title: t.name,
        subtitle: t.role,
        color: t.color,
        clients: clients.filter(c => c.assignedAmId === t.id),
      }));
    }

    // manager / founder: all 4 columns
    return [
      { id: 'unassigned', title: 'Unassigned', subtitle: 'Needs an AM', color: 'var(--brand-textMuted)', clients: unassigned },
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
              />
            ))}
          </div>
        )}
      </Page>
    </>
  );
}
