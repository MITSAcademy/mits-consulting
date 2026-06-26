import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { useUI } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { CheckCircle2 } from 'lucide-react';

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

// Color-coded status config
const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  'Work in Progress': {
    label: 'Work in Progress',
    bg: 'rgba(234,179,8,0.15)',
    color: '#ca8a04',
    border: 'rgba(234,179,8,0.4)',
  },
  'Not Resolved': {
    label: 'Not Resolved',
    bg: 'rgba(239,68,68,0.12)',
    color: '#dc2626',
    border: 'rgba(239,68,68,0.35)',
  },
  Resolved: {
    label: 'Resolved',
    bg: 'rgba(34,197,94,0.12)',
    color: '#16a34a',
    border: 'rgba(34,197,94,0.35)',
  },
};

const STATUS_OPTIONS = ['Work in Progress', 'Not Resolved', 'Resolved'];

function StatusPill({ status }: { status: string | null }) {
  if (!status) return <span style={{ color: 'var(--brand-textSecondary)', fontSize: 12 }}>— Select —</span>;
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return <span style={{ fontSize: 12 }}>{status}</span>;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: cfg.color, display: 'inline-block', flexShrink: 0,
      }} />
      {cfg.label}
    </span>
  );
}

const DEMO_ROLES = ['demo_lead', 'demo_intake'];
const MGMT_ROLES = ['founder', 'manager', 'lead'];

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
    mutationFn: (escalationStatus: string) =>
      api.patch(`/escalations/${esc.id}/status`, { escalationStatus }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['escalations'] }),
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const patchActions = useMutation({
    mutationFn: (escalationActionsTaken: string) =>
      api.patch(`/escalations/${esc.id}/status`, { escalationActionsTaken }),
    onSuccess: () => { setActionsEditing(false); qc.invalidateQueries({ queryKey: ['escalations'] }); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed', 'error'),
  });

  const patchAck = useMutation({
    mutationFn: (escalationDemoAck: string) =>
      api.patch(`/escalations/${esc.id}/status`, { escalationDemoAck }),
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

  // Row highlight if demo ack is missing
  const needsAck = !esc.escalationDemoAck;

  return (
    <tr style={{
      borderBottom: '1px solid var(--brand-borderSoft)',
      background: needsAck ? 'rgba(234,179,8,0.04)' : undefined,
    }}>
      {/* Date */}
      <td className="py-3 px-3 text-[13px] muted whitespace-nowrap">{dateStr}</td>

      {/* Client Name */}
      <td className="py-3 px-3 text-[13px] font-medium">
        {esc.client?.name || esc.name || '—'}
      </td>

      {/* Status — color pill selector (mgmt only edits status) */}
      <td className="py-3 px-3" style={{ minWidth: 170 }}>
        {isMgmt ? (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setStatusOpen((o) => !o)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <StatusPill status={status || null} />
              <span style={{ fontSize: 10, color: 'var(--brand-textSecondary)' }}>▾</span>
            </button>
            {statusOpen && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, zIndex: 50,
                background: 'var(--bg-card)', border: '1px solid var(--brand-border)',
                borderRadius: 10, padding: '6px 0', minWidth: 180, boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
              }}>
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      setStatus(opt);
                      setStatusOpen(false);
                      patchStatus.mutate(opt);
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '7px 14px', background: 'none', border: 'none',
                      cursor: 'pointer', textAlign: 'left',
                      fontWeight: status === opt ? 700 : 400,
                      color: STATUS_CONFIG[opt]?.color || 'var(--brand-text)',
                    }}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: STATUS_CONFIG[opt]?.color || 'var(--brand-textSecondary)',
                    }} />
                    <span style={{ fontSize: 13 }}>{opt}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <StatusPill status={status || null} />
        )}
      </td>

      {/* Title */}
      <td className="py-3 px-3 text-[13px] muted">{esc.name || '—'}</td>

      {/* Demo Team Acknowledgment — only demo team can write, everyone reads */}
      <td className="py-3 px-3" style={{ minWidth: 200, maxWidth: 260 }}>
        {ackEditing && isDemoTeam ? (
          <div className="space-y-1">
            <textarea
              value={ack}
              onChange={(e) => setAck(e.target.value)}
              rows={3}
              className="input w-full resize-none text-[12px]"
              autoFocus
              placeholder="Describe what the demo team is doing about this…"
            />
            <div className="flex gap-2">
              <button
                className="text-[11px] font-medium"
                style={{ color: 'var(--brand-primary)' }}
                onClick={() => patchAck.mutate(ack)}
                disabled={patchAck.isPending}
              >
                {patchAck.isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                className="text-[11px] muted"
                onClick={() => { setAckEditing(false); setAck(esc.escalationDemoAck || ''); }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            className="text-[12px]"
            style={{
              color: ack ? 'var(--brand-text)' : 'var(--status-amber)',
              cursor: isDemoTeam ? 'pointer' : 'default',
            }}
            onClick={() => isDemoTeam && setAckEditing(true)}
            title={isDemoTeam ? 'Click to acknowledge / respond' : undefined}
          >
            {ack || (
              <span style={{ fontStyle: 'italic', fontSize: 11 }}>
                {isDemoTeam ? '⚠ Click to acknowledge…' : '⚠ Awaiting demo team response'}
              </span>
            )}
          </div>
        )}
      </td>

      {/* Actions Taken — mgmt editable */}
      <td className="py-3 px-3" style={{ minWidth: 180, maxWidth: 260 }}>
        {actionsEditing && isMgmt ? (
          <div className="space-y-1">
            <textarea
              value={actions}
              onChange={(e) => setActions(e.target.value)}
              rows={3}
              className="input w-full resize-none text-[12px]"
              autoFocus
              placeholder="Actions taken by management…"
            />
            <div className="flex gap-2">
              <button
                className="text-[11px] font-medium"
                style={{ color: 'var(--brand-primary)' }}
                onClick={() => patchActions.mutate(actions)}
                disabled={patchActions.isPending}
              >
                {patchActions.isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                className="text-[11px] muted"
                onClick={() => { setActionsEditing(false); setActions(esc.escalationActionsTaken || ''); }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            className="text-[12px]"
            style={{
              color: actions ? 'var(--brand-text)' : 'var(--brand-textSecondary)',
              cursor: isMgmt ? 'pointer' : 'default',
            }}
            onClick={() => isMgmt && setActionsEditing(true)}
            title={isMgmt ? 'Click to edit' : undefined}
          >
            {actions || <span className="italic">—</span>}
          </div>
        )}
      </td>

      {/* Resolve — mgmt only */}
      <td className="py-3 px-3 text-right">
        {isMgmt && (
          resolving ? (
            <div className="space-y-1 text-left" style={{ minWidth: 200 }}>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Resolution notes (optional)…"
                rows={2}
                className="input w-full resize-none text-[12px]"
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate()}
                >
                  {resolve.isPending ? 'Resolving…' : <><CheckCircle2 size={12} className="mr-1" />Confirm</>}
                </Button>
                <Button onClick={() => { setResolving(false); setNotes(''); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button variant="primary" onClick={() => setResolving(true)}>
              Resolve
            </Button>
          )
        )}
      </td>
    </tr>
  );
}

export default function EscalationInboxPage() {
  const user = useAuth((s) => s.user);
  const { data: escalations = [], isLoading } = useQuery<Escalation[]>({
    queryKey: ['escalations'],
    queryFn: () => api.get('/escalations').then((r) => r.data),
    refetchInterval: 10 * 60_000,
  });

  const pendingAck = escalations.filter((e) => !e.escalationDemoAck).length;

  return (
    <>
      <Topbar
        title="Escalation Inbox"
        subtitle={escalations.length > 0 ? `${escalations.length} unresolved` : undefined}
      />
      <Page>
        <div className="callout">
          Trainings where a demo escalation has been requested.
          {DEMO_ROLES.includes(user?.role || '') && pendingAck > 0 && (
            <span style={{ marginLeft: 10, color: '#ca8a04', fontWeight: 600 }}>
              ⚠ {pendingAck} escalation{pendingAck > 1 ? 's' : ''} awaiting your acknowledgment.
            </span>
          )}
        </div>

        {isLoading ? (
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
                {escalations.map((e) => (
                  <EscalationRow key={e.id} esc={e} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Page>
    </>
  );
}
