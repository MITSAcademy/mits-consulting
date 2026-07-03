import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { useState, useMemo } from 'react';
import { useUI } from '@/store/ui';
import { EmptyState } from '@/components/EmptyState';
import { MessageSquare, Download, Phone, MessageCircle, Search, ClipboardList, Clock } from 'lucide-react';
import { todayISO } from '@/lib/utils';

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
  const { data: fb } = useQuery({ queryKey: ['feedback'], queryFn: () => api.get('/feedback').then((r) => r.data) });
  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: () => api.get('/clients').then((r) => r.data) });
  const { data: trainers } = useQuery({ queryKey: ['trainers'], queryFn: () => api.get('/trainers').then((r) => r.data) });

  const [open, setOpen] = useState(false);
  const [editRow, setEditRow] = useState<any>(null);
  const [activityRow, setActivityRow] = useState<any>(null); // feedback row for Log Activity
  const [activityType, setActivityType] = useState('Call');
  const [activityNote, setActivityNote] = useState('');
  const [f, setF] = useState({ clientId: '', weekStart: todayISO(), rating: 5, notes: '', communicationStatus: '', trainerId: '' });
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const create = useMutation({
    mutationFn: () => api.post('/feedback', { ...f, rating: +f.rating, communicationStatus: f.communicationStatus || null, trainerId: f.trainerId || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['feedback'] }); setOpen(false); showToast('Logged'); },
  });

  const update = useMutation({
    mutationFn: (data: any) => api.patch(`/feedback/${editRow.id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['feedback'] }); setEditRow(null); showToast('Updated'); },
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/feedback/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['feedback'] }); showToast('Deleted'); },
  });

  const logActivity = useMutation({
    mutationFn: () => api.post(`/feedback/${activityRow.id}/activity`, { type: activityType, note: activityNote }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feedback'] });
      setActivityRow(null);
      setActivityNote('');
      setActivityType('Call');
      showToast('Activity logged');
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'Failed', 'error'),
  });

  const filtered = useMemo(() => {
    let xs = fb || [];
    if (search.trim()) {
      const q = search.toLowerCase();
      xs = xs.filter((x: any) =>
        x.client?.name?.toLowerCase().includes(q) ||
        (x.client?.phoneDigits || '').includes(q)
      );
    }
    if (filterStatus) xs = xs.filter((x: any) => x.communicationStatus === filterStatus);
    return xs;
  }, [fb, search, filterStatus]);

  function exportCSV() {
    const rows = filtered as any[];
    if (!rows.length) { showToast('Nothing to export', 'error'); return; }
    const lines = ['Date,Client,Phone,Status,Notes'];
    rows.forEach((x) => {
      const esc = (v: string) => `"${(v || '').replace(/"/g, '""')}"`;
      const phone = x.client?.phoneCode && x.client?.phoneDigits ? `${x.client.phoneCode}${x.client.phoneDigits}` : '';
      lines.push([esc(x.weekStart), esc(x.client?.name), esc(phone), esc(COMM_STATUS_LABELS[x.communicationStatus] || x.communicationStatus || ''), esc(x.notes)].join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `feedback-${todayISO()}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported');
  }

  const activeClients = (clients || []).filter((c: any) => c.lifecycle === 'Active');

  return (
    <>
      <Topbar title="Feedback" actions={
        <>
          <Button size="sm" onClick={exportCSV}><Download size={13} /> Export CSV</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button variant="primary">+ Log feedback</Button></DialogTrigger>
            <DialogContent title="Log feedback">
              <div className="space-y-2">
                <div className="form-row"><Label>Client *</Label><Select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}>
                  <option value="">— Select —</option>{activeClients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select></div>
                <div className="form-row"><Label>Trainer (optional)</Label><Select value={f.trainerId} onChange={(e) => setF({ ...f, trainerId: e.target.value })}>
                  <option value="">— None —</option>{(trainers || []).filter((t: any) => t.active).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="form-row"><Label>Feedback date *</Label><Input type="date" value={f.weekStart} onChange={(e) => setF({ ...f, weekStart: e.target.value })} /></div>
                  <div className="form-row"><Label>Rating (1–5)</Label><Input type="number" min={1} max={5} value={f.rating} onChange={(e) => setF({ ...f, rating: +e.target.value })} /></div>
                </div>
                <div className="form-row"><Label>Status</Label><Select value={f.communicationStatus} onChange={(e) => setF({ ...f, communicationStatus: e.target.value })}>
                  <option value="">— Select —</option>
                  <option value="CallReceived">Picked</option>
                  <option value="CallNotReceived">Not Picked</option>
                  <option value="MessageSent">Message Sent</option>
                </Select></div>
                <div className="form-row"><Label>Notes</Label><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!f.clientId} onClick={() => create.mutate()}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      } />
      <Page>
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

        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Notes</th>
                <th>Activity log</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(filtered as any[]).length === 0 ? (
                <tr><td colSpan={7}><EmptyState icon={MessageSquare} tone="gold" title="No feedback yet" description="Log feedback using the button above." /></td></tr>
              ) : (filtered as any[]).map((x: any) => {
                const phone = x.client?.phoneCode && x.client?.phoneDigits ? `${x.client.phoneCode}${x.client.phoneDigits}` : null;
                const waPhone = phone?.replace(/[^0-9]/g, '');
                const latestActivity = x.activities?.[0];
                return (
                  <tr key={x.id}>
                    <td className="mono text-[12px]">{x.weekStart}</td>
                    <td className="font-medium">{x.client?.name || '—'}</td>
                    <td className="mono text-[11px]">
                      <div className="flex items-center gap-1">
                        <span>{phone || '—'}</span>
                        {phone && (<>
                          <a href={`tel:${phone}`} title="Call" className="opacity-60 hover:opacity-100"><Phone size={11} style={{ color: 'var(--brand-accent)' }} /></a>
                          <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer" title="WhatsApp" className="opacity-60 hover:opacity-100"><MessageCircle size={11} style={{ color: '#25D366' }} /></a>
                        </>)}
                      </div>
                    </td>
                    <td>
                      {x.communicationStatus
                        ? <span className="text-[11px] font-semibold" style={{ color: COMM_STATUS_COLORS[x.communicationStatus] }}>{COMM_STATUS_LABELS[x.communicationStatus]}</span>
                        : <span className="muted text-[11px]">—</span>}
                    </td>
                    <td className="text-[12px] muted max-w-[180px] truncate">{x.notes || '—'}</td>
                    <td style={{ minWidth: 180 }}>
                      {latestActivity ? (
                        <div style={{ fontSize: 11 }}>
                          <span className="font-medium" style={{ color: latestActivity.type === 'Call' ? 'var(--status-green)' : latestActivity.type === 'Message' ? 'var(--status-amber)' : 'var(--brand-textMuted)' }}>
                            {latestActivity.type}
                          </span>
                          <span className="muted"> · {latestActivity.loggedBy?.name} · </span>
                          <span className="muted" style={{ fontSize: 10 }}>{fmtDateTime(latestActivity.loggedAt)}</span>
                          {latestActivity.note && <div className="muted truncate" style={{ maxWidth: 160, fontSize: 11 }}>{latestActivity.note}</div>}
                          {x.activities.length > 1 && <span className="muted" style={{ fontSize: 10 }}> +{x.activities.length - 1} more</span>}
                        </div>
                      ) : <span className="muted text-[11px]">No activity</span>}
                    </td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        <Button size="sm" onClick={() => setEditRow({ ...x, trainerId: x.trainer?.id || '', communicationStatus: x.communicationStatus || '' })}>Edit</Button>
                        <Button size="sm" variant="danger" onClick={() => { if (confirm('Delete?')) del.mutate(x.id); }}>Del</Button>
                        <Button size="sm" onClick={() => { setActivityRow(x); setActivityType('Call'); setActivityNote(''); }}
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-border)' }}>
                          <ClipboardList size={11} style={{ marginRight: 4 }} />Log
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Edit dialog */}
        {editRow && (
          <Dialog open onOpenChange={(v) => !v && setEditRow(null)}>
            <DialogContent title="Edit feedback">
              <div className="space-y-2">
                <div className="text-sm font-medium mb-1">{editRow.client?.name}</div>
                <div className="form-row"><Label>Trainer (optional)</Label><Select value={editRow.trainerId || ''} onChange={(e) => setEditRow({ ...editRow, trainerId: e.target.value })}>
                  <option value="">— None —</option>{(trainers || []).filter((t: any) => t.active).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="form-row"><Label>Feedback date</Label><Input type="date" value={editRow.weekStart} onChange={(e) => setEditRow({ ...editRow, weekStart: e.target.value })} /></div>
                  <div className="form-row"><Label>Rating (1–5)</Label><Input type="number" min={1} max={5} value={editRow.rating} onChange={(e) => setEditRow({ ...editRow, rating: +e.target.value })} /></div>
                </div>
                <div className="form-row"><Label>Status</Label><Select value={editRow.communicationStatus || ''} onChange={(e) => setEditRow({ ...editRow, communicationStatus: e.target.value })}>
                  <option value="">— Select —</option>
                  <option value="CallReceived">Picked</option>
                  <option value="CallNotReceived">Not Picked</option>
                  <option value="MessageSent">Message Sent</option>
                </Select></div>
                <div className="form-row"><Label>Notes</Label><Textarea value={editRow.notes || ''} onChange={(e) => setEditRow({ ...editRow, notes: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button onClick={() => setEditRow(null)}>Cancel</Button>
                <Button variant="primary" disabled={update.isPending} onClick={() => update.mutate({ rating: editRow.rating, notes: editRow.notes, communicationStatus: editRow.communicationStatus || null, trainerId: editRow.trainerId || null, weekStart: editRow.weekStart })}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Log Activity dialog */}
        {activityRow && (
          <Dialog open onOpenChange={(v) => !v && setActivityRow(null)}>
            <DialogContent title={`Log activity — ${activityRow.client?.name}`}>
              <div className="space-y-3">
                <div style={{ fontSize: 12, color: 'var(--brand-textMuted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={12} /> Timestamp will be recorded automatically
                </div>
                <div className="form-row"><Label>Activity type *</Label>
                  <Select value={activityType} onChange={(e) => setActivityType(e.target.value)}>
                    <option value="Call">Call</option>
                    <option value="Message">Message</option>
                    <option value="Note">Note</option>
                  </Select>
                </div>
                <div className="form-row"><Label>Note (optional)</Label>
                  <Textarea value={activityNote} onChange={(e) => setActivityNote(e.target.value)} placeholder="What happened? Any details…" />
                </div>

                {/* Previous activities */}
                {activityRow.activities?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand-textMuted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Previous activity</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                      {activityRow.activities.map((a: any) => (
                        <div key={a.id} style={{ fontSize: 12, padding: '6px 10px', background: 'var(--bg-input)', borderRadius: 6, border: '1px solid var(--brand-borderSoft)' }}>
                          <span className="font-medium" style={{ color: a.type === 'Call' ? 'var(--status-green)' : a.type === 'Message' ? 'var(--status-amber)' : 'var(--brand-text)' }}>{a.type}</span>
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
                <Button variant="primary" disabled={logActivity.isPending} onClick={() => logActivity.mutate()}>
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
