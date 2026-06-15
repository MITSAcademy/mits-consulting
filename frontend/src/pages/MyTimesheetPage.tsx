import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/store/auth';
import { ChevronLeft, ChevronRight, Plus, Trash2, Edit2, Send, Check, X } from 'lucide-react';

function todayISO() { return new Date().toISOString().slice(0, 10); }
function addDays(d: string, n: number) {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
}
function weekRange(d: string) {
  const dt = new Date(d);
  const day = dt.getDay();
  const mon = new Date(dt);
  mon.setDate(dt.getDate() - ((day + 6) % 7));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) };
}
function weekDays(from: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(from, i));
}
const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'var(--brand-textMuted)' },
  submitted: { label: 'Pending', color: 'var(--status-amber)' },
  approved: { label: 'Approved', color: 'var(--status-green)' },
  rejected: { label: 'Rejected', color: 'var(--status-red)' },
};
function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.draft;
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: s.color, background: s.color + '22', border: `1px solid ${s.color}44` }}>
      {s.label}
    </span>
  );
}

export function MyTimesheetPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ jobCodeId: '', hours: '', description: '' });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ jobCodeId: '', hours: '', description: '' });

  const { data: allJobCodes = [] } = useQuery({
    queryKey: ['job-codes'],
    queryFn: () => api.get('/timesheet/job-codes').then((r) => r.data),
  });
  const jobCodes = allJobCodes.filter((jc: any) => jc.active);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['timesheet-entries', date, user?.id],
    queryFn: () => api.get('/timesheet/entries', { params: { date } }).then((r) => r.data),
    enabled: !!user,
  });

  const { from, to } = weekRange(date);
  const { data: weekEntries = [] } = useQuery({
    queryKey: ['timesheet-entries-week', from, to, user?.id],
    queryFn: () => api.get('/timesheet/entries', { params: { from, to } }).then((r) => r.data),
    enabled: !!user,
  });

  const inv = () => { qc.invalidateQueries({ queryKey: ['timesheet-entries'] }); };

  const createMut = useMutation({
    mutationFn: (d: any) => api.post('/timesheet/entries', d).then((r) => r.data),
    onSuccess: () => { inv(); setShowAdd(false); setAddForm({ jobCodeId: '', hours: '', description: '' }); },
  });
  const editMut = useMutation({
    mutationFn: ({ id, data }: any) => api.patch(`/timesheet/entries/${id}`, data).then((r) => r.data),
    onSuccess: () => { inv(); setEditId(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/timesheet/entries/${id}`).then((r) => r.data),
    onSuccess: () => inv(),
  });
  const submitMut = useMutation({
    mutationFn: (id: string) => api.post(`/timesheet/entries/${id}/submit`).then((r) => r.data),
    onSuccess: () => inv(),
  });

  const weekDaysList = weekDays(from);
  const dayTotals: Record<string, number> = {};
  for (const e of weekEntries) { dayTotals[e.date] = (dayTotals[e.date] || 0) + e.hours; }

  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <>
      <Topbar title="My Timesheet" />
      <Page>
        {/* Date nav */}
        <div className="card mb-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setDate(addDays(date, -1))}>
              <ChevronLeft size={16} />
            </Button>
            <input
              type="date"
              className="input text-sm"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ width: 160 }}
            />
            <Button variant="ghost" size="sm" onClick={() => setDate(addDays(date, 1))}>
              <ChevronRight size={16} />
            </Button>
            <span className="text-sm" style={{ color: 'var(--brand-textMuted)' }}>
              {new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <Button size="sm" className="ml-auto" onClick={() => setShowAdd(!showAdd)}>
              <Plus size={14} className="mr-1" /> Add entry
            </Button>
          </div>

          {/* Add form */}
          {showAdd && (
            <div className="mt-3 p-3 rounded-lg flex flex-wrap gap-2 items-end" style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}>
              <div style={{ minWidth: 180 }}>
                <div className="text-[11px] mb-1" style={{ color: 'var(--brand-textMuted)' }}>Job code</div>
                <select className="input text-sm" value={addForm.jobCodeId} onChange={(e) => setAddForm(f => ({ ...f, jobCodeId: e.target.value }))}>
                  <option value="">Select…</option>
                  {jobCodes.map((jc: any) => <option key={jc.id} value={jc.id}>{jc.code} – {jc.name}</option>)}
                </select>
              </div>
              <div style={{ width: 100 }}>
                <div className="text-[11px] mb-1" style={{ color: 'var(--brand-textMuted)' }}>Hours</div>
                <Input type="number" min="0.5" max="24" step="0.5" value={addForm.hours} onChange={(e) => setAddForm(f => ({ ...f, hours: e.target.value }))} placeholder="e.g. 2" />
              </div>
              <div className="flex-1" style={{ minWidth: 200 }}>
                <div className="text-[11px] mb-1" style={{ color: 'var(--brand-textMuted)' }}>Description</div>
                <Input value={addForm.description} onChange={(e) => setAddForm(f => ({ ...f, description: e.target.value }))} placeholder="What did you work on?" />
              </div>
              <Button size="sm" onClick={() => createMut.mutate({ date, ...addForm, hours: Number(addForm.hours) })} disabled={!addForm.jobCodeId || !addForm.hours || !addForm.description || createMut.isPending}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          )}
        </div>

        {/* Entries list */}
        <div className="card mb-4">
          <div className="card-h">Entries for {date}</div>
          {isLoading ? (
            <div className="p-4 text-sm" style={{ color: 'var(--brand-textMuted)' }}>Loading…</div>
          ) : entries.length === 0 ? (
            <div className="p-4 text-sm" style={{ color: 'var(--brand-textMuted)' }}>No entries for this date.</div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--brand-borderSoft)' }}>
              {entries.map((e: any) => (
                <div key={e.id} className="py-3 px-1">
                  {editId === e.id ? (
                    <div className="flex flex-wrap gap-2 items-end">
                      <div style={{ minWidth: 180 }}>
                        <select className="input text-sm" value={editForm.jobCodeId} onChange={(ev) => setEditForm(f => ({ ...f, jobCodeId: ev.target.value }))}>
                          {jobCodes.map((jc: any) => <option key={jc.id} value={jc.id}>{jc.code} – {jc.name}</option>)}
                        </select>
                      </div>
                      <div style={{ width: 100 }}>
                        <Input type="number" min="0.5" max="24" step="0.5" value={editForm.hours} onChange={(ev) => setEditForm(f => ({ ...f, hours: ev.target.value }))} />
                      </div>
                      <div className="flex-1" style={{ minWidth: 200 }}>
                        <Input value={editForm.description} onChange={(ev) => setEditForm(f => ({ ...f, description: ev.target.value }))} />
                      </div>
                      <Button size="sm" onClick={() => editMut.mutate({ id: e.id, data: { jobCodeId: editForm.jobCodeId, hours: Number(editForm.hours), description: editForm.description } })} disabled={editMut.isPending}>
                        <Check size={14} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditId(null)}><X size={14} /></Button>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 flex-wrap">
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded" style={{ background: 'var(--brand-accent)22', color: 'var(--brand-accent)', border: '1px solid var(--brand-accent)44' }}>
                        {e.jobCode.code}
                      </span>
                      <span className="text-sm font-semibold" style={{ color: 'var(--brand-text)' }}>{e.hours}h</span>
                      <span className="text-sm flex-1" style={{ color: 'var(--brand-text)' }}>{e.description}</span>
                      <StatusBadge status={e.status} />
                      {e.status === 'rejected' && e.rejectionNote && (
                        <div className="w-full text-xs mt-1 px-2 py-1 rounded" style={{ color: 'var(--status-red)', background: 'var(--status-red)11' }}>
                          Rejected: {e.rejectionNote}
                        </div>
                      )}
                      <div className="flex items-center gap-1 ml-auto">
                        {(e.status === 'draft' || e.status === 'rejected') && (
                          <>
                            <Button size="sm" variant="ghost" title="Edit" onClick={() => { setEditId(e.id); setEditForm({ jobCodeId: e.jobCodeId, hours: String(e.hours), description: e.description }); }}>
                              <Edit2 size={13} />
                            </Button>
                            <Button size="sm" variant="ghost" title="Delete" onClick={() => deleteMut.mutate(e.id)} disabled={deleteMut.isPending}>
                              <Trash2 size={13} />
                            </Button>
                          </>
                        )}
                        {(e.status === 'draft' || e.status === 'rejected') && (
                          <Button size="sm" title="Submit for approval" onClick={() => submitMut.mutate(e.id)} disabled={submitMut.isPending}>
                            <Send size={13} className="mr-1" /> {e.status === 'rejected' ? 'Re-submit' : 'Submit'}
                          </Button>
                        )}
                        {e.status === 'submitted' && (
                          <span className="text-xs" style={{ color: 'var(--brand-textMuted)' }}>Awaiting approval</span>
                        )}
                        {e.status === 'approved' && (
                          <span className="text-xs" style={{ color: 'var(--status-green)' }}>Approved by {e.approvedBy?.name}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Weekly summary */}
        <div className="card">
          <div className="card-h">Weekly summary ({from} – {to})</div>
          <div className="flex gap-3 flex-wrap mt-1">
            {weekDaysList.map((d, i) => (
              <button
                key={d}
                onClick={() => setDate(d)}
                className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors"
                style={{
                  border: d === date ? '2px solid var(--brand-accent)' : '1px solid var(--brand-borderSoft)',
                  background: d === date ? 'var(--brand-accent)11' : 'var(--bg-card)',
                  color: 'var(--brand-text)',
                }}
              >
                <span className="text-[11px]" style={{ color: 'var(--brand-textMuted)' }}>{dayLabels[i]}</span>
                <span className="text-sm font-bold">{dayTotals[d] ? `${dayTotals[d]}h` : '–'}</span>
              </button>
            ))}
            <div className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg ml-auto" style={{ border: '1px solid var(--brand-accent)44', background: 'var(--brand-accent)11' }}>
              <span className="text-[11px]" style={{ color: 'var(--brand-textMuted)' }}>Total</span>
              <span className="text-sm font-bold" style={{ color: 'var(--brand-accent)' }}>
                {weekDaysList.reduce((s, d) => s + (dayTotals[d] || 0), 0)}h
              </span>
            </div>
          </div>
        </div>
      </Page>
    </>
  );
}
