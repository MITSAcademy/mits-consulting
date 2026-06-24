import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { useUI } from '@/store/ui';
import { CheckCircle2 } from 'lucide-react';

interface Escalation {
  id: string;
  name: string;
  escalationFlaggedAt: string | null;
  escalationStatus: string | null;
  escalationActionsTaken: string | null;
  client: { id: string; name: string; lifecycle: string } | null;
  trainer: { id: string; name: string } | null;
  hostedByDefault: { id: string; name: string } | null;
  sessions: { scheduledFor: string; status: string }[];
}

const STATUS_OPTIONS = ['Work in Progress', 'Not Resolved', 'Resolved'];

function StatusBadge({ status }: { status: string | null }) {
  const color =
    status === 'Resolved' ? 'var(--status-green)' :
    status === 'Not Resolved' ? 'var(--status-red)' :
    status === 'Work in Progress' ? 'var(--status-yellow)' :
    'var(--brand-textSecondary)';
  return (
    <span style={{ color, fontWeight: 600, fontSize: 12 }}>{status || '—'}</span>
  );
}

function EscalationRow({ esc }: { esc: Escalation }) {
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const [status, setStatus] = useState(esc.escalationStatus || '');
  const [actions, setActions] = useState(esc.escalationActionsTaken || '');
  const [actionsEditing, setActionsEditing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [notes, setNotes] = useState('');

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

  const resolve = useMutation({
    mutationFn: () => api.post(`/escalations/${esc.id}/resolve`, { notes }),
    onSuccess: () => { showToast('Escalation resolved'); qc.invalidateQueries({ queryKey: ['escalations'] }); },
    onError: (e: any) => showToast(e?.response?.data?.error || 'Failed to resolve', 'error'),
  });

  const dateStr = esc.escalationFlaggedAt
    ? new Date(esc.escalationFlaggedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  return (
    <tr style={{ borderBottom: '1px solid var(--brand-borderSoft)' }}>
      {/* Date */}
      <td className="py-3 px-3 text-[13px] muted whitespace-nowrap">{dateStr}</td>

      {/* Client Name */}
      <td className="py-3 px-3 text-[13px] font-medium">
        {esc.client?.name || esc.name || '—'}
      </td>

      {/* Status dropdown */}
      <td className="py-3 px-3">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            patchStatus.mutate(e.target.value);
          }}
          className="input text-[12px] py-1"
          style={{ minWidth: 140 }}
        >
          <option value="">— Select —</option>
          {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {status && (
          <div className="mt-1"><StatusBadge status={status} /></div>
        )}
      </td>

      {/* Title */}
      <td className="py-3 px-3 text-[13px] muted">{esc.name || '—'}</td>

      {/* Actions Taken */}
      <td className="py-3 px-3" style={{ minWidth: 200, maxWidth: 300 }}>
        {actionsEditing ? (
          <div className="space-y-1">
            <textarea
              value={actions}
              onChange={(e) => setActions(e.target.value)}
              rows={3}
              className="input w-full resize-none text-[12px]"
              autoFocus
              placeholder="Describe actions taken…"
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
            className="text-[12px] cursor-pointer"
            style={{ color: actions ? 'var(--brand-text)' : 'var(--brand-textSecondary)' }}
            onClick={() => setActionsEditing(true)}
            title="Click to edit"
          >
            {actions || <span className="italic">Click to add notes…</span>}
          </div>
        )}
      </td>

      {/* Resolve */}
      <td className="py-3 px-3 text-right">
        {resolving ? (
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
        )}
      </td>
    </tr>
  );
}

export default function EscalationInboxPage() {
  const { data: escalations = [], isLoading } = useQuery<Escalation[]>({
    queryKey: ['escalations'],
    queryFn: () => api.get('/escalations').then((r) => r.data),
    refetchInterval: 10 * 60_000,
  });

  return (
    <>
      <Topbar
        title="Escalation Inbox"
        subtitle={escalations.length > 0 ? `${escalations.length} unresolved` : undefined}
      />
      <Page>
        <div className="callout">
          Trainings where a demo escalation has been requested. Update status and actions taken, then resolve each case.
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
                  {['Date', 'Client Name', 'Status', 'Title', 'Actions Taken', ''].map((h) => (
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
