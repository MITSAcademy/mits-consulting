import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { TableProperties, Download, Filter, X, Check, Pencil, ChevronsUpDown } from 'lucide-react';
import { useState, useMemo, useRef, useEffect } from 'react';
import { todayISO } from '@/lib/utils';
import { useUI } from '@/store/ui';
import { useAuth } from '@/store/auth';

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function mondayOf(iso: string) {
  const d = new Date(iso);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtWeek(monday: string) {
  const end = addDays(monday, 6);
  const fmt = (s: string) =>
    new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${fmt(monday)} – ${fmt(end)}`;
}

/* ── Types ────────────────────────────────────────────────────────────────── */

type TrainerInfo = {
  id: string; name: string; email?: string;
  phoneCode?: string; phoneDigits?: string;
  bankHolderName?: string; bankName?: string; bankAccountNumber?: string;
  bankIfscCode?: string; bankBranchName?: string; bankAccountType?: string;
  upiId?: string; paymentMethod?: string;
};

type Log = {
  id: string; date: string; hours: number;
  rateSnapshot: number; amountInr: number;
  status: string; notes?: string; feedback?: string;
  proceed?: string | null; comments?: string | null;
  trainer: TrainerInfo;
  client?: { id: string; name: string } | null;
};

/* ── Status config ────────────────────────────────────────────────────────── */

const PAY_STATUS_CFG = {
  Paid:    { label: 'Paid',     color: '#22c55e', bg: 'rgba(34,197,94,0.13)'  },
  NotPaid: { label: 'Not Paid', color: '#ef4444', bg: 'rgba(239,68,68,0.13)'  },
  Hold:    { label: 'Hold',     color: '#fb923c', bg: 'rgba(251,146,60,0.13)' },
  Logged:  { label: '—',        color: '#64748b', bg: 'transparent'            },
} as const;

type PayStatus = keyof typeof PAY_STATUS_CFG;

function payLabel(status: string): string {
  return (PAY_STATUS_CFG as any)[status]?.label ?? status;
}
function payColor(status: string): string {
  return (PAY_STATUS_CFG as any)[status]?.color ?? '#64748b';
}
function payBg(status: string): string {
  return (PAY_STATUS_CFG as any)[status]?.bg ?? 'transparent';
}

const PROCEED_CFG = {
  Yes:  { label: 'Yes',  color: '#22c55e', bg: 'rgba(34,197,94,0.13)'  },
  No:   { label: 'No',   color: '#ef4444', bg: 'rgba(239,68,68,0.13)'  },
  Hold: { label: 'Hold', color: '#fb923c', bg: 'rgba(251,146,60,0.13)' },
} as const;

/* ── Inline editable cell ─────────────────────────────────────────────────── */

function EditableNumber({
  value, logId, field, prefix = '', onSaved,
}: {
  value: number; logId: string; field: string; prefix?: string; onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const showToast = useUI((s) => s.showToast);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const save = async () => {
    const num = parseFloat(draft);
    if (isNaN(num) || num === value) { setEditing(false); setDraft(String(value)); return; }
    try {
      await api.patch(`/session-logs/${logId}`, { [field]: num });
      onSaved();
    } catch {
      showToast('Failed to save', 'error');
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        className="input !py-0.5 !px-1.5 w-20 text-xs mono"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setDraft(String(value)); } }}
      />
    );
  }

  return (
    <button
      className="group flex items-center gap-1 hover:opacity-80"
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      title="Click to edit"
    >
      <span className="mono text-xs">{prefix}{value.toLocaleString()}</span>
      <Pencil size={9} className="opacity-0 group-hover:opacity-50" />
    </button>
  );
}

/* ── Inline editable text ─────────────────────────────────────────────────── */

function EditableText({
  value, logId, field, placeholder = 'Add comment…', onSaved,
}: {
  value?: string | null; logId: string; field: string; placeholder?: string; onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const showToast = useUI((s) => s.showToast);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const save = async () => {
    try {
      await api.patch(`/session-logs/${logId}`, { [field]: draft || null });
      onSaved();
    } catch {
      showToast('Failed to save', 'error');
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        className="input !py-0.5 !px-1.5 text-xs w-36"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
      />
    );
  }

  return (
    <button
      className="group flex items-center gap-1 text-left hover:opacity-80 max-w-[160px]"
      onClick={() => { setDraft(value || ''); setEditing(true); }}
      title={value || 'Click to add comment'}
    >
      <span className="text-[11px] truncate" style={{ color: value ? 'var(--brand-text)' : 'var(--brand-textMuted)' }}>
        {value || placeholder}
      </span>
      <Pencil size={9} className="flex-shrink-0 opacity-0 group-hover:opacity-50" />
    </button>
  );
}

/* ── Proceed selector ─────────────────────────────────────────────────────── */

function ProceedCell({ logId, value, onSaved }: { logId: string; value?: string | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const showToast = useUI((s) => s.showToast);

  const set = async (v: string | null) => {
    setOpen(false);
    try {
      await api.patch(`/session-logs/${logId}`, { proceed: v });
      onSaved();
    } catch {
      showToast('Failed to save', 'error');
    }
  };

  const cfg = value ? (PROCEED_CFG as any)[value] : null;

  return (
    <div className="relative inline-block">
      <button
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border cursor-pointer"
        style={{
          background: cfg?.bg ?? 'transparent',
          color: cfg?.color ?? 'var(--brand-textMuted)',
          borderColor: cfg?.color ? `${cfg.color}40` : 'var(--brand-border)',
        }}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
      >
        {cfg?.label ?? '— set —'}
        <ChevronsUpDown size={9} />
      </button>
      {open && (
        <div
          className="absolute z-50 mt-1 rounded-lg shadow-xl overflow-hidden"
          style={{ minWidth: 100, background: 'var(--bg-card)', border: '1px solid var(--brand-border)', top: '100%', left: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {Object.entries(PROCEED_CFG).map(([k, c]) => (
            <button
              key={k}
              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2"
              style={{ background: value === k ? c.bg : 'transparent', color: c.color }}
              onClick={() => set(k)}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
              {c.label}
              {value === k && <Check size={10} className="ml-auto" />}
            </button>
          ))}
          {value && (
            <button
              className="w-full text-left px-3 py-2 text-xs text-brand-textMuted border-t"
              style={{ borderColor: 'var(--brand-border)' }}
              onClick={() => set(null)}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Status cell (Samita / founder only) ──────────────────────────────────── */

function StatusCell({
  logId, value, canEdit, onSaved,
}: {
  logId: string; value: string; canEdit: boolean; onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const showToast = useUI((s) => s.showToast);

  const set = async (s: string) => {
    setOpen(false);
    try {
      await api.patch(`/session-logs/${logId}`, { status: s });
      onSaved();
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Failed', 'error');
    }
  };

  const pill = (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: payBg(value), color: payColor(value), border: `1px solid ${payColor(value)}33` }}
    >
      {payLabel(value)}
    </span>
  );

  if (!canEdit) return pill;

  return (
    <div className="relative inline-block">
      <button
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold cursor-pointer"
        style={{ background: payBg(value), color: payColor(value), border: `1px solid ${payColor(value)}33` }}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        title="Mark payment status"
      >
        {payLabel(value)}
        <ChevronsUpDown size={9} />
      </button>
      {open && (
        <div
          className="absolute z-50 mt-1 rounded-lg shadow-xl overflow-hidden"
          style={{ minWidth: 120, background: 'var(--bg-card)', border: '1px solid var(--brand-border)', top: '100%', left: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {(['Paid', 'NotPaid', 'Hold', 'Logged'] as PayStatus[]).map((s) => {
            const c = PAY_STATUS_CFG[s];
            return (
              <button
                key={s}
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2"
                style={{ background: value === s ? c.bg : 'transparent', color: c.color }}
                onClick={() => set(s)}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
                {c.label}
                {value === s && <Check size={10} className="ml-auto" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Export helpers ───────────────────────────────────────────────────────── */

function exportExcel(logs: Log[], weekLabel: string) {
  const header = ['Sr No', 'Date', 'Trainer', 'Client', 'Sessions', 'Rate ₹', 'Total ₹', 'Status', 'Proceed', 'Comments'].join('\t');
  const rows = logs.map((l, i) => [
    i + 1, l.date, l.trainer.name, l.client?.name || '—',
    l.hours, l.rateSnapshot, l.amountInr,
    payLabel(l.status), l.proceed || '—', l.comments || '',
  ].join('\t'));
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/tab-separated-values' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trainer-pay-sheet-${weekLabel.replace(/[^a-z0-9]/gi, '-')}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPdf(logs: Log[], weekLabel: string) {
  const totalAmount = logs.reduce((s, l) => s + l.amountInr, 0);
  const rows = logs.map((l, i) => `<tr>
    <td>${i + 1}</td>
    <td>${l.date}</td>
    <td>${l.trainer.name}</td>
    <td>${l.client?.name || '—'}</td>
    <td>${l.hours}</td>
    <td>₹${l.rateSnapshot.toLocaleString()}</td>
    <td>₹${l.amountInr.toLocaleString()}</td>
    <td style="color:${payColor(l.status)}">${payLabel(l.status)}</td>
    <td style="color:${l.proceed ? (PROCEED_CFG as any)[l.proceed]?.color : '#888'}">${l.proceed || '—'}</td>
    <td>${l.comments || '—'}</td>
  </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Trainer Pay Sheet — ${weekLabel}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 20px; }
    h1 { font-size: 15px; } p { color: #666; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f3f4f6; text-align: left; padding: 5px 7px; font-size: 10px; border: 1px solid #e5e7eb; }
    td { padding: 4px 7px; border: 1px solid #e5e7eb; font-size: 10px; }
    tr:nth-child(even) td { background: #fafafa; }
    tfoot td { background: #f3f4f6; font-weight: bold; }
  </style></head><body>
  <h1>MITS Trainer Payment Sheet</h1>
  <p>${weekLabel} · ${logs.length} entries · ₹${totalAmount.toLocaleString()} total</p>
  <table>
    <thead><tr>
      <th>Sr</th><th>Date</th><th>Trainer</th><th>Client</th>
      <th>Sessions</th><th>Rate</th><th>Total</th>
      <th>Status</th><th>Proceed</th><th>Comments</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td colspan="6" style="text-align:right">Grand Total</td>
      <td>₹${totalAmount.toLocaleString()}</td>
      <td colspan="3"></td>
    </tr></tfoot>
  </table>
  </body></html>`;

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); win.print(); }
}

/* ── Summary card ─────────────────────────────────────────────────────────── */

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: `${color}14`, border: `1px solid ${color}33` }}>
      <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--brand-textMuted)' }}>{label}</div>
      <div className="text-lg font-bold mono" style={{ color }}>{value}</div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export function TrainerPaySheetPage() {
  const user = useAuth((s) => s.user)!;
  // Only Samita (demo_lead) and founder can mark Paid / Not Paid
  const canMarkStatus = user.role === 'demo_lead' || user.role === 'founder';
  // Anyone with write access can edit Days, Amount, Proceed, Comments
  const canEdit = ['founder', 'manager', 'lead', 'accounts', 'payment_processor', 'demo_lead'].includes(user.role);

  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(mondayOf(todayISO()));
  const [showFilters, setShowFilters] = useState(false);
  const [filterTrainer, setFilterTrainer] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterProceed, setFilterProceed] = useState('');

  const { data: logs, isLoading } = useQuery({
    queryKey: ['session-logs', { weekStart }],
    queryFn: () => api.get('/session-logs', { params: { weekStart } }).then((r) => r.data as Log[]),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['session-logs'] });

  // Filter options
  const trainerOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of logs || []) m.set(l.trainer.id, l.trainer.name);
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [logs]);

  const clientOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of logs || []) if (l.client) m.set(l.client.id, l.client.name);
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [logs]);

  // Apply filters + sort by date then trainer
  const filtered = useMemo<Log[]>(() => {
    return (logs || [])
      .filter((l) => {
        if (filterTrainer && l.trainer.id !== filterTrainer) return false;
        if (filterClient && l.client?.id !== filterClient) return false;
        if (filterStatus && l.status !== filterStatus) return false;
        if (filterProceed && l.proceed !== filterProceed) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.trainer.name.localeCompare(b.trainer.name));
  }, [logs, filterTrainer, filterClient, filterStatus, filterProceed]);

  // Summary
  const totalAmount   = filtered.reduce((s, l) => s + l.amountInr, 0);
  const totalSessions = filtered.reduce((s, l) => s + l.hours, 0);
  const totalPending  = filtered.filter((l) => l.status !== 'Paid').reduce((s, l) => s + l.amountInr, 0);
  const uniqueTrainers = new Set(filtered.map((l) => l.trainer.id)).size;

  const activeFilterCount = [filterTrainer, filterClient, filterStatus, filterProceed].filter(Boolean).length;
  const hasFilters = activeFilterCount > 0;

  const prevWeek = () => setWeekStart(addDays(weekStart, -7));
  const nextWeek = () => setWeekStart(addDays(weekStart, 7));

  return (
    <>
      <Topbar
        title="Trainer payment sheet"
        subtitle={fmtWeek(weekStart)}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <button className="btn-icon" onClick={prevWeek} title="Previous week">‹</button>
            <input
              type="date"
              className="input !w-auto"
              value={weekStart}
              onChange={(e) => setWeekStart(mondayOf(e.target.value))}
            />
            <button className="btn-icon" onClick={nextWeek} title="Next week">›</button>
            <Button size="sm" variant={showFilters ? 'primary' : 'default'} onClick={() => setShowFilters(!showFilters)}>
              <Filter size={12} /> Filters
              {activeFilterCount > 0 && (
                <span className="ml-1 px-1.5 rounded-full text-[10px] text-[#1A1B1E] font-bold" style={{ background: 'var(--accent-gold)' }}>
                  {activeFilterCount}
                </span>
              )}
            </Button>
            {filtered.length > 0 && (
              <>
                <Button size="sm" onClick={() => exportExcel(filtered, fmtWeek(weekStart))}>
                  <Download size={12} /> Excel
                </Button>
                <Button size="sm" onClick={() => exportPdf(filtered, fmtWeek(weekStart))}>
                  <Download size={12} /> PDF
                </Button>
              </>
            )}
          </div>
        }
      />
      <Page>

        {/* ── Filters ───────────────────────────────────────────────── */}
        {showFilters && (
          <div className="card mb-4">
            <div className="card-h mb-3">
              <Filter size={13} /><span className="font-semibold">Filters</span>
              {hasFilters && (
                <button
                  className="ml-auto text-xs hover:underline flex items-center gap-1"
                  style={{ color: 'var(--brand-blue)' }}
                  onClick={() => { setFilterTrainer(''); setFilterClient(''); setFilterStatus(''); setFilterProceed(''); }}
                >
                  <X size={11} />Reset
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="label">Trainer</label>
                <select className="input" value={filterTrainer} onChange={(e) => setFilterTrainer(e.target.value)}>
                  <option value="">All trainers</option>
                  {trainerOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Client</label>
                <select className="input" value={filterClient} onChange={(e) => setFilterClient(e.target.value)}>
                  <option value="">All clients</option>
                  {clientOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Payment Status</label>
                <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="">All statuses</option>
                  <option value="Paid">Paid</option>
                  <option value="NotPaid">Not Paid</option>
                  <option value="Hold">Hold</option>
                  <option value="Logged">Logged (unmarked)</option>
                </select>
              </div>
              <div>
                <label className="label">Proceed</label>
                <select className="input" value={filterProceed} onChange={(e) => setFilterProceed(e.target.value)}>
                  <option value="">All</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                  <option value="Hold">Hold</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ── Summary cards ─────────────────────────────────────────── */}
        {(logs || []).length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <SummaryCard label="Total Trainers"    value={String(uniqueTrainers)}          color="#38bdf8" />
            <SummaryCard label="Total Sessions"    value={String(totalSessions)}           color="#eab308" />
            <SummaryCard label="Total Amount"      value={`₹${totalAmount.toLocaleString()}`} color="#22c55e" />
            <SummaryCard label="Pending Payment"   value={`₹${totalPending.toLocaleString()}`} color="#fb923c" />
          </div>
        )}

        {/* ── Table ─────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="muted text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={TableProperties}
            tone="grey"
            title={hasFilters ? 'No sessions match filters' : 'No sessions this week'}
            description={hasFilters
              ? 'Clear the filters above to see all entries.'
              : 'Navigate to a different week, or log sessions via Session logs.'}
          />
        ) : (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th className="w-8 text-center">Sr</th>
                  <th>Date</th>
                  <th>Trainer</th>
                  <th>Client</th>
                  <th title="Editable">Sessions {canEdit && <Pencil size={9} className="inline opacity-40" />}</th>
                  <th title="Editable">Rate ₹ {canEdit && <Pencil size={9} className="inline opacity-40" />}</th>
                  <th>Total ₹</th>
                  <th title={canMarkStatus ? 'Click to mark Paid / Not Paid' : 'Set by Samita'}>
                    Status {!canMarkStatus && <span className="muted text-[9px] normal-case font-normal">(Samita)</span>}
                  </th>
                  <th>Proceed</th>
                  <th title="Editable">Comments {canEdit && <Pencil size={9} className="inline opacity-40" />}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l, i) => (
                  <tr key={l.id}>
                    <td className="mono text-[11px] text-center muted">{i + 1}</td>
                    <td className="mono text-[12px]">{l.date}</td>
                    <td className="font-medium text-sm">{l.trainer.name}</td>
                    <td className="muted text-[12px]">{l.client?.name || '—'}</td>
                    <td>
                      {canEdit
                        ? <EditableNumber value={l.hours} logId={l.id} field="hours" onSaved={refresh} />
                        : <span className="mono text-xs">{l.hours}</span>}
                    </td>
                    <td>
                      {canEdit
                        ? <EditableNumber value={l.rateSnapshot} logId={l.id} field="rateSnapshot" prefix="₹" onSaved={refresh} />
                        : <span className="mono text-xs">₹{l.rateSnapshot.toLocaleString()}</span>}
                    </td>
                    <td className="mono font-semibold text-sm">₹{l.amountInr.toLocaleString()}</td>
                    <td>
                      <StatusCell logId={l.id} value={l.status} canEdit={canMarkStatus} onSaved={refresh} />
                    </td>
                    <td>
                      {canEdit
                        ? <ProceedCell logId={l.id} value={l.proceed} onSaved={refresh} />
                        : (l.proceed
                          ? <span className="text-xs font-semibold" style={{ color: (PROCEED_CFG as any)[l.proceed]?.color }}>{l.proceed}</span>
                          : <span className="muted text-[11px]">—</span>)}
                    </td>
                    <td>
                      {canEdit
                        ? <EditableText value={l.comments} logId={l.id} field="comments" onSaved={refresh} />
                        : <span className="text-[11px] muted">{l.comments || '—'}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--bg-input)' }}>
                  <td colSpan={6} className="text-right text-xs font-semibold pr-3">Grand Total</td>
                  <td className="mono font-bold" style={{ color: 'var(--status-green)' }}>₹{totalAmount.toLocaleString()}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Page>
    </>
  );
}
