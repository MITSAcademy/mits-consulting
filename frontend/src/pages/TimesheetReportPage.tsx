import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/store/auth';
import { Check, X, Plus } from 'lucide-react';

function todayISO() { return new Date().toISOString().slice(0, 10); }
function addDays(d: string, n: number) {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
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

export function TimesheetReportPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [from, setFrom] = useState(() => addDays(todayISO(), -6));
  const [to, setTo] = useState(todayISO());
  const [filterUserId, setFilterUserId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showNewCode, setShowNewCode] = useState(false);
  const [codeForm, setCodeForm] = useState({ code: '', name: '', description: '' });
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const { data: jobCodes = [], refetch: refetchCodes } = useQuery({
    queryKey: ['job-codes-all'],
    queryFn: () => api.get('/timesheet/job-codes').then((r) => r.data),
  });
  const { data: allUsers = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users').then((r) => r.data),
  });

  const params: Record<string, string> = { from, to };
  if (filterUserId) params.userId = filterUserId;
  if (filterStatus) params.status = filterStatus;

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['timesheet-entries-report', from, to, filterUserId, filterStatus],
    queryFn: () => api.get('/timesheet/entries', { params }).then((r) => r.data),
    enabled: !!user,
  });

  const { data: summary = [] } = useQuery({
    queryKey: ['timesheet-summary', from, to],
    queryFn: () => api.get('/timesheet/summary', { params: { from, to } }).then((r) => r.data),
    enabled: !!user,
  });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['timesheet-entries'] });
    qc.invalidateQueries({ queryKey: ['timesheet-entries-report'] });
    qc.invalidateQueries({ queryKey: ['timesheet-summary'] });
  };

  const createCodeMut = useMutation({
    mutationFn: (d: any) => api.post('/timesheet/job-codes', d).then((r) => r.data),
    onSuccess: () => {
      refetchCodes();
      qc.invalidateQueries({ queryKey: ['job-codes-all'] });
      qc.invalidateQueries({ queryKey: ['job-codes'] });
      setShowNewCode(false);
      setCodeForm({ code: '', name: '', description: '' });
    },
  });
  const patchCodeMut = useMutation({
    mutationFn: ({ id, data }: any) => api.patch(`/timesheet/job-codes/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      refetchCodes();
      qc.invalidateQueries({ queryKey: ['job-codes-all'] });
      qc.invalidateQueries({ queryKey: ['job-codes'] });
    },
  });
  const approveMut = useMutation({
    mutationFn: (id: string) => api.post(`/timesheet/entries/${id}/approve`).then((r) => r.data),
    onSuccess: () => inv(),
  });
  const rejectMut = useMutation({
    mutationFn: ({ id, note }: any) => api.post(`/timesheet/entries/${id}/reject`, { note }).then((r) => r.data),
    onSuccess: () => { inv(); setRejectId(null); setRejectNote(''); },
  });

  const canApprove = user?.role === 'manager';

  const byDate: Record<string, any[]> = {};
  for (const e of entries) { (byDate[e.date] = byDate[e.date] || []).push(e); }
  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  return (
    <>
      <Topbar title="Timesheet Report" />
      <Page>
        {/* Job Code Manager */}
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="card-h">Job Code Manager</div>
            <Button size="sm" onClick={() => setShowNewCode(!showNewCode)}><Plus size={13} className="mr-1" /> New job code</Button>
          </div>
          {showNewCode && (
            <div className="mb-3 p-3 rounded-lg flex flex-wrap gap-2 items-end" style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}>
              <div>
                <div className="text-[11px] mb-1" style={{ color: 'var(--brand-textMuted)' }}>Code</div>
                <Input placeholder="MITS-001" value={codeForm.code} onChange={(e) => setCodeForm(f => ({ ...f, code: e.target.value }))} style={{ width: 120 }} />
              </div>
              <div className="flex-1" style={{ minWidth: 160 }}>
                <div className="text-[11px] mb-1" style={{ color: 'var(--brand-textMuted)' }}>Name</div>
                <Input placeholder="Job code name" value={codeForm.name} onChange={(e) => setCodeForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="flex-1" style={{ minWidth: 160 }}>
                <div className="text-[11px] mb-1" style={{ color: 'var(--brand-textMuted)' }}>Description (optional)</div>
                <Input placeholder="Description" value={codeForm.description} onChange={(e) => setCodeForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <Button size="sm" onClick={() => createCodeMut.mutate(codeForm)} disabled={!codeForm.code || !codeForm.name || createCodeMut.isPending}>Create</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNewCode(false)}>Cancel</Button>
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--brand-borderSoft)', color: 'var(--brand-textMuted)' }}>
                <th className="text-left py-1.5 font-medium text-[11px]">Code</th>
                <th className="text-left py-1.5 font-medium text-[11px]">Name</th>
                <th className="text-left py-1.5 font-medium text-[11px]">Status</th>
                <th className="text-left py-1.5 font-medium text-[11px]">Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {jobCodes.map((jc: any) => (
                <tr key={jc.id} style={{ borderBottom: '1px solid var(--brand-borderSoft)' }}>
                  <td className="py-1.5 font-mono font-bold text-[12px]" style={{ color: 'var(--brand-accent)' }}>{jc.code}</td>
                  <td className="py-1.5">{jc.name}</td>
                  <td className="py-1.5">
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ color: jc.active ? 'var(--status-green)' : 'var(--brand-textMuted)', background: jc.active ? 'var(--status-green)22' : 'var(--brand-textMuted)22' }}>
                      {jc.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-1.5 text-xs" style={{ color: 'var(--brand-textMuted)' }}>{jc.createdAt?.slice(0, 10)}</td>
                  <td className="py-1.5">
                    <button
                      className="text-xs px-2 py-0.5 rounded transition-colors"
                      style={{ color: jc.active ? 'var(--status-red)' : 'var(--status-green)', border: `1px solid ${jc.active ? 'var(--status-red)' : 'var(--status-green)'}44` }}
                      onClick={() => patchCodeMut.mutate({ id: jc.id, data: { active: !jc.active } })}
                    >
                      {jc.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
              {jobCodes.length === 0 && (
                <tr><td colSpan={5} className="py-3 text-sm text-center" style={{ color: 'var(--brand-textMuted)' }}>No job codes yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Filters */}
        <div className="card mb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <div className="text-[11px] mb-1" style={{ color: 'var(--brand-textMuted)' }}>From</div>
              <input type="date" className="input text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <div className="text-[11px] mb-1" style={{ color: 'var(--brand-textMuted)' }}>To</div>
              <input type="date" className="input text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <div className="text-[11px] mb-1" style={{ color: 'var(--brand-textMuted)' }}>Team member</div>
              <select className="input text-sm" value={filterUserId} onChange={(e) => setFilterUserId(e.target.value)}>
                <option value="">All</option>
                {allUsers.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <div className="text-[11px] mb-1" style={{ color: 'var(--brand-textMuted)' }}>Status</div>
              <select className="input text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">All</option>
                <option value="draft">Draft</option>
                <option value="submitted">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>
        </div>

        {/* Entries table */}
        <div className="card mb-4">
          <div className="card-h mb-3">Entries</div>
          {isLoading ? (
            <div className="p-4 text-sm" style={{ color: 'var(--brand-textMuted)' }}>Loading…</div>
          ) : sortedDates.length === 0 ? (
            <div className="p-4 text-sm" style={{ color: 'var(--brand-textMuted)' }}>No entries for this range.</div>
          ) : (
            sortedDates.map((d) => {
              const dayEntries = byDate[d];
              const dayTotal = dayEntries.reduce((s: number, e: any) => s + e.hours, 0);
              return (
                <div key={d} className="mb-4">
                  <div className="flex items-center justify-between px-1 py-1.5 mb-1 rounded" style={{ background: 'var(--bg-input)' }}>
                    <span className="text-[12px] font-semibold" style={{ color: 'var(--brand-accent)' }}>{d}</span>
                    <span className="text-[12px] font-bold">{dayTotal}h total</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ color: 'var(--brand-textMuted)', borderBottom: '1px solid var(--brand-borderSoft)' }}>
                        <th className="text-left py-1 text-[11px] font-medium">Team member</th>
                        <th className="text-left py-1 text-[11px] font-medium">Job code</th>
                        <th className="text-left py-1 text-[11px] font-medium">Hours</th>
                        <th className="text-left py-1 text-[11px] font-medium">Description</th>
                        <th className="text-left py-1 text-[11px] font-medium">Status</th>
                        {canApprove && <th className="text-left py-1 text-[11px] font-medium">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {dayEntries.map((e: any) => (
                        <tr key={e.id} style={{ borderBottom: '1px solid var(--brand-borderSoft)' }}>
                          <td className="py-1.5">{e.user.name}</td>
                          <td className="py-1.5 font-mono text-[12px]" style={{ color: 'var(--brand-accent)' }}>{e.jobCode.code}</td>
                          <td className="py-1.5 font-semibold">{e.hours}h</td>
                          <td className="py-1.5 max-w-xs truncate">{e.description}</td>
                          <td className="py-1.5"><StatusBadge status={e.status} /></td>
                          {canApprove && (
                            <td className="py-1.5">
                              {e.status === 'submitted' && (
                                rejectId === e.id ? (
                                  <div className="flex gap-1 items-center">
                                    <Input
                                      placeholder="Rejection note…"
                                      value={rejectNote}
                                      onChange={(ev) => setRejectNote(ev.target.value)}
                                      style={{ width: 160, fontSize: 12 }}
                                    />
                                    <Button size="sm" onClick={() => rejectMut.mutate({ id: e.id, note: rejectNote })} disabled={!rejectNote || rejectMut.isPending}>
                                      <Check size={12} />
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => { setRejectId(null); setRejectNote(''); }}>
                                      <X size={12} />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex gap-1">
                                    <Button size="sm" onClick={() => approveMut.mutate(e.id)} disabled={approveMut.isPending} style={{ background: 'var(--status-green)', color: 'white' }}>
                                      Approve
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => { setRejectId(e.id); setRejectNote(''); }} style={{ color: 'var(--status-red)' }}>
                                      Reject
                                    </Button>
                                  </div>
                                )
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
        </div>

        {/* Summary card */}
        {summary.length > 0 && (
          <div className="card">
            <div className="card-h mb-3">Per-person summary ({from} – {to})</div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--brand-textMuted)', borderBottom: '1px solid var(--brand-borderSoft)' }}>
                  <th className="text-left py-1.5 font-medium text-[11px]">Team member</th>
                  <th className="text-left py-1.5 font-medium text-[11px]">Total hours</th>
                  <th className="text-left py-1.5 font-medium text-[11px]">Draft</th>
                  <th className="text-left py-1.5 font-medium text-[11px]">Pending</th>
                  <th className="text-left py-1.5 font-medium text-[11px]">Approved</th>
                  <th className="text-left py-1.5 font-medium text-[11px]">Rejected</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s: any) => (
                  <tr key={s.userId} style={{ borderBottom: '1px solid var(--brand-borderSoft)' }}>
                    <td className="py-1.5 font-medium">{s.userName}</td>
                    <td className="py-1.5 font-bold" style={{ color: 'var(--brand-accent)' }}>{s.totalHours}h</td>
                    <td className="py-1.5">{s.draftCount || 0}</td>
                    <td className="py-1.5" style={{ color: 'var(--status-amber)' }}>{s.submittedCount || 0}</td>
                    <td className="py-1.5" style={{ color: 'var(--status-green)' }}>{s.approvedCount || 0}</td>
                    <td className="py-1.5" style={{ color: 'var(--status-red)' }}>{s.rejectedCount || 0}</td>
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
