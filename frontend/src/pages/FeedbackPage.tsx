import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Label, Select, Textarea, Input } from '@/components/ui/input';
import { useState, useMemo } from 'react';
import { useUI } from '@/store/ui';
import { EmptyState } from '@/components/EmptyState';
import { MessageSquare, Download, Phone, MessageCircle, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { todayISO } from '@/lib/utils';

// Returns the Monday of the week containing `date` as YYYY-MM-DD
function getWeekStart(date?: Date): string {
  const d = date ? new Date(date) : new Date();
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addWeeks(weekStart: string, n: number): string {
  const d = new Date(weekStart + 'T12:00:00');
  d.setDate(d.getDate() + n * 7);
  return getWeekStart(d);
}

function fmtWeekRange(weekStart: string): string {
  const mon = new Date(weekStart + 'T12:00:00');
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  return `${fmt(mon)} – ${fmt(sun)}`;
}

const COMM_STATUS_COLORS: Record<string, string> = {
  CallReceived:    'var(--status-green)',
  CallNotReceived: 'var(--status-red)',
  MessageSent:     'var(--status-amber)',
};
const COMM_STATUS_LABELS: Record<string, string> = {
  CallReceived:    'Picked',
  CallNotReceived: 'Not Picked',
  MessageSent:     'Message Sent',
};

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function FeedbackPage() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const user = useAuth((s) => s.user)!;

  // Week navigation — defaults to current week
  const currentWeek = getWeekStart();
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const isCurrentWeek = selectedWeek === currentWeek;

  // Fetch feedback records for the selected week only
  const { data: fb, isLoading: fbLoading } = useQuery({
    queryKey: ['feedback', selectedWeek],
    queryFn: () => api.get('/feedback', { params: { weekStart: selectedWeek } }).then((r) => r.data),
  });

  // Fetch all active trainings — same source as My Calls and Sessions
  const { data: trainings } = useQuery({
    queryKey: ['my-sessions-sheet'],
    queryFn: () => api.get('/regular-trainings/my-sessions').then((r) => r.data),
  });

  // Build de-duped client list from trainings (same order as My Sessions sheet)
  const trainingClients = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ id: string; name: string; phoneCode: string | null; phoneDigits: string | null; trainerId: string | null; trainerName: string | null }> = [];
    for (const t of (trainings || []) as any[]) {
      if (t.client && !seen.has(t.client.id)) {
        seen.add(t.client.id);
        out.push({
          id: t.client.id,
          name: t.client.name,
          phoneCode: t.client.phoneCode || null,
          phoneDigits: t.client.phoneDigits || null,
          trainerId: t.trainer?.id || null,
          trainerName: t.trainer?.name || null,
        });
      }
    }
    return out;
  }, [trainings]);

  // Map clientId → feedback record for selected week
  const fbByClient = useMemo(() => {
    const map = new Map<string, any>();
    for (const x of (fb || []) as any[]) {
      if (!x.clientId) continue;
      map.set(x.clientId, x);
    }
    return map;
  }, [fb]);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [editRow, setEditRow] = useState<any>(null);       // feedback record being edited
  const [activityRow, setActivityRow] = useState<any>(null); // feedback record for Log Activity
  const [activityType, setActivityType] = useState('Call');
  const [activityNote, setActivityNote] = useState('');
  const [activityDate, setActivityDate] = useState(todayISO());
  const [activityTime, setActivityTime] = useState('');
  // Inline editing state: clientId → { status, notes }
  const [inlineEdits, setInlineEdits] = useState<Record<string, { status: string; notes: string }>>({});
  const [savingInline, setSavingInline] = useState<Record<string, boolean>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: (data: any) => api.patch(`/feedback/${editRow.id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['feedback', selectedWeek] }); setEditRow(null); showToast('Updated'); },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/feedback/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['feedback', selectedWeek] }); showToast('Deleted'); },
    onError: () => showToast('Failed to delete feedback', 'error'),
  });

  // Ensure a feedback record exists for client, then open the Log Activity dialog
  const ensureAndLog = useMutation({
    mutationFn: (clientId: string) => api.post(`/feedback/ensure-client/${clientId}`, {}).then((r) => r.data),
    onSuccess: (fbRecord) => {
      setActivityRow(fbRecord);
      setActivityType('Call');
      setActivityNote('');
      setActivityDate(todayISO());
      setActivityTime('');
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const logActivity = useMutation({
    mutationFn: () => {
      const loggedAt = activityDate
        ? (activityTime ? `${activityDate}T${activityTime}:00` : `${activityDate}T12:00:00`)
        : undefined;
      return api.post(`/feedback/${activityRow.id}/activity`, { type: activityType, note: activityNote, loggedAt });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feedback', selectedWeek] });
      setActivityRow(null);
      setActivityNote('');
      showToast('Activity logged');
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  // Save inline status/notes edit for a client
  async function saveInline(clientId: string, fbRec: any) {
    const edit = inlineEdits[clientId];
    if (!edit) return;
    setSavingInline((p) => ({ ...p, [clientId]: true }));
    try {
      if (fbRec) {
        await api.patch(`/feedback/${fbRec.id}`, { communicationStatus: edit.status || null, notes: edit.notes || null });
      } else {
        // auto-create then patch
        const created = await api.post(`/feedback/ensure-client/${clientId}`, {}).then((r) => r.data);
        await api.patch(`/feedback/${created.id}`, { communicationStatus: edit.status || null, notes: edit.notes || null });
      }
      qc.invalidateQueries({ queryKey: ['feedback', selectedWeek] });
      setInlineEdits((p) => { const n = { ...p }; delete n[clientId]; return n; });
      showToast('Saved');
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Failed to save', 'error');
    } finally {
      setSavingInline((p) => { const n = { ...p }; delete n[clientId]; return n; });
    }
  }

  function startInline(clientId: string, fbRec: any) {
    if (inlineEdits[clientId]) return; // already editing
    setInlineEdits((p) => ({
      ...p,
      [clientId]: { status: fbRec?.communicationStatus || '', notes: fbRec?.notes || '' },
    }));
  }

  const filtered = useMemo(() => {
    let xs = trainingClients;
    if (search.trim()) {
      const q = search.toLowerCase();
      xs = xs.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phoneDigits || '').includes(q)
      );
    }
    if (filterStatus) {
      xs = xs.filter((c) => {
        const fbRec = fbByClient.get(c.id);
        return fbRec?.communicationStatus === filterStatus;
      });
    }
    return xs;
  }, [trainingClients, search, filterStatus, fbByClient]);

  function exportCSV() {
    if (!filtered.length) { showToast('Nothing to export', 'error'); return; }
    const esc = (v: string) => `"${(v || '').replace(/"/g, '""')}"`;
    const lines = ['Client,Phone,Status,Notes,Last Activity'];
    filtered.forEach((c) => {
      const fbRec = fbByClient.get(c.id);
      const phone = c.phoneCode && c.phoneDigits ? `${c.phoneCode}${c.phoneDigits}` : '';
      const status = COMM_STATUS_LABELS[fbRec?.communicationStatus] || '';
      const lastAct = fbRec?.activities?.[0];
      const actStr = lastAct ? `${lastAct.type} · ${fmtDateTime(lastAct.loggedAt)}` : '';
      lines.push([esc(c.name), esc(phone), esc(status), esc(fbRec?.notes || ''), esc(actStr)].join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `feedback-${todayISO()}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported');
  }

  return (
    <>
      <Topbar
        title="Feedback"
        subtitle={`${filtered.length} clients · ${fmtWeekRange(selectedWeek)}`}
        actions={
          <div className="flex gap-2">
            <Button size="sm" onClick={exportCSV}><Download size={13} /> Export CSV</Button>
          </div>
        }
      />
      <Page>
        {/* Week navigator */}
        <div className="flex items-center gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
          <button
            onClick={() => setSelectedWeek(w => addWeeks(w, -1))}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', color: 'var(--brand-text)', display: 'flex', alignItems: 'center' }}
          ><ChevronLeft size={14} /></button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 8, background: isCurrentWeek ? 'rgba(99,102,241,0.12)' : 'var(--bg-input)', border: `1px solid ${isCurrentWeek ? 'var(--brand-primary)' : 'var(--brand-borderSoft)'}`, fontSize: 13, fontWeight: 600, color: isCurrentWeek ? 'var(--brand-primary)' : 'var(--brand-text)' }}>
            {isCurrentWeek && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--brand-primary)', display: 'inline-block' }} />}
            {isCurrentWeek ? 'This week' : selectedWeek === addWeeks(currentWeek, -1) ? 'Last week' : 'Past'} · {fmtWeekRange(selectedWeek)}
          </div>
          <button
            onClick={() => setSelectedWeek(w => addWeeks(w, 1))}
            disabled={isCurrentWeek}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', borderRadius: 8, padding: '5px 10px', cursor: isCurrentWeek ? 'not-allowed' : 'pointer', opacity: isCurrentWeek ? 0.35 : 1, color: 'var(--brand-text)', display: 'flex', alignItems: 'center' }}
          ><ChevronRight size={14} /></button>
          {!isCurrentWeek && (
            <button
              onClick={() => setSelectedWeek(currentWeek)}
              style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8, background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            >Back to this week</button>
          )}
          {!isCurrentWeek && (
            <span style={{ fontSize: 11, color: 'var(--brand-textMuted)' }}>Viewing history — read-only</span>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-3">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 muted pointer-events-none" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search client / phone…"
              className="pl-7 pr-3 py-1.5 text-xs rounded-lg"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--brand-text)', width: 220, outline: 'none' }} />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="px-2 py-1.5 text-xs rounded-lg"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)', color: 'var(--brand-text)' }}>
            <option value="">All statuses</option>
            <option value="CallReceived">Picked</option>
            <option value="CallNotReceived">Not Picked</option>
            <option value="MessageSent">Message Sent</option>
          </select>
          {(search || filterStatus) && (
            <button onClick={() => { setSearch(''); setFilterStatus(''); }}
              className="px-2 py-1.5 text-xs rounded-lg muted hover:opacity-80"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}>Clear</button>
          )}
        </div>

        {fbLoading ? (
          <div className="table-card" style={{ padding: '16px 20px' }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'center' }}>
                <div style={{ height: 20, borderRadius: 4, background: 'var(--bg-input)', flex: '0 0 140px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                <div style={{ height: 20, borderRadius: 4, background: 'var(--bg-input)', flex: '0 0 100px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                <div style={{ height: 20, borderRadius: 4, background: 'var(--bg-input)', flex: 1, animation: 'pulse 1.5s ease-in-out infinite' }} />
              </div>
            ))}
          </div>
        ) : (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Notes</th>
                <th>Activity Log</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6}><EmptyState icon={MessageSquare} tone="gold"
                  title={search || filterStatus ? 'No matching clients' : 'No clients yet'}
                  description={search || filterStatus ? 'Try adjusting your search or filters.' : 'Clients appear here once assigned in My Sessions.'} /></td></tr>
              ) : filtered.map((c) => {
                const fbRec = fbByClient.get(c.id);
                const phone = c.phoneCode && c.phoneDigits ? `${c.phoneCode}${c.phoneDigits}` : null;
                const waPhone = phone?.replace(/[^0-9]/g, '');
                const latestActivity = fbRec?.activities?.[0];
                return (
                  <tr key={c.id}>
                    <td className="font-medium text-[13px]">{c.name}</td>
                    <td className="mono text-[11px]">
                      <div className="flex items-center gap-1">
                        <span>{phone || '—'}</span>
                        {phone && (<>
                          <a href={`tel:${phone}`} title="Call" className="opacity-60 hover:opacity-100"><Phone size={11} style={{ color: 'var(--brand-accent)' }} /></a>
                          <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer" title="WhatsApp" className="opacity-60 hover:opacity-100"><MessageCircle size={11} style={{ color: '#25D366' }} /></a>
                        </>)}
                      </div>
                    </td>

                    {/* Status — inline dropdown */}
                    <td onClick={() => isCurrentWeek && startInline(c.id, fbRec)} style={{ cursor: !isCurrentWeek ? 'default' : inlineEdits[c.id] ? 'default' : 'pointer', minWidth: 110 }}>
                      {inlineEdits[c.id] ? (
                        <select
                          value={inlineEdits[c.id].status}
                          onChange={(e) => setInlineEdits((p) => ({ ...p, [c.id]: { ...p[c.id], status: e.target.value } }))}
                          onKeyDown={(e) => { if (e.key === 'Escape') setInlineEdits((p) => { const n = { ...p }; delete n[c.id]; return n; }); }}
                          style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, border: '1px solid var(--brand-border)', background: 'var(--bg-input)', color: 'var(--brand-text)', width: '100%' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="">— None —</option>
                          <option value="CallReceived">Picked</option>
                          <option value="CallNotReceived">Not Picked</option>
                          <option value="MessageSent">Message Sent</option>
                        </select>
                      ) : (
                        fbRec?.communicationStatus
                          ? <span className="text-[11px] font-semibold" style={{ color: COMM_STATUS_COLORS[fbRec.communicationStatus] }}>{COMM_STATUS_LABELS[fbRec.communicationStatus]}</span>
                          : <span className="muted text-[11px]" style={{ borderBottom: '1px dashed var(--brand-borderSoft)' }}>—</span>
                      )}
                    </td>

                    {/* Notes — inline textarea, save on Ctrl+Enter or Save button */}
                    <td onClick={() => isCurrentWeek && startInline(c.id, fbRec)} style={{ cursor: !isCurrentWeek ? 'default' : inlineEdits[c.id] ? 'default' : 'pointer', minWidth: 180 }}>
                      {inlineEdits[c.id] ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                          <textarea
                            autoFocus
                            value={inlineEdits[c.id].notes}
                            onChange={(e) => setInlineEdits((p) => ({ ...p, [c.id]: { ...p[c.id], notes: e.target.value } }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveInline(c.id, fbRec); }
                              if (e.key === 'Escape') setInlineEdits((p) => { const n = { ...p }; delete n[c.id]; return n; });
                            }}
                            rows={2}
                            placeholder="Add notes… (Ctrl+Enter to save)"
                            style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--brand-border)', background: 'var(--bg-input)', color: 'var(--brand-text)', width: '100%', resize: 'none' }}
                          />
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              disabled={savingInline[c.id]}
                              onClick={() => saveInline(c.id, fbRec)}
                              style={{ fontSize: 11, padding: '2px 10px', borderRadius: 5, background: 'var(--brand-accent)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                            >
                              {savingInline[c.id] ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              onClick={() => setInlineEdits((p) => { const n = { ...p }; delete n[c.id]; return n; })}
                              style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, background: 'transparent', color: 'var(--brand-textMuted)', border: '1px solid var(--brand-border)', cursor: 'pointer' }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[12px] muted" style={{ display: 'block', maxWidth: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-word', borderBottom: fbRec?.notes ? 'none' : '1px dashed var(--brand-borderSoft)' }}>
                          {fbRec?.notes || '—'}
                        </span>
                      )}
                    </td>

                    {/* Activity Log — all entries */}
                    <td style={{ minWidth: 220 }}>
                      {fbRec?.activities?.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {(fbRec.activities as any[]).map((a: any) => (
                            <div key={a.id} style={{ fontSize: 11 }}>
                              <span className="font-medium" style={{ color: a.type === 'Call' ? 'var(--status-green)' : a.type === 'Message' ? 'var(--status-amber)' : 'var(--brand-textMuted)' }}>
                                {a.type}
                              </span>
                              <span className="muted"> · {a.loggedBy?.name} · </span>
                              <span className="muted" style={{ fontSize: 10 }}>{fmtDateTime(a.loggedAt)}</span>
                              {a.note && <div className="muted" style={{ fontSize: 11, paddingLeft: 2 }}>{a.note}</div>}
                            </div>
                          ))}
                        </div>
                      ) : <span className="muted text-[11px]">No activity yet</span>}
                    </td>

                    {/* Actions */}
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        {fbRec && isCurrentWeek && (
                          <>
                            <Button size="sm" onClick={() => setEditRow({ ...fbRec, trainerId: fbRec.trainer?.id || '', communicationStatus: fbRec.communicationStatus || '' })}>Edit</Button>
                            {deleteConfirm === fbRec.id ? (
                              <span className="flex items-center gap-1 text-[11px]">
                                Delete?{' '}
                                <Button size="sm" variant="danger" onClick={() => { del.mutate(deleteConfirm!); setDeleteConfirm(null); }}>Yes</Button>
                                <Button size="sm" onClick={() => setDeleteConfirm(null)}>No</Button>
                              </span>
                            ) : (
                              <Button size="sm" variant="danger" onClick={() => setDeleteConfirm(fbRec.id)}>Del</Button>
                            )}
                          </>
                        )}
                        {isCurrentWeek && (
                          <Button size="sm"
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)' }}
                            disabled={ensureAndLog.isPending}
                            onClick={() => ensureAndLog.mutate(c.id)}>
                            Log
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}

        {/* Edit dialog */}
        {editRow && (
          <Dialog open onOpenChange={(v) => !v && setEditRow(null)}>
            <DialogContent title={`Edit feedback — ${editRow.client?.name}`}>
              <div className="space-y-2">
                <div className="form-row"><Label>Status</Label>
                  <Select value={editRow.communicationStatus || ''} onChange={(e) => setEditRow({ ...editRow, communicationStatus: e.target.value })}>
                    <option value="">— Select —</option>
                    <option value="CallReceived">Picked</option>
                    <option value="CallNotReceived">Not Picked</option>
                    <option value="MessageSent">Message Sent</option>
                  </Select>
                </div>
                <div className="form-row"><Label>Notes</Label>
                  <Textarea value={editRow.notes || ''} onChange={(e) => setEditRow({ ...editRow, notes: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setEditRow(null)}>Cancel</Button>
                <Button variant="primary" disabled={update.isPending}
                  onClick={() => update.mutate({ notes: editRow.notes, communicationStatus: editRow.communicationStatus || null })}>
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Log Activity dialog */}
        {activityRow && (
          <Dialog open onOpenChange={(v) => !v && setActivityRow(null)}>
            <DialogContent title={`Log activity — ${activityRow.client?.name}`}>
              <div className="space-y-3">
                <div className="form-row"><Label>Activity type *</Label>
                  <Select value={activityType} onChange={(e) => setActivityType(e.target.value)}>
                    <option value="Call">Call</option>
                    <option value="Message">Message</option>
                    <option value="Note">Note</option>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="form-row"><Label>Date *</Label>
                    <Input type="date" value={activityDate} onChange={(e) => setActivityDate(e.target.value)} />
                  </div>
                  <div className="form-row"><Label>Time (optional)</Label>
                    <Input type="time" value={activityTime} onChange={(e) => setActivityTime(e.target.value)} />
                  </div>
                </div>
                <div className="form-row"><Label>Note (optional)</Label>
                  <Textarea value={activityNote} onChange={(e) => setActivityNote(e.target.value)} placeholder="What happened? Any details…" />
                </div>

                {/* Previous activities */}
                {activityRow.activities?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand-textMuted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Previous activity
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                      {activityRow.activities.map((a: any) => (
                        <div key={a.id} style={{ fontSize: 12, padding: '6px 10px', background: 'var(--bg-input)', borderRadius: 6, border: '1px solid var(--brand-borderSoft)' }}>
                          <span className="font-medium" style={{ color: a.type === 'Call' ? 'var(--status-green)' : a.type === 'Message' ? 'var(--status-amber)' : 'var(--brand-text)' }}>
                            {a.type}
                          </span>
                          <span className="muted"> · {a.loggedBy?.name} · {fmtDateTime(a.loggedAt)}</span>
                          {a.note && <div className="muted" style={{ marginTop: 2 }}>{a.note}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button onClick={() => setActivityRow(null)}>Cancel</Button>
                <Button variant="primary" disabled={logActivity.isPending || !activityDate} onClick={() => logActivity.mutate()}>
                  {logActivity.isPending ? 'Saving…' : 'Log activity'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </Page>
    </>
  );
}
