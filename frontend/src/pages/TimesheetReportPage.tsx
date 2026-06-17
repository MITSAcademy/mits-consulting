import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/store/auth';
import { useUI } from '@/store/ui';
import { Check, X, Plus, Pencil, CheckSquare, Square } from 'lucide-react';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(d: string, n: number) {
  const dt = new Date(d + 'T00:00:00');
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
    <span
      className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ color: s.color, background: s.color + '22', border: `1px solid ${s.color}44` }}
    >
      {s.label}
    </span>
  );
}

export function TimesheetReportPage() {
  const user = useAuth((s) => s.user);
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const [from, setFrom] = useState(() => addDays(todayISO(), -6));
  const [to, setTo] = useState(todayISO());
  const [filterUserId, setFilterUserId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showNewCode, setShowNewCode] = useState(false);
  const [codeForm, setCodeForm] = useState({ code: '', name: '', description: '', maxHoursPerDay: '' });
  const [editCode, setEditCode] = useState<{ id: string; code: string; name: string; description: string; maxHoursPerDay: string } | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRejectNote, setBulkRejectNote] = useState('');
  const [showBulkReject, setShowBulkReject] = useState(false);

  const { data: jobCodes = [], refetch: refetchCodes } = useQuery<any[]>({
    queryKey: ['job-codes-all'],
    queryFn: () => api.get('/timesheet/job-codes').then((r) => r.data),
  });

  const { data: allUsers = [] } = useQuery<any[]>({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users').then((r) => r.data),
  });

  const params: Record<string, string> = { from, to };
  if (filterUserId) params.userId = filterUserId;
  if (filterStatus) params.status = filterStatus;

  const { data: entries = [], isLoading } = useQuery<any[]>({
    queryKey: ['timesheet-entries-report', from, to, filterUserId, filterStatus],
    queryFn: () => api.get('/timesheet/entries', { params }).then((r) => r.data),
    enabled: !!user,
  });

  const { data: summary = [] } = useQuery<any[]>({
    queryKey: ['timesheet-summary', from, to],
    queryFn: () => api.get('/timesheet/summary', { params: { from, to } }).then((r) => r.data),
    enabled: !!user,
  });

  function inv() {
    qc.invalidateQueries({ queryKey: ['timesheet-entries-report'] });
    qc.invalidateQueries({ queryKey: ['timesheet-summary'] });
    qc.invalidateQueries({ queryKey: ['timesheet-entries'] });
  }

  const createCodeMut = useMutation({
    mutationFn: (d: any) => api.post('/timesheet/job-codes', d).then((r) => r.data),
    onSuccess: () => {
      refetchCodes();
      qc.invalidateQueries({ queryKey: ['job-codes-all'] });
      qc.invalidateQueries({ queryKey: ['job-codes'] });
      setShowNewCode(false);
      setCodeForm({ code: '', name: '', description: '', maxHoursPerDay: '' });
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
  const editCodeMut = useMutation({
    mutationFn: () => {
      if (!editCode) throw new Error('No edit code');
      const { id, name, description, maxHoursPerDay } = editCode;
      return api.patch(`/timesheet/job-codes/${id}`, {
        name,
        description,
        maxHoursPerDay: maxHoursPerDay ? Number(maxHoursPerDay) : null,
      }).then((r) => r.data);
    },
    onSuccess: () => {
      refetchCodes();
      qc.invalidateQueries({ queryKey: ['job-codes-all'] });
      qc.invalidateQueries({ queryKey: ['job-codes'] });
      setEditCode(null);
      showToast('Job code updated');
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
  const bulkMut = useMutation({
    mutationFn: ({ action, rejectionNote }: { action: 'approve' | 'reject'; rejectionNote?: string }) =>
      api.post('/timesheet/entries/bulk-approve', { ids: [...selectedIds], action, rejectionNote }).then((r) => r.data),
    onSuccess: (data) => {
      inv();
      setSelectedIds(new Set());
      setBulkRejectNote('');
      setShowBulkReject(false);
      showToast(`${data.updated} entr${data.updated === 1 ? 'y' : 'ies'} ${bulkMut.variables?.action === 'reject' ? 'rejected' : 'approved'}`);
    },
  });

  const canApprove = user?.role === 'manager';

  // Group entries by date
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
            <Button size="sm" onClick={() => setShowNewCode(!showNewCode)}>
              <Plus size={13} className="mr-1" /> New job code
            </Button>
          </div>

          {showNewCode && (
            <div
              className="mb-3 p-3 rounded-lg flex flex-wrap gap-2 items-end"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--brand-borderSoft)' }}
            >
              <div>
                <div className="text-[11px] mb-1" style={{ color: 'var(--brand-textMuted)' }}>Code</div>
                <Input
                  placeholder="MITS-001"
                  value={codeForm.code}
                  onChange={(e) => setCodeForm((f) => ({ ...f, code: e.target.value }))}
                  style={{ width: 120 }}
                />
              </div>
              <div className="flex-1" style={{ minWidth: 160 }}>
                <div className="text-[11px] mb-1" style={{ color: 'var(--brand-textMuted)' }}>Name</div>
                <Input
                  placeholder="Job code name"
                  value={codeForm.name}
                  onChange={(e) => setCodeForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="flex-1" style={{ minWidth: 160 }}>
                <div className="text-[11px] mb-1" style={{ color: 'var(--brand-textMuted)' }}>Description (optional)</div>
                <Input
                  placeholder="Description"
                  value={codeForm.description}
                  onChange={(e) => setCodeForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div>
                <div className="text-[11px] mb-1" style={{ color: 'var(--brand-textMuted)' }}>Max hrs/day (optional)</div>
                <Input
                  type="number"
                  placeholder="e.g. 4"
                  min={0.5}
                  step={0.5}
                  value={codeForm.maxHoursPerDay}
                  onChange={(e) => setCodeForm((f) => ({ ...f, maxHoursPerDay: e.target.value }))}
                  style={{ width: 110 }}
                />
              </div>
              <Button
                size="sm"
                onClick={() => {
                  const payload: any = { code: codeForm.code, name: codeForm.name, description: codeForm.description };
                  if (codeForm.maxHoursPerDay !== '') payload.maxHoursPerDay = Number(codeForm.maxHoursPerDay);
                  createCodeMut.mutate(payload);
                }}
                disabled={!codeForm.code || !codeForm.name || createCodeMut.isPending}
              >
                Create
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNewCode(false)}>Cancel</Button>
            </div>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--brand-borderSoft)', color: 'var(--brand-textMuted)' }}>
                <th className="text-left py-1.5 font-medium text-[11px]">Code</th>
                <th className="text-left py-1.5 font-medium text-[11px]">Name</th>
                <th className="text-left py-1.5 font-medium text-[11px]">Max hrs/day</th>
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
                  <td className="py-1.5 text-xs" style={{ color: 'var(--brand-textMuted)' }}>
                    {jc.maxHoursPerDay != null ? `${jc.maxHoursPerDay}h` : '—'}
                  </td>
                  <td className="py-1.5">
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                      style={{
                        color: jc.active ? 'var(--status-green)' : 'var(--brand-textMuted)',
                        background: jc.active ? 'rgba(34,197,94,0.12)' : 'rgba(148,163,184,0.12)',
                      }}
                    >
                      {jc.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-1.5 text-xs" style={{ color: 'var(--brand-textMuted)' }}>{jc.createdAt?.slice(0, 10)}</td>
                  <td className="py-1.5">
                    <div className="flex gap-1.5 items-center">
                      <button
                        className="text-xs px-2 py-0.5 rounded transition-colors"
                        style={{
                          color: jc.active ? 'var(--status-red)' : 'var(--status-green)',
                          border: `1px solid ${jc.active ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                        }}
                        onClick={() => patchCodeMut.mutate({ id: jc.id, data: { active: !jc.active } })}
                        disabled={patchCodeMut.isPending}
                      >
                        {jc.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        className="text-xs px-1.5 py-0.5 rounded transition-colors flex items-center gap-1"
                        style={{ color: 'var(--brand-textMuted)', border: '1px solid var(--brand-borderSoft)' }}
                        onClick={() => setEditCode({
                          id: jc.id,
                          code: jc.code,
                          name: jc.name,
                          description: jc.description || '',
                          maxHoursPerDay: jc.maxHoursPerDay != null ? String(jc.maxHoursPerDay) : '',
                        })}
                      >
                        <Pencil size={11} /> Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {jobCodes.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-3 text-sm text-center" style={{ color: 'var(--brand-textMuted)' }}>
                    No job codes yet.
                  </td>
                </tr>
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
                {allUsers.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
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

        {/* Entries table grouped by date */}
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
                  <div
                    className="flex items-center justify-between px-2 py-1.5 mb-1 rounded"
                    style={{ background: 'var(--bg-input)' }}
                  >
                    <span className="text-[12px] font-semibold" style={{ color: 'var(--brand-accent)' }}>{d}</span>
                    <span className="text-[12px] font-bold">{dayTotal}h total</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ color: 'var(--brand-textMuted)', borderBottom: '1px solid var(--brand-borderSoft)' }}>
                        {canApprove && (
                          <th className="py-1 pr-2 w-6">
                            {(() => {
                              const submittedIds = dayEntries.filter((e: any) => e.status === 'submitted').map((e: any) => e.id);
                              const allChecked = submittedIds.length > 0 && submittedIds.every((id: string) => selectedIds.has(id));
                              return (
                                <button
                                  onClick={() => {
                                    if (allChecked) {
                                      setSelectedIds((prev) => { const n = new Set(prev); submittedIds.forEach((id: string) => n.delete(id)); return n; });
                                    } else {
                                      setSelectedIds((prev) => { const n = new Set(prev); submittedIds.forEach((id: string) => n.add(id)); return n; });
                                    }
                                  }}
                                  style={{ color: 'var(--brand-textMuted)' }}
                                  disabled={submittedIds.length === 0}
                                >
                                  {allChecked ? <CheckSquare size={13} /> : <Square size={13} />}
                                </button>
                              );
                            })()}
                          </th>
                        )}
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
                          {canApprove && (
                            <td className="py-1.5 pr-2 w-6">
                              {e.status === 'submitted' && (
                                <button
                                  onClick={() => setSelectedIds((prev) => {
                                    const n = new Set(prev);
                                    n.has(e.id) ? n.delete(e.id) : n.add(e.id);
                                    return n;
                                  })}
                                  style={{ color: selectedIds.has(e.id) ? 'var(--brand-accent)' : 'var(--brand-textMuted)' }}
                                >
                                  {selectedIds.has(e.id) ? <CheckSquare size={13} /> : <Square size={13} />}
                                </button>
                              )}
                            </td>
                          )}
                          <td className="py-1.5">{e.user.name}</td>
                          <td className="py-1.5 font-mono text-[12px]" style={{ color: 'var(--brand-accent)' }}>{e.jobCode.code}</td>
                          <td className="py-1.5 font-semibold">{e.hours}h</td>
                          <td className="py-1.5 max-w-xs" style={{ maxWidth: 200 }}>
                            <span className="block truncate" title={e.description}>{e.description}</span>
                            {e.status === 'rejected' && e.rejectionNote && (
                              <span className="block text-[11px] mt-0.5" style={{ color: 'var(--status-red)' }}>
                                ↳ {e.rejectionNote}
                              </span>
                            )}
                          </td>
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
                                      style={{ width: 140, fontSize: 12, padding: '2px 6px' }}
                                    />
                                    <Button
                                      size="sm"
                                      onClick={() => rejectMut.mutate({ id: e.id, note: rejectNote })}
                                      disabled={!rejectNote || rejectMut.isPending}
                                    >
                                      <Check size={12} />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => { setRejectId(null); setRejectNote(''); }}
                                    >
                                      <X size={12} />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex gap-1">
                                    <Button
                                      size="sm"
                                      onClick={() => approveMut.mutate(e.id)}
                                      disabled={approveMut.isPending}
                                      style={{ background: 'var(--status-green)', color: 'white', border: 'none' }}
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => { setRejectId(e.id); setRejectNote(''); }}
                                      style={{ color: 'var(--status-red)' }}
                                    >
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

        {/* Per-person summary */}
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
                    <td className="py-1.5" style={{ color: 'var(--brand-textMuted)' }}>{s.draftCount || 0}</td>
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

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 flex items-center gap-3 px-6 py-3"
          style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--brand-border)' }}
        >
          <span className="text-sm font-semibold" style={{ color: 'var(--brand-textPrimary)', marginRight: 4 }}>
            {selectedIds.size} {selectedIds.size === 1 ? 'entry' : 'entries'} selected
          </span>
          <Button
            size="sm"
            onClick={() => bulkMut.mutate({ action: 'approve' })}
            disabled={bulkMut.isPending}
            style={{ background: 'var(--status-green)', color: 'white', border: 'none' }}
          >
            Approve all
          </Button>
          {showBulkReject ? (
            <div className="flex gap-1.5 items-center">
              <Input
                placeholder="Rejection note…"
                value={bulkRejectNote}
                onChange={(e) => setBulkRejectNote(e.target.value)}
                style={{ width: 200, fontSize: 12, padding: '2px 8px' }}
                autoFocus
              />
              <Button
                size="sm"
                onClick={() => bulkMut.mutate({ action: 'reject', rejectionNote: bulkRejectNote })}
                disabled={!bulkRejectNote || bulkMut.isPending}
                style={{ background: 'var(--status-red)', color: 'white', border: 'none' }}
              >
                <Check size={12} className="mr-1" /> Confirm
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowBulkReject(false); setBulkRejectNote(''); }}>
                <X size={12} />
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowBulkReject(true)}
              style={{ color: 'var(--status-red)', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              Reject all
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setSelectedIds(new Set()); setShowBulkReject(false); setBulkRejectNote(''); }}
            style={{ marginLeft: 'auto', color: 'var(--brand-textMuted)' }}
          >
            Clear
          </Button>
        </div>
      )}

      {/* Edit Job Code Modal */}
      {editCode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setEditCode(null)}
        >
          <div
            className="rounded-xl p-5 w-full max-w-md flex flex-col gap-3"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--brand-borderSoft)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold" style={{ color: 'var(--brand-textPrimary)' }}>
              Edit job code — <span className="font-mono" style={{ color: 'var(--brand-accent)' }}>{editCode.code}</span>
            </div>
            <div>
              <div className="text-[11px] mb-1" style={{ color: 'var(--brand-textMuted)' }}>Name *</div>
              <Input
                value={editCode.name}
                onChange={(e) => setEditCode((prev) => prev && ({ ...prev, name: e.target.value }))}
                placeholder="Job code name"
              />
            </div>
            <div>
              <div className="text-[11px] mb-1" style={{ color: 'var(--brand-textMuted)' }}>Description (optional)</div>
              <Input
                value={editCode.description}
                onChange={(e) => setEditCode((prev) => prev && ({ ...prev, description: e.target.value }))}
                placeholder="Description"
              />
            </div>
            <div>
              <div className="text-[11px] mb-1" style={{ color: 'var(--brand-textMuted)' }}>Max hrs/day (optional)</div>
              <Input
                type="number"
                min={0.5}
                step={0.5}
                value={editCode.maxHoursPerDay}
                onChange={(e) => setEditCode((prev) => prev && ({ ...prev, maxHoursPerDay: e.target.value }))}
                placeholder="e.g. 4"
                style={{ width: 120 }}
              />
            </div>
            <div className="flex gap-2 justify-end mt-1">
              <Button size="sm" variant="ghost" onClick={() => setEditCode(null)}>Cancel</Button>
              <Button
                size="sm"
                onClick={() => editCodeMut.mutate()}
                disabled={!editCode.name || editCodeMut.isPending}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
